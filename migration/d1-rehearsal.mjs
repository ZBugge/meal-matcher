// Administrative local-only rehearsal. No remote capability and no data-serving routes.
import { LocalMiniflare as Miniflare } from '../scripts/local-emulator.mjs';
import { mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDirectory } from '../scripts/local-paths.mjs';
import { baseline, canonical, preflight, tables, orderedTables, open as openSqlite, rows as sqliteRows } from './preflight.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localRoot = path.join(root, '.verification/migration/rehearsals');
const run = promisify(execFile);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const qi = value => '"' + value.replaceAll('"', '""') + '"';
const databaseId = '00000000-0000-0000-0000-000000000002';
const runtimeTables = ['mutation_assertions', 'mutation_receipts', 'operation_receipts', 'anonymous_operation_receipts', 'text_chunks', 'mutation_stages', 'mutation_chunks', 'session_tombstones', 'notion_leases', 'abuse_windows'];
let originalColumns;
async function baselineColumns() {
  return originalColumns ??= (async () => {
    const db = await openSqlite();
    try { db.run(await baseline()); return Object.fromEntries(tables.map(name => [name, sqliteRows(db, `PRAGMA table_info(${qi(name)})`).map(row => row.name)])); }
    finally { db.close(); }
  })();
}
async function assertFreshRuntime(db) {
  const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of results) {
    if (tables.includes(name) || name === 'd1_migrations' || name === '_cf_METADATA') continue;
    if (!runtimeTables.includes(name)) throw new Error('Unreviewed target table; refusing incomplete export');
    if ((await db.prepare(`SELECT count(*) AS n FROM ${qi(name)}`).first()).n !== 0) throw new Error('Baseline rehearsal cannot export live runtime state; use a full production backup');
  }
  const { results: columns } = await db.prepare('PRAGMA table_info(hosts)').all();
  for (const name of ['library_revision', 'plan_revision']) if (columns.some(column => column.name === name)) {
    if ((await db.prepare(`SELECT count(*) AS n FROM hosts WHERE ${qi(name)}<>0`).first()).n) throw new Error('Baseline rehearsal refuses live revision state');
  }
}

async function freshTarget(label) {
  if (!/^[a-zA-Z0-9_-]{1,90}$/.test(label)) throw new Error('Target must be an explicit local label, never a path or remote binding');
  await privateDirectory(root, localRoot);
  const resolved = await realpath(localRoot);
  if (resolved.toLowerCase() !== localRoot.toLowerCase()) throw new Error('Refusing a redirected local rehearsal directory');
  const target = path.join(localRoot, label);
  await mkdir(target); // Exclusive: never reuse, overwrite, empty or reset a target.
  return target;
}

export async function applyMigrations(target) {
  await privateDirectory(root, target);
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(target, 'wrangler.log') };
  for (const name of Object.keys(env)) if (/^(CLOUDFLARE_|CF_|NOTION_|DATABASE_PATH$|SESSION_SECRET$)/.test(name)) delete env[name];
  const { stdout } = await run(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', 'mealmatch-local-migration-rehearsal', '--local', '--persist-to', path.join(target, 'state'), '--config', path.join(root, 'cloudflare/wrangler.local.jsonc')], { cwd: root, env, timeout: 60000, maxBuffer: 1024 * 1024 });
  await writeFile(path.join(target, `migrations-${Date.now()}.log`), stdout, { flag: 'wx', mode: 0o600 });
}

export function localRuntime(target) {
  return new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("Not found",{status:404})}}', compatibilityDate: '2025-09-15', d1Databases: { DB: databaseId }, d1Persist: path.join(target, 'state/v3/d1') });
}

