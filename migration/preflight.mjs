import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDirectory } from '../scripts/local-paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'server/package.json'));
const initSqlJs = require('sql.js');
export const tables = ['hosts', 'meals', 'meal_ingredients', 'sessions', 'session_meals', 'participants', 'swipes', 'session_history', 'dinner_staples', 'recurring_groceries', 'login_sessions', 'plan_entries', 'shopping_items', 'notion_connections', 'notion_recipes'];
export const orderedTables = new Set(['dinner_staples', 'recurring_groceries', 'plan_entries', 'shopping_items']);
const hash = value => createHash('sha256').update(value).digest('hex');
const qi = value => '"' + value.replaceAll('"', '""') + '"';
export function rows(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const result = [];
    while (statement.step()) result.push(statement.getAsObject());
    return result;
  } finally { statement.free(); }
}
export function readTable(db, name) {
  const columns = rows(db, `PRAGMA table_info(${qi(name)})`).map(row => row.name);
  const select = columns.flatMap((column, i) => [
    `CASE typeof(${qi(column)}) WHEN 'text' THEN CAST(${qi(column)} AS BLOB) WHEN 'integer' THEN CAST(${qi(column)} AS TEXT) ELSE ${qi(column)} END AS ${qi(column)}`,
    `typeof(${qi(column)}) AS ${qi(`__type_${i}`)}`,
  ]);
  if (orderedTables.has(name)) select.unshift('CAST(rowid AS TEXT) AS __migration_rowid');
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const integer = value => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new Error('Unsafe SQLite integer requires a lossless integer import strategy');
    return parsed;
  };
  return rows(db, `SELECT ${select.join(',')} FROM ${qi(name)} ORDER BY rowid`).map(row => {
    const result = orderedTables.has(name) ? { __migration_rowid: integer(row.__migration_rowid) } : {};
    columns.forEach((column, i) => {
      const value = row[column];
      // sql.js text getters terminate at NUL. Read text bytes instead, preserving
      // embedded NULs; reject invalid UTF-8 rather than normalizing private data.
      const type = row[`__type_${i}`];
      result[column] = type === 'text' ? decoder.decode(value) : type === 'integer' ? integer(value) : value;
      if (typeof result[column] === 'number' && !Number.isFinite(result[column])) throw new Error('Nonfinite SQLite number');
    });
    return result;
  });
}
const normalizedSql = sql => sql.replace(/\s+/g, ' ').trim();
function tableDefinition(sql, name, legacy) {
  const start = sql.indexOf('(');
  const clauses = [];
  let depth = 0, quoted = '', clause = '', whitespace = false;
  for (let i = start + 1; i < sql.length; i++) {
    const char = sql[i];
    if (quoted) {
      clause += char;
      if (char === quoted) {
        if (sql[i + 1] === quoted) clause += sql[++i];
        else quoted = '';
      }
      continue;
    }
    if (/\s/.test(char)) { whitespace = true; continue; }
    if (whitespace && clause && char !== ',' && char !== ')') clause += ' ';
    whitespace = false;
    if (char === "'" || char === '"' || char === '`') quoted = char;
    if (char === '(') depth++;
    if (char === ')' && depth === 0 || char === ',' && depth === 0) {
      let definition = clause.trim();
      if (legacy && ['meals', 'sessions'].includes(name) && definition === 'host_id TEXT NOT NULL REFERENCES hosts(id)') definition = 'host_id TEXT REFERENCES hosts(id)';
      clauses.push(definition);
      clause = '';
      if (char === ')') return { clauses: clauses.sort(), suffix: sql.slice(i + 1).trim() };
      continue;
    }
    if (char === ')') depth--;
    clause += char;
  }
  throw new Error('Unsupported source table declaration');
}
function checkClauses(sql) {
  const result = [];
  const pattern = /\bCHECK\s*\(/ig;
  let match;
  while ((match = pattern.exec(sql))) {
    const start = pattern.lastIndex;
    let depth = 1, quoted = false, i = start;
    for (; i < sql.length && depth; i++) {
      if (sql[i] === "'") {
        if (quoted && sql[i + 1] === "'") { i++; continue; }
        quoted = !quoted;
      } else if (!quoted && sql[i] === '(') depth++;
      else if (!quoted && sql[i] === ')') depth--;
    }
    result.push(normalizedSql(sql.slice(start, i - 1)));
    pattern.lastIndex = i;
  }
  return result.sort();
}
function schemaSignature(db, name, legacy = false) {
  const columns = rows(db, `PRAGMA table_info(${qi(name)})`).map(({ name: column, type, notnull, dflt_value, pk }) => ({
    name: column, type, notnull: legacy && ['meals','sessions'].includes(name) && column === 'host_id' && notnull === 1 ? 0 : notnull, dflt_value, pk,
  })).sort((a, b) => a.name.localeCompare(b.name));
  const foreignKeys = rows(db, `PRAGMA foreign_key_list(${qi(name)})`).map(({ id: _id, ...rest }) => rest).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const indexes = rows(db, `PRAGMA index_list(${qi(name)})`).map(index => ({
    name: index.name, unique: index.unique, origin: index.origin, partial: index.partial,
    columns: rows(db, `PRAGMA index_info(${qi(index.name)})`).map(({ name }) => name),
    sql: rows(db, 'SELECT sql FROM sqlite_master WHERE type=\'index\' AND name=?', [index.name])[0]?.sql ?? null,
  })).map(index => ({ ...index, sql: index.sql && normalizedSql(index.sql) })).sort((a, b) => a.name.localeCompare(b.name));
  const sql = rows(db, 'SELECT sql FROM sqlite_master WHERE type=\'table\' AND name=?', [name])[0].sql;
  return JSON.stringify({ columns, foreignKeys, indexes, checks: checkClauses(sql), definition: tableDefinition(sql, name, legacy) });
}
export async function open(bytes) { const SQL = await initSqlJs(); return new SQL.Database(bytes); }
export async function baseline() { return readFile(path.join(root, 'cloudflare/migrations/0001_baseline.sql'), 'utf8'); }
export function canonical(records) {
  return hash(JSON.stringify(records.map(row => Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]]))).map(row => JSON.stringify(row)).sort()));
}

