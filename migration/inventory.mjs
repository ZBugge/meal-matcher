// Read-only M0 inventory. Reports schema/counts/hashes, never row contents or credentials.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDirectory } from '../scripts/local-paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'server/package.json'));
const initSqlJs = require('sql.js');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const SQL = await initSqlJs();
const sources = process.argv.slice(2);
if (!sources.length) throw new Error('Supply explicit source paths; no source is selected automatically.');
const result = [];
for (const input of sources) {
  const source = path.resolve(input);
  const before = await readFile(source);
  const db = new SQL.Database(before);
  try {
    const rows = sql => {
      const query = db.exec(sql)[0];
      return query ? query.values.map(values => Object.fromEntries(query.columns.map((name, i) => [name, values[i]]))) : [];
    };
    const tables = rows("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const schema = rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name");
    const report = { source, bytes: before.length, modified: (await stat(source)).mtime.toISOString(), sha256: digest(before), schemaSha256: digest(JSON.stringify(schema)), tables: [], foreignKeyViolations: rows('PRAGMA foreign_key_check').length };
    for (const table of tables) {
      report.tables.push({ name: table.name, count: rows(`SELECT count(*) AS n FROM ${quote(table.name)}`)[0].n, columns: rows(`PRAGMA table_info(${quote(table.name)})`).map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk })), foreignKeys: rows(`PRAGMA foreign_key_list(${quote(table.name)})`) });
    }
    const key = `${source}.notion-key`;
    try { const metadata = await stat(key); report.keyRecovery = { path: key, bytes: metadata.size, present: metadata.isFile() }; } catch { report.keyRecovery = { present: false }; }
    report.sourceUnchanged = digest(await readFile(source)) === report.sha256;
    if (!report.sourceUnchanged) throw new Error('Source changed during read-only inventory; repeat on a consistent snapshot.');
    result.push(report);
  } finally { db.close(); }
}
const directory = path.join(root, '.verification/migration');
await privateDirectory(root, directory);
const output = path.join(directory, `source-inventory-${Date.now()}.private.json`);
await writeFile(output, JSON.stringify({ at: new Date().toISOString(), sourceSelection: 'UNRESOLVED: candidate inventories only; no imports authorized by this tool', databases: result }, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ report: output, sources: result.length, unchanged: result.every(row => row.sourceUnchanged), tables: result.map(row => ({ count: row.tables.length, foreignKeyViolations: row.foreignKeyViolations })) }));