export async function readD1Table(db, name) {
  if (!tables.includes(name)) throw new Error('Unreviewed table');
  const { results: info } = await db.prepare(`PRAGMA table_info(${qi(name)})`).all();
  const columns = (await baselineColumns())[name];
  const added = info.filter(row => !columns.includes(row.name)).map(row => row.name);
  if (columns.some(column => !info.some(row => row.name === column)) || added.some(column => name !== 'hosts' || !['library_revision','plan_revision'].includes(column))) throw new Error('Unreviewed target columns');
  const projection = columns.flatMap((column, i) => [`CASE typeof(${qi(column)}) WHEN 'text' THEN CAST(${qi(column)} AS BLOB) WHEN 'integer' THEN CAST(${qi(column)} AS TEXT) ELSE ${qi(column)} END AS ${qi(column)}`, `typeof(${qi(column)}) AS ${qi(`__type_${i}`)}`]);
  if (orderedTables.has(name)) projection.unshift('CAST(rowid AS TEXT) AS __migration_rowid');
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const result = [];
  // Bound administrative result batches independently from a user's row count.
  for (let offset = 0;; offset += 10) {
    const { results } = await db.prepare(`SELECT ${projection.join(',')} FROM ${qi(name)} ORDER BY rowid LIMIT 10 OFFSET ?`).bind(offset).all();
    for (const row of results) {
      const decoded = {};
      if (orderedTables.has(name)) decoded.__migration_rowid = Number(row.__migration_rowid);
      columns.forEach((column, i) => {
        const type = row[`__type_${i}`];
        decoded[column] = type === 'text' ? decoder.decode(new Uint8Array(row[column])) : type === 'integer' ? Number(row[column]) : type === 'blob' ? new Uint8Array(row[column]) : row[column];
        if (type === 'integer' && !Number.isSafeInteger(decoded[column])) throw new Error('Unsafe target integer');
        if (typeof decoded[column] === 'number' && !Number.isFinite(decoded[column])) throw new Error('Nonfinite target number');
      });
      if (orderedTables.has(name) && !Number.isSafeInteger(decoded.__migration_rowid)) throw new Error('Unsafe target rowid');
      result.push(decoded);
    }
    if (results.length < 10) return result;
  }
}

export async function compareD1(db, data) {
  const comparisons = [];
  for (const table of tables) {
    const actual = await readD1Table(db, table);
    comparisons.push({ table, expectedCount: data[table].length, actualCount: actual.length, expectedSha256: canonical(data[table]), actualSha256: canonical(actual), equal: canonical(data[table]) === canonical(actual) });
  }
  const foreignKeys = await db.prepare('PRAGMA foreign_key_check').all();
  if (foreignKeys.results.length || !comparisons.every(row => row.equal)) throw new Error('D1 data comparison failed; target quarantined');
  return { comparisons, foreignKeyViolations: 0 };
}