// No persistence, expiry pruning, source migrations, token decryption or private row logging.
export async function preflight(bytes) {
  const db = await open(bytes);
  const target = await open();
  try {
    target.run(await baseline());
    const found = rows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(row => row.name);
    const errors = [];
    if (rows(db, "SELECT name FROM sqlite_master WHERE type IN ('view','trigger')").length) errors.push('Unreviewed source views/triggers require schema resolution');
    for (const name of found) if (!tables.includes(name)) errors.push(`Unsupported source table: ${name}`);
    for (const name of tables) if (!found.includes(name)) errors.push(`Source schema needs a reviewed upgrade: missing ${name}`);
    if (errors.length) return { ok: false, errors, sourceSha256: hash(bytes) };
    for (const name of tables) {
      if (schemaSignature(db, name, true) !== schemaSignature(target, name)) errors.push(`Unreviewed schema difference: ${name}`);
    }
    if (errors.length) return { ok: false, errors, sourceSha256: hash(bytes) };
    let data;
    try { data = Object.fromEntries(tables.map(name => [name, readTable(db, name)])); }
    catch { return { ok: false, errors: ['Source values require lossless integer/UTF-8 resolution before import'], sourceSha256: hash(bytes) }; }
    const hosts = new Set(data.hosts.map(row => row.id));
    if ([...data.sessions, ...data.meals].some(row => row.host_id === null)) errors.push('Unproven null legacy ownership requires private resolution');
    const missingOwners = new Set([...data.sessions, ...data.meals].filter(row => row.host_id !== null && !hosts.has(row.host_id)).map(row => row.host_id));
    let transformedSessions = 0, transformedMeals = 0;
    for (const owner of missingOwners) {
      if (typeof owner !== 'string' || !/^temp_[a-f0-9]{64}$/.test(owner)) { errors.push('Unknown missing owner; private record resolution required'); continue; }
      const sessions = data.sessions.filter(row => row.host_id === owner);
      const meals = data.meals.filter(row => row.host_id === owner);
      const mealIds = new Set(meals.map(row => row.id));
      const token = owner.slice(5);
      const links = data.session_meals.filter(row => mealIds.has(row.meal_id));
      const linkedMeals = new Set(links.map(row => row.meal_id));
      const sessionLinks = sessions.length === 1 ? data.session_meals.filter(row => row.session_id === sessions[0].id) : [];
      const valid = sessions.length === 1 && meals.length > 0
        && meals.every(row => row.temporary === 1 && row.creator_token === token)
        && linkedMeals.size === meals.length && links.length === meals.length
        && links.every(row => row.session_id === sessions[0].id)
        && sessionLinks.length === meals.length && sessionLinks.every(row => mealIds.has(row.meal_id));
      if (!valid) { errors.push('Anonymous context incomplete or inconsistent; private resolution required'); continue; }
      for (const row of sessions) { row.host_id = null; transformedSessions++; }
      for (const row of meals) { row.host_id = null; transformedMeals++; }
    }
    const oversized = [];
    let referenceLiterals = 0;
    for (const name of tables) for (const row of data[name]) {
      // Conservative statement/value detection; no automatic truncation or limit changes.
      const bytes = Object.values(row).reduce((sum, value) => sum + (typeof value === 'string' ? Buffer.byteLength(value) : value instanceof Uint8Array ? value.byteLength : 8), 0);
      if (bytes >= 1_900_000) oversized.push(name);
      if (Object.values(row).some(value => typeof value === 'string' && /^\u001fmealmatch:text:[a-f0-9-]{36}:[a-f0-9]{64}$/.test(value))) referenceLiterals++;
    }
    if (oversized.length) errors.push(`Oversized values require chunk-backed storage before D1 import (${oversized.length} records)`);
    if (referenceLiterals) errors.push('Legacy reference-shaped literal text requires explicit escaping before D1 import');
    if (errors.length) return { ok: false, errors, sourceSha256: hash(bytes) };
    target.run('PRAGMA foreign_keys = ON');
    target.run('BEGIN');
    try {
      for (const name of tables) for (const row of data[name]) {
        const columns = Object.keys(row);
        target.run(`INSERT INTO ${qi(name)} (${columns.map(key => qi(key === '__migration_rowid' ? 'rowid' : key)).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, columns.map(key => row[key]));
      }
      target.run('COMMIT');
    } catch {
      target.run('ROLLBACK');
      return { ok: false, errors: ['Target constraints rejected source records; private resolution required'], sourceSha256: hash(bytes) };
    }
    const foreignKeyViolations = rows(target, 'PRAGMA foreign_key_check').length;
    const comparisons = tables.map(name => {
      const actual = readTable(target, name);
      return { table: name, count: data[name].length, expectedSha256: canonical(data[name]), actualSha256: canonical(actual), equal: canonical(data[name]) === canonical(actual) };
    });
    return { ok: foreignKeyViolations === 0 && comparisons.every(row => row.equal), sourceSha256: hash(bytes), transformations: { anonymousSessionOwners: transformedSessions, anonymousMealOwners: transformedMeals }, foreignKeyViolations, comparisons, data };
  } finally { db.close(); target.close(); }
}

// Separate safe SQL serialization for an explicitly selected, empty target. UTF-8 hex
// preserves quotes, newlines, embedded NULs and Unicode without shell interpolation.
export function sqlValue(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`;
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`;
  throw new Error('Unsupported SQLite value; refusing export');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--source') throw new Error('Usage: node migration/preflight.mjs --source <explicit-source-path> (read-only; no upload)');
  const source = path.resolve(args[1]);
  const before = await readFile(source);
  const result = await preflight(before);
  const { data: _privateData, ...report } = result;
  report.sourceUnchanged = hash(await readFile(source)) === report.sourceSha256;
  if (!report.sourceUnchanged) { report.ok = false; report.errors = [...(report.errors || []), 'Source changed during inspection; use a consistent snapshot']; }
  const directory = path.join(root, '.verification/migration');
  await privateDirectory(root, directory);
  const output = path.join(directory, `preflight-${Date.now()}.private.json`);
  await writeFile(output, JSON.stringify({ source, at: new Date().toISOString(), ...report }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ok: report.ok, sourceUnchanged: report.sourceUnchanged, report: output, transformations: report.transformations, errors: report.errors }));
  if (!report.ok) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Preflight failed; source was not modified. Check source path/schema privately.'); process.exitCode = 1; });
