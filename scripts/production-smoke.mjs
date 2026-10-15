import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function stop(child, exited) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  if (await Promise.race([exited.then(() => true), delay(2000, false, { ref: false })])) return;
  child.kill('SIGKILL');
  assert(await Promise.race([exited.then(() => true), delay(2000, false, { ref: false })]), 'Production process did not stop');
}

async function smoke() {
  const started = Date.now();
  const directory = await mkdtemp(path.join(tmpdir(), 'mealmatch-production-'));
  let child;
  let exited;
  try {
    const port = await reservePort();
    const base = `http://127.0.0.1:${port}`;
    const environment = { ...process.env, NODE_ENV: 'production', PORT: String(port),
      DATABASE_PATH: path.join(directory, 'database.db'), SESSION_SECRET: randomUUID() };
    const html = await readFile(path.join(root, 'client/dist/index.html'), 'utf8');
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)].map(match => match[1]);
    assert(assets.some(asset => asset.endsWith('.js')), 'Compiled client has no JavaScript asset');
    child = spawn(process.execPath, [path.join(root, 'server/dist/index.js')], {
      cwd: root,
      env: environment,
      stdio: 'ignore', windowsHide: true,
    });
    let spawnError;
    exited = new Promise(resolve => {
      child.once('exit', resolve);
      child.once('error', error => { spawnError = error; resolve(); });
    });
    const request = (route, options = {}) => fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(3000) });
    const deadline = Date.now() + 15_000;
    while (true) {
      if (spawnError) throw new Error('Could not start compiled production server');
      assert(child.exitCode === null && child.signalCode === null, 'Compiled production server exited before readiness');
      try {
        const health = await request('/api/health');
        if (health.ok && (await health.json()).status === 'ok') break;
      } catch { /* The newly started process may not be listening yet. */ }
      assert(Date.now() < deadline, 'Compiled production server readiness timed out');
      await delay(50);
    }
    for (const route of ['/', '/join/SMOKE2', '/results/production-smoke']) {
      const response = await request(route);
      assert.equal(response.status, 200, `SPA route failed: ${route}`);
      assert.match(response.headers.get('content-type') ?? '', /text\/html/, 'SPA response must be HTML');
      assert.equal(await response.text(), html, `SPA route did not serve compiled index: ${route}`);
    }
    for (const asset of assets) {
      const url = new URL(asset, `${base}/`);
      assert.equal(url.origin, base, 'Compiled assets must be served by this production process');
      const response = await request(url.pathname + url.search);
      assert.equal(response.status, 200, 'Compiled asset request failed');
      assert.match(response.headers.get('content-type') ?? '', asset.includes('.css') ? /text\/css/ : /javascript/, 'Wrong compiled asset content type');
      assert((await response.arrayBuffer()).byteLength > 0, 'Compiled asset is empty');
    }
    const json = async (route, body, status = 200, headers = {}) => {
      const response = await request(route, body === undefined ? { headers } : {
        method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
      });
      assert.equal(response.status, status, `Unexpected production API status for ${route.split('?')[0]}`);
      assert.match(response.headers.get('content-type') ?? '', /application\/json/, 'Production API must return JSON');
      return response.json();
    };
    const created = await json('/api/quick-session', { creatorName: 'Smoke creator', mode: 'takeout', meals: [{ title: 'Thai' }, { title: 'Pizza' }] });
    assert.equal(created.session.mode, 'takeout');
    assert.equal(created.meals.length, 2);
    assert.equal(typeof created.creatorToken, 'string');
    assert(created.creatorToken.length >= 32, 'Anonymous creator credential missing');
    const joined = await json(`/api/join/${created.session.inviteCode}`, { displayName: 'Smoke guest' }, 201);
    assert.equal(joined.sessionId, created.session.id);
    assert.notEqual(joined.participantId, created.participantId);
    assert.deepEqual(joined.meals.map(meal => meal.id).sort(), created.meals.map(meal => meal.id).sort());
    const sessionId = created.session.id;
    for (const [participantId, votes] of [[created.participantId, [1, 0]], [joined.participantId, [2, 1]]]) {
      await json(`/api/swipes/${sessionId}`, { participantId, swipes: created.meals.map((meal, index) => ({ mealId: meal.id, vote: votes[index] })) });
    }
    const progress = await json(`/api/session-status/${sessionId}`);
    assert.equal(progress.participants.length, 2);
    assert(progress.participants.every(participant => participant.submitted === true), 'Production votes were not submitted');
    const closed = await json(`/api/close-session/${sessionId}`, { creatorToken: created.creatorToken });
    assert(closed.results.every(option => !('voters' in option)), 'Anonymous close response leaked voter identities');
    const result = await json(`/api/results/${sessionId}?host=true`);
    assert.equal(result.status, 'closed');
    assert.equal(result.isHost, false);
    assert.deepEqual(result.results.map(option => ({ title: option.title, yes: option.yesCount, maybe: option.maybeCount, total: option.totalVotes, percent: option.percentage })), [
      { title: 'Thai', yes: 1, maybe: 1, total: 2, percent: 100 },
      { title: 'Pizza', yes: 1, maybe: 0, total: 2, percent: 50 },
    ]);
    assert(result.results.every(option => !('voters' in option)), 'Public production results leaked voter identities');
    await json(`/api/swipes/${sessionId}`, { participantId: joined.participantId, swipes: [{ mealId: created.meals[0].id, vote: 0 }] }, 400);

    // Simulate the trusted HTTPS reverse proxy, and explicitly carry its Secure
    // cookie. The anonymous lifecycle above does not depend on HTTP cookies.
    const registration = await request('/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ email: 'production-smoke@example.test', password: randomUUID() }),
    });
    assert.equal(registration.status, 201, 'Production proxy registration failed');
    const cookie = registration.headers.get('set-cookie');
    assert(cookie, 'HTTPS proxy did not receive a session cookie');
    for (const attribute of [/;\s*Secure(?:;|$)/i, /;\s*HttpOnly(?:;|$)/i, /;\s*SameSite=Lax(?:;|$)/i]) {
      assert(attribute.test(cookie), 'Production session cookie lacks a required security attribute');
    }
    const account = await json('/api/auth/me', undefined, 200, { cookie: cookie.split(';')[0], 'x-forwarded-proto': 'https' });
    assert.equal(account.email, 'production-smoke@example.test', 'Production session cookie did not authenticate');
    await stop(child, exited);
    child = spawn(process.execPath, [path.join(root, 'server/dist/index.js')], { cwd: root, env: environment, stdio: 'ignore', windowsHide: true });
    let restartError;
    exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', error => { restartError = error; resolve(); }); });
    const restartDeadline = Date.now() + 15000;
    while (true) {
      assert(!restartError && child.exitCode === null && child.signalCode === null, 'Production restart failed');
      try { const health = await request('/api/health'); if (health.ok) break; } catch { /* starting */ }
      assert(Date.now() < restartDeadline, 'Production restart timed out');
      await delay(50);
    }
    const resumed = await json('/api/auth/me', undefined, 200, { cookie: cookie.split(';')[0], 'x-forwarded-proto': 'https' });
    assert.equal(resumed.email, 'production-smoke@example.test', 'Family login was lost after server restart');
    const manifest = await (await request('/manifest.webmanifest')).json();
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/week');
    for (const icon of manifest.icons) {
      const response = await request(icon.src);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /image\/png/);
    }
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${base}/quick`);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 10000 });
      const privateCached = await page.evaluate(async () => {
        const keys = await caches.keys();
        const urls = (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat();
        return urls.some(url => new URL(url).pathname.startsWith('/api/'));
      });
      assert.equal(privateCached, false, 'Service worker cached private API data');
      await context.setOffline(true);
      await page.goto(`${base}/week`);
      assert.match(await page.locator('h1').innerText(), /connection away/);
    } finally { await browser.close(); }
    return { success: true, elapsedMs: Date.now() - started, checks: ['compiled-spa', 'compiled-assets', 'anonymous-lifecycle', 'public-results', 'https-proxy-cookie', 'persistent-login-restart', 'pwa-installation-offline-fallback'] };
  } finally {
    try {
      if (child && exited) await stop(child, exited);
    } finally {
      const resolved = path.resolve(directory);
      assert.equal(path.dirname(resolved), path.resolve(tmpdir()), 'Refusing cleanup outside temporary directory');
      assert(path.basename(resolved).startsWith('mealmatch-production-'), 'Refusing cleanup of unrelated directory');
      await rm(resolved, { recursive: true, force: true });
    }
  }
}

try {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--output'), 'Usage: node scripts/production-smoke.mjs [--output path]');
  const result = await smoke();
  if (args.length) await writeFile(path.resolve(args[1]), `${JSON.stringify(result)}\n`);
  console.log(JSON.stringify(result));
} catch (error) {
  // Assertions contain only synthetic counts/status, never credentials or response bodies.
  console.error(`Production smoke failed: ${error.message}`);
  process.exitCode = 1;
}
