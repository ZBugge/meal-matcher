import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createCipheriv, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalMiniflare as Miniflare } from '../scripts/local-emulator.mjs';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const bcrypt = require('../server/node_modules/bcryptjs');
const id = crypto.randomUUID();
const directory = path.join(root, '.verification/migration', `compatibility-${id}`);
const bundle = path.join(directory, 'bundle');
const assets = path.join(directory, 'assets');
const key = randomBytes(32);
const logEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(directory, 'wrangler.log') };
for (const name of Object.keys(logEnv)) if (/^(CLOUDFLARE_|CF_|NOTION_|DATABASE_PATH$|SESSION_SECRET$)/.test(name)) delete logEnv[name];
await mkdir(assets, { recursive: true });
await writeFile(path.join(assets, 'index.html'), '<!doctype html><title>MealMatch compatibility SPA</title><main>MealMatch</main>');
execFileSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--dry-run', '--config', path.join(root, 'compatibility/wrangler.jsonc'), '--outdir', bundle], { cwd: root, env: logEnv, stdio: 'pipe', timeout: 60000 });
const versions = Object.fromEntries(['wrangler', 'miniflare', 'workerd'].map(name => [name, require(`${name}/package.json`).version]));
let mf;
const create = () => new Miniflare({
  modules: true, scriptPath: path.join(bundle, 'worker.js'),
  compatibilityDate: '2025-09-15', compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: `local-proof-${id}` }, d1Persist: path.join(directory, 'd1'),
  bindings: { SYNTHETIC_KEY: key.toString('base64') },
  assets: { directory: assets, binding: 'ASSETS', routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true }, assetConfig: { not_found_handling: 'single-page-application' } },
});
const results = {};
test('actual bundled Express Worker, D1 and Static Assets compatibility', { timeout: 120000 }, async t => {
  const start = performance.now();
  mf = create();
  try {
    await mf.ready;
    let db = await mf.getD1Database('DB');
    const schema = [
      'CREATE TABLE proof_sessions(id TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0)',
      'CREATE TABLE parents(id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0)',
      'CREATE TABLE children(id TEXT PRIMARY KEY,parent TEXT NOT NULL REFERENCES parents(id),value TEXT NOT NULL)',
      'CREATE TABLE assertions(ok INTEGER NOT NULL CHECK(ok=1))',
      'CREATE TABLE staged(operation TEXT NOT NULL,ordinal INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(operation,ordinal))',
      'CREATE TABLE published(id TEXT PRIMARY KEY,value TEXT NOT NULL)',
      'CREATE TABLE receipts(operation TEXT PRIMARY KEY,digest TEXT NOT NULL)',
      'CREATE TABLE text_chunks(id TEXT NOT NULL,ordinal INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,ordinal))',
    ];
    await db.batch(schema.map(sql => db.prepare(sql)));
    const fetch = (pathname, options = {}) => mf.dispatchFetch(`http://localhost${pathname}`, options);
    const json = (pathname, body) => fetch(pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await t.test('5MiB parser, bounded rejection, forwarded async errors and JSON API 404s', async () => {
      const accepted = await json('/api/import', { text: 'x'.repeat(5 * 1024 * 1024 - 128) });
      assert.equal(accepted.status, 200);
      assert.equal((await accepted.json()).length, 5 * 1024 * 1024 - 128);
      assert.equal((await json('/api/import', { text: 'x'.repeat(5 * 1024 * 1024) })).status, 413);
      assert.equal((await fetch('/api/error')).status, 500);
      for (const pathname of ['/api', '/api/absent']) {
        const response = await fetch(pathname, { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } });
        assert.equal(response.status, 404);
        assert.match(response.headers.get('content-type'), /application\/json/);
        assert.equal(response.headers.get('cache-control'), 'no-store');
      }
    });
    await t.test('real Static Assets serves SPA deep links', async () => {
      for (const pathname of ['/', '/week', '/shopping', '/recipes', '/join/ABCDEF', '/results/synthetic']) {
        const response = await fetch(pathname, { headers: { Accept: 'text/html' } });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /text\/html/);
        assert.match(await response.text(), /MealMatch compatibility SPA/);
      }
    });
    let cookie;
    await t.test('durable session callbacks, regeneration, HTTPS cookies, forged proto refusal and revocation', async () => {
      const login = await json('/api/session', {});
      assert.equal(login.status, 200);
      cookie = login.headers.get('set-cookie').split(';')[0];
      assert.match(login.headers.get('set-cookie'), /HttpOnly/);
      assert.match(login.headers.get('set-cookie'), /SameSite=Lax/);
      assert.equal((await (await fetch('/api/session', { headers: { cookie } })).json()).authenticated, true);
      const secure = await mf.dispatchFetch('https://localhost/api/session', { method: 'POST', headers: { 'x-forwarded-proto': 'http' } });
      assert.match(secure.headers.get('set-cookie'), /; Secure/);
      const forged = await fetch('/api/session', { method: 'POST', headers: { 'x-forwarded-proto': 'https' } });
      assert.doesNotMatch(forged.headers.get('set-cookie'), /; Secure/);
      const regenerated = await fetch('/api/session', { method: 'POST', headers: { cookie } });
      const nextCookie = regenerated.headers.get('set-cookie').split(';')[0];
      assert.notEqual(nextCookie, cookie);
      assert.equal((await (await fetch('/api/session', { headers: { cookie } })).json()).authenticated, false);
      cookie = nextCookie;
      const malformedLogin = await json('/api/session', {});
      const malformedCookie = malformedLogin.headers.get('set-cookie').split(';')[0];
      const signedId = decodeURIComponent(malformedCookie.slice(malformedCookie.indexOf('=') + 1));
      const storedId = signedId.slice(2, signedId.lastIndexOf('.'));
      await db.prepare('UPDATE proof_sessions SET data=? WHERE id=?').bind('{', storedId).run();
      const rejected = await fetch('/api/session', { headers: { cookie: malformedCookie }, signal: AbortSignal.timeout(5000) });
      assert.equal(rejected.status, 500);
    });
    await t.test('legacy cost-10 bcrypt and AES-GCM host-AAD ciphertext', async () => {
      const legacyHash = await bcrypt.hash('synthetic-password', 10);
      const result = await (await json('/api/bcrypt', { legacyHash })).json();
      assert.equal(result.verified, true);
      assert.equal(result.createdUsable, true);
      assert.equal(result.cost, 10);
      results.bcryptWallMs = result.elapsedMs; // Wall time is not a hosted CPU measurement.
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(Buffer.from('mealmatch:notion:v1:synthetic-host'));
      const encrypted = Buffer.concat([cipher.update('synthetic-token-only'), cipher.final()]);
      const ciphertext = `v1.${nonce.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
      assert.equal((await (await json('/api/crypto', { hostId: 'synthetic-host', ciphertext })).json()).legacyCompatible, true);
      assert.equal((await json('/api/crypto', { hostId: 'other-host', ciphertext })).status, 500);
    });
    await t.test('real D1 FKs and late-statement rollback, zero-match guard and stale revisions', async () => {
      await db.prepare("INSERT INTO parents(id) VALUES ('p')").run();
      await assert.rejects(db.prepare("INSERT INTO children(id,parent,value) VALUES ('bad','missing','test')").run());
      await assert.rejects(db.batch([
        db.prepare("INSERT INTO children(id,parent,value) VALUES ('accepted','p','test')"),
        db.prepare('INSERT INTO assertions(ok) VALUES (0)'),
      ]));
      assert.equal((await db.prepare('SELECT count(*) AS n FROM children').first()).n, 0);
      for (const [parent, revision] of [['missing', 0], ['p', 1]]) {
        await assert.rejects(db.batch([
          db.prepare('INSERT INTO assertions(ok) VALUES (COALESCE((SELECT 1 FROM parents WHERE id=? AND revision=?),0))').bind(parent, revision),
          db.prepare("INSERT INTO children(id,parent,value) VALUES ('forbidden','p','test')"),
          db.prepare('DELETE FROM assertions'),
        ]));
      }
      assert.equal((await db.prepare('SELECT count(*) AS n FROM children').first()).n, 0);
    });
    await t.test('bounded JSON staging, hidden partials, atomic publication and operation receipt', async () => {
      const data = Array.from({ length: 1500 }, (_, n) => ({ id: `r${n}`, value: `Unicode 🍽 ${n}` }));
      const digest = createHash('sha256').update(JSON.stringify(data)).digest('hex');
      for (let i = 0; i < 3; i++) await db.prepare('INSERT INTO staged(operation,ordinal,body) VALUES (?,?,?)').bind('op', i, JSON.stringify(data.slice(i * 500, (i + 1) * 500))).run();
      assert.equal((await db.prepare('SELECT count(*) AS n FROM published').first()).n, 0);
      const publish = expected => db.batch([
        db.prepare('INSERT INTO assertions(ok) VALUES ((SELECT count(*) FROM staged WHERE operation=?)=?)').bind('op', expected),
        db.prepare("INSERT INTO published(id,value) SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.value') FROM staged s,json_each(s.body) j WHERE s.operation=?").bind('op'),
        db.prepare('INSERT INTO receipts(operation,digest) VALUES (?,?)').bind('op', digest),
        db.prepare('DELETE FROM assertions'),
      ]);
      await assert.rejects(publish(4));
      assert.equal((await db.prepare('SELECT count(*) AS n FROM published').first()).n, 0);
      await publish(3);
      assert.equal((await db.prepare('SELECT count(*) AS n FROM published').first()).n, 1500);
      await assert.rejects(publish(3)); // Duplicate transaction aborts; a caller reconciles receipt.
      assert.equal((await db.prepare('SELECT digest FROM receipts WHERE operation=?').bind('op').first()).digest, digest);
      results.bulk = { rows: 1500, chunks: 3, maximumBoundParameters: 3 };
    });
    await t.test('oversized TEXT compatibility needs chunk storage; lossless chunk reconstruction works', async () => {
      const value = '\ufeff'.concat('x'.repeat(31_998), '🍽', 'é'.repeat(1_100_000), '\0end');
      const chunks = [];
      for (let i = 0; i < value.length;) {
        let end = Math.min(i + 32000, value.length);
        if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end--;
        chunks.push(value.slice(i, end));
        i = end;
      }
      await db.batch(chunks.map((body, ordinal) => db.prepare('INSERT INTO text_chunks(id,ordinal,body) VALUES (?,?,?)').bind('large', ordinal, body)));
      const restored = await db.prepare('SELECT body FROM text_chunks WHERE id=? ORDER BY ordinal').bind('large').all();
      assert.equal(restored.results.map(row => row.body).join(''), value);
      results.chunkedTextBytes = Buffer.byteLength(value);
      try {
        await db.prepare('INSERT INTO published(id,value) VALUES (?,?)').bind('oversized-direct', value).run();
        results.localOversizedDirect = 'emulator accepts >2MB; hosted limit still applies';
      } catch { results.localOversizedDirect = 'emulator rejects >2MB'; }
    });
    await t.test('D1 state and login survive emulator restart; logout is durable', async () => {
      await mf.dispose();
      mf = create();
      await mf.ready;
      db = await mf.getD1Database('DB');
      assert.equal((await db.prepare('SELECT count(*) AS n FROM published WHERE id LIKE ?').bind('r%').first()).n, 1500);
      assert.equal((await (await fetch('/api/session', { headers: { cookie } })).json()).authenticated, true);
      assert.equal((await fetch('/api/session', { method: 'DELETE', headers: { cookie } })).status, 200);
      assert.equal((await (await fetch('/api/session', { headers: { cookie } })).json()).authenticated, false);
      assert.equal((await db.prepare('SELECT count(*) AS n FROM proof_sessions WHERE revoked=1').first()).n >= 1, true);
    });
  } finally {
    if (mf) await mf.dispose();
    results.elapsedMs = performance.now() - start;
    await writeFile(path.join(directory, 'report.json'), JSON.stringify({ versions, compatibilityDate: '2025-09-15', localOnly: true, results, cpuMeasured: false, candidateReady: false }, null, 2));
    console.log(JSON.stringify({ report: path.join(directory, 'report.json'), versions, ...results }));
  }
});