export async function insertData(db, data) {
  for (const table of tables) {
    if ((await db.prepare(`SELECT count(*) AS n FROM ${qi(table)}`).first()).n !== 0) throw new Error('Refusing nonempty business target');
  }
  // This administrative load is deliberately not live. A failed chunk quarantines
  // the entire unpublished target, which is never retried or exposed automatically.
  for (const table of tables) {
    let statements = [], encodedBytes = 0;
    const flush = async () => {
      if (statements.length) await db.batch(statements);
      statements = []; encodedBytes = 0;
    };
    for (const row of data[table]) {
      const bytes = Buffer.byteLength(JSON.stringify(row));
      if (bytes > 16 * 1024 * 1024) throw new Error('Administrative record requires chunk-backed import');
      if (statements.length >= 100 || encodedBytes + bytes > 256 * 1024) await flush();
      const columns = Object.keys(row);
      const values = columns.map(column => row[column] instanceof Uint8Array ? row[column].buffer.slice(row[column].byteOffset, row[column].byteOffset + row[column].byteLength) : row[column]);
      statements.push(db.prepare(`INSERT INTO ${qi(table)} (${columns.map(column => qi(column === '__migration_rowid' ? 'rowid' : column)).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...values));
      encodedBytes += bytes;
    }
    await flush();
  }
}

function encodeData(data) {
  return Object.fromEntries(tables.map(table => [table, data[table].map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Uint8Array ? { type: 'blob', base64: Buffer.from(value).toString('base64') } : { type: value === null ? 'null' : typeof value, value }])))]));
}
function decodeData(encoded) {
  if (JSON.stringify(Object.keys(encoded).sort()) !== JSON.stringify([...tables].sort())) throw new Error('Backup table mismatch');
  return Object.fromEntries(tables.map(table => [table, encoded[table].map(row => Object.fromEntries(Object.entries(row).map(([key, cell]) => {
    if (cell.type === 'blob' && typeof cell.base64 === 'string') return [key, new Uint8Array(Buffer.from(cell.base64, 'base64'))];
    if (cell.type === 'null' && cell.value === null || cell.type === 'string' && typeof cell.value === 'string' || cell.type === 'number' && Number.isFinite(cell.value)) return [key, cell.value];
    throw new Error('Unsupported backup cell');
  })))]));
}

export async function rehearse(data, label, source = {}, beforeSuccess = async () => ({})) {
  const target = await freshTarget(label);
  let runtime;
  let stage = 'migrations';
  try {
    await applyMigrations(target);
    runtime = localRuntime(target);
    await runtime.ready;
    let db = await runtime.getD1Database('DB');
    const ledgerBefore = await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all();
    stage = 'repeat-migration-ledger';
    await runtime.dispose(); runtime = undefined;
    await applyMigrations(target); // Wrangler's actual ledger must make this a no-op.
    runtime = localRuntime(target); await runtime.ready;
    db = await runtime.getD1Database('DB');
    assertLedger(ledgerBefore, await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all());
    stage = 'business-import';
    await insertData(db, data);
    stage = 'source-target-comparison';
    const comparison = await compareD1(db, data);
    await assertFreshRuntime(db);
    stage = 'portable-export';
    const exported = {};
    for (const table of tables) exported[table] = await readD1Table(db, table);
    const payload = { format: 'mealmatch-private-d1-backup', version: 1, scope: 'baseline-business-only-no-live-runtime', baselineSha256: sha256(await baseline()), data: encodeData(exported) };
    const serialized = JSON.stringify(payload);
    const backup = path.join(target, 'portable.private.json');
    await writeFile(backup, serialized, { flag: 'wx', mode: 0o600 });
    stage = 'final-source-consistency';
    const consistency = await beforeSuccess();
    const report = { ok: true, localOnly: true, ...source, ...consistency, ...comparison, runtimeMetadata: 'Only empty runtime tables and fresh zero host revisions excluded; this is not a live production backup', migrationNames: ledgerBefore.results.map(row => row.name), repeatMigrationNoOp: true, backup, backupSha256: sha256(serialized), target };
    await writeFile(path.join(target, 'report.private.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    return report;
  } catch {
    await writeFile(path.join(target, 'QUARANTINED.json'), JSON.stringify({ ok: false, stage, reason: 'Rehearsal failed; preserve this target for private investigation. Do not retry/empty it.' }), { flag: 'wx', mode: 0o600 });
    throw new Error('Local rehearsal failed; target preserved and quarantined');
  } finally { if (runtime) await runtime.dispose(); }
}
function assertLedger(before, after) {
  if (!before.results.length || JSON.stringify(before.results) !== JSON.stringify(after.results)) throw new Error('Migration ledger did not remain unchanged on repeat');
}

export async function restore(backup, label, expectedSha256) {
  const serialized = await readFile(backup, 'utf8');
  if (!expectedSha256 || sha256(serialized) !== expectedSha256) throw new Error('Backup hash mismatch');
  const payload = JSON.parse(serialized);
  if (payload.format !== 'mealmatch-private-d1-backup' || payload.version !== 1 || payload.baselineSha256 !== sha256(await baseline())) throw new Error('Backup format/schema mismatch');
  return rehearse(decodeData(payload.data), label, { restoredFromSha256: expectedSha256 });
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--source', '--target', '--backup', '--sha256'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('Invalid explicit arguments');
    options[args[i]] = args[i + 1];
  }
  if (!options['--target'] || Boolean(options['--source']) === Boolean(options['--backup'])) throw new Error('Specify --target <new-local-label> and exactly one of --source or --backup');
  let result;
  if (options['--backup']) result = await restore(options['--backup'], options['--target'], options['--sha256']);
  else {
    const source = path.resolve(options['--source']);
    const bytes = await readFile(source);
    const inspected = await preflight(bytes);
    if (!inspected.ok) throw new Error('Source preflight refused import; run read-only preflight for a private report');
    if (sha256(await readFile(source)) !== inspected.sourceSha256) throw new Error('Source changed; use a consistent snapshot');
    result = await rehearse(inspected.data, options['--target'], { sourceSha256: inspected.sourceSha256, transformations: inspected.transformations }, async () => {
      if (sha256(await readFile(source)) !== inspected.sourceSha256) throw new Error('Source changed during rehearsal');
      return { sourceUnchanged: true };
    });
  }
  console.log(JSON.stringify({ ok: true, localOnly: true, target: result.target, tablesCompared: result.comparisons.length, foreignKeyViolations: result.foreignKeyViolations, backup: result.backup, backupSha256: result.backupSha256 }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Local migration/restore refused or failed. Source is read-only; existing targets are preserved. Inspect the private reports and resume with a new explicit local target.'); process.exitCode = 1; });
