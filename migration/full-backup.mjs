// Private administrative snapshots. Caller must stop ALL writers (including session
// touches/cron), keep the source frozen until completion, and retain secrets separately.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localRuntime, applyMigrations } from './d1-rehearsal.mjs';
import { privateDirectory } from '../scripts/local-paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qi = value => '"' + value.replaceAll('"', '""') + '"';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const internal = name => name.startsWith('sqlite_') || name.startsWith('_cf_');
const all = async (db, sql, params = []) => (await db.prepare(sql).bind(...params).all()).results;
function frozen(options) {
  if (options?.quiesced !== true || typeof options.source !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(options.source)) throw new Error('Explicit quiesced:true and opaque source label required; stop all writers first');
}
async function schema(db) {
  return (await all(db, "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name")).filter(row => !internal(row.name) && !internal(row.tbl_name));
}
export function validateBackup(backup) {
  if (backup?.format !== 'mealmatch-full-d1-v1' || !Array.isArray(backup.tables) || !Array.isArray(backup.schema)) throw new Error('Invalid full backup format');
  const { sha256, ...payload } = backup;
  if (sha256 !== digest(payload)) throw new Error('Full backup checksum mismatch');
  if (backup.schemaSha256 !== digest(backup.schema)) throw new Error('Full backup schema checksum mismatch');
  const names = backup.schema.filter(row => row.type === 'table').map(row => row.name);
  if (!names.includes('d1_migrations') || names.length !== backup.tables.length || new Set(names).size !== names.length || new Set(backup.tables.map(table=>table.name)).size!==names.length || backup.tables.some(table => !names.includes(table.name))) throw new Error('Full backup table inventory mismatch');
  return backup;
}
function safeInteger(value) {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Full backup refuses unsafe SQLite integer/rowid');
  return value;
}
function bytes(value) {
  if (typeof value !== 'string' || value.length % 2 !== 0 || !/^[0-9A-F]*$/.test(value)) throw new Error('Invalid full backup byte encoding');
  return new Uint8Array(Buffer.from(value, 'hex'));
}
async function readTable(db, name) {
  const columns = await all(db, `PRAGMA table_xinfo(${qi(name)})`);
  if (columns.some(column => ['rowid', '_rowid_', 'oid', '__full_rowid'].includes(column.name.toLowerCase()))) throw new Error('Shadowed rowid requires an explicit backup adapter');
  const tableSql = (await all(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [name]))[0].sql;
  if (/WITHOUT\s+ROWID|CREATE\s+VIRTUAL\s+TABLE/i.test(tableSql)) throw new Error('Non-rowid or virtual tables require an explicit backup adapter');
  const foreignKeys = await all(db, `PRAGMA foreign_key_list(${qi(name)})`);
  // Hex doubles bytes. Bound the TOTAL initial projection, then read remaining
  // bytes one cell at a time; even a valid near-2MiB source value stays below
  // D1's result-value/row limit. BLOB substr counts bytes, including NUL/BOM.
  const initialBytes = Math.max(1, Math.floor(32768 / Math.max(1, columns.length)));
  const chunkBytes = 65536;
  const projection = ["CAST(_rowid_ AS TEXT) AS __full_rowid", ...columns.flatMap((column, index) => [
    `typeof(${qi(column.name)}) AS ${qi('t' + index)}`,
    `CASE WHEN typeof(${qi(column.name)}) IN ('text','blob') THEN length(CAST(${qi(column.name)} AS BLOB)) ELSE NULL END AS ${qi('l' + index)}`,
    `CASE typeof(${qi(column.name)}) WHEN 'text' THEN hex(substr(CAST(${qi(column.name)} AS BLOB),1,${initialBytes})) WHEN 'blob' THEN hex(substr(${qi(column.name)},1,${initialBytes})) WHEN 'integer' THEN CAST(${qi(column.name)} AS TEXT) ELSE ${qi(column.name)} END AS ${qi('v' + index)}`,
  ])];
  // Candidate paging happens before the window calculation: SQLite must not scan
  // the rest of a large table for each page. Hex output is ASCII; generous JSON
  // and metadata overhead bounds the entire initial page below 1 MiB.
  const projectedBytes = `${256 + columns.length * 128} + ${columns.map(column => `CASE typeof(${qi(column.name)}) WHEN 'text' THEN 2*min(length(CAST(${qi(column.name)} AS BLOB)),${initialBytes}) WHEN 'blob' THEN 2*min(length(${qi(column.name)}),${initialBytes}) ELSE 32 END`).join(' + ') || '0'}`;
  const rows = [];
  let cursor = null;
  for (;;) {
    const found = await all(db, `WITH "__full_backup_candidates" AS MATERIALIZED (SELECT ${projection.join(',')},(${projectedBytes}) AS "__full_bytes" FROM ${qi(name)} ${cursor === null ? '' : 'WHERE _rowid_ > ?'} ORDER BY _rowid_ LIMIT 1000), "__full_backup_page" AS (SELECT *,SUM("__full_bytes") OVER (ORDER BY CAST(__full_rowid AS INTEGER) ROWS UNBOUNDED PRECEDING) AS "__full_total",ROW_NUMBER() OVER (ORDER BY CAST(__full_rowid AS INTEGER)) AS "__full_ordinal" FROM "__full_backup_candidates") SELECT * FROM "__full_backup_page" WHERE "__full_total" <= 1048576 OR "__full_ordinal" = 1 ORDER BY CAST(__full_rowid AS INTEGER)`, cursor === null ? [] : [Number(cursor)]);
    if (!found.length) break;
    for (const row of found) {
    cursor = safeInteger(row.__full_rowid);
    const values = [];
    for (let index = 0; index < columns.length; index++) {
      const type = row['t' + index]; let value = row['v' + index];
      if (type === 'integer') safeInteger(value);
      else if (type === 'real') { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Nonfinite full backup REAL'); }
      else if (type === 'text' || type === 'blob') {
        const length = row['l' + index];
        if (!Number.isSafeInteger(length) || length < 0 || bytes(value).length !== Math.min(length, initialBytes)) throw new Error('Invalid full backup byte length');
        for (let offset = initialBytes; offset < length; offset += chunkBytes) {
          const chunk = await all(db, `SELECT hex(substr(CAST(${qi(columns[index].name)} AS BLOB),?,?)) AS value FROM ${qi(name)} WHERE _rowid_ = ?`, [offset + 1, chunkBytes, Number(cursor)]);
          if (chunk.length !== 1 || bytes(chunk[0].value).length !== Math.min(chunkBytes, length - offset)) throw new Error('Source byte value changed during full backup');
          value += chunk[0].value;
        }
      }
      else if (type !== 'null' || value !== null) throw new Error('Unknown SQLite storage class');
      values.push({type, value});
    }
    rows.push({rowid: cursor, values});
    }
  }
  return {name, columns: columns.map(({name,hidden}) => ({name,hidden})), foreignKeys, rows};
}
export async function exportFull(db, options) {
  frozen(options);
  const structure = await schema(db);
  if(!structure.some(row=>row.type==='table'&&row.name==='d1_migrations')) throw new Error('Full backup source must contain the actual migration ledger');
  const tables = [];
  for (const row of structure.filter(row => row.type === 'table')) tables.push(await readTable(db, row.name));
  if (digest(await schema(db)) !== digest(structure)) throw new Error('Source schema changed during full backup');
  // Detect ordinary violations of the freeze; this is NOT a replacement for it.
  for (const table of tables) if (digest(await readTable(db, table.name)) !== digest(table)) throw new Error('Source data changed during full backup; keep source frozen and retry with a new file');
  if ((await all(db, 'PRAGMA foreign_key_check')).length) throw new Error('Full backup source has foreign-key violations');
  const payload = {format: 'mealmatch-full-d1-v1', source:options.source, exportedAt:new Date().toISOString(), schema:structure, schemaSha256:digest(structure), tables};
  return {...payload, sha256:digest(payload)};
}
export function insertionOrder(tables) {
  const pending = new Map(tables.map(table => [table.name, table])), done = new Set(), result = [];
  while (pending.size) {
    let changed = false;
    for (const [name,table] of pending) {
      const parents = table.foreignKeys.map(key => key.table);
      if (parents.some(parent => parent === name)) throw new Error('Self-referencing table requires an explicit restore strategy');
      if (parents.every(parent => done.has(parent))) {result.push(table);done.add(name);pending.delete(name);changed=true;}
    }
    if (!changed) throw new Error('Cyclic or missing foreign-key parent; full restore refused');
  }
  return result;
}
function boundValue(cell) {
  switch(cell?.type) {
    case 'null': if(cell.value!==null) throw new Error('Invalid null cell'); return {sql:'?',value:null};
    case 'integer': return {sql:'CAST(? AS INTEGER)',value:safeInteger(cell.value)};
    case 'real': if(typeof cell.value!=='number'||!Number.isFinite(cell.value)) throw new Error('Invalid REAL cell'); return {sql:'?',value:cell.value};
    case 'text': return {sql:'CAST(? AS TEXT)',value:bytes(cell.value)};
    case 'blob': return {sql:'?',value:bytes(cell.value)};
    default: throw new Error('Invalid typed cell');
  }
}
function insertionData(table, row) {
  safeInteger(row.rowid);
  if (!Array.isArray(row.values) || row.values.length !== table.columns.length) throw new Error('Invalid full backup row width');
  const writable = table.columns.map((column,index)=>({...column,index})).filter(column=>column.hidden===0);
  const cells = writable.map(column=>boundValue(row.values[column.index]));
  if(cells.length+1>100) throw new Error('Full restore column count exceeds D1 parameter envelope');
  return {sql:`INSERT INTO ${qi(table.name)}(_rowid_,${writable.map(column=>qi(column.name)).join(',')}) VALUES(CAST(? AS INTEGER),${cells.map(cell=>cell.sql).join(',')})`,params:[row.rowid,...cells.map(cell=>cell.value)]};
}
function insertStatement(db, table, row) {
  const {sql,params}=insertionData(table,row);
  return db.prepare(sql).bind(...params);
}
function jsonInsertionSql(table) {
  const writable=table.columns.map((column,index)=>({...column,index})).filter(column=>column.hidden===0);
  const expressions=writable.map(column=>{
    const cell=`json_extract(value,'$.values[${column.index}].value')`;
    return `CASE json_extract(value,'$.values[${column.index}].type') WHEN 'text' THEN CAST(unhex(${cell}) AS TEXT) WHEN 'blob' THEN unhex(${cell}) WHEN 'integer' THEN CAST(${cell} AS INTEGER) WHEN 'real' THEN CAST(${cell} AS REAL) ELSE NULL END`;
  });
  return `INSERT INTO ${qi(table.name)}(_rowid_,${writable.map(column=>qi(column.name)).join(',')}) SELECT CAST(json_extract(value,'$.rowid') AS INTEGER),${expressions.join(',')} FROM json_each(?)`;
}
export async function restoreFull(db, backup, options) {
  frozen(options); validateBackup(backup);
  if (digest(await schema(db)) !== backup.schemaSha256) throw new Error('Full restore requires exact migrated target schema');
  const order = insertionOrder(backup.tables);
  for(const table of order) {
    const actual = await readTable(db,table.name);
    if(digest(actual.columns)!==digest(table.columns)||digest(actual.foreignKeys)!==digest(table.foreignKeys)) throw new Error('Full restore table metadata mismatch');
    if(table.name==='d1_migrations') {
      const signature = value=>value.rows.map(row=>Object.fromEntries(value.columns.map((column,index)=>[column.name,row.values[index]]))).map(row=>({id:row.id,name:row.name}));
      if(digest(signature(actual))!==digest(signature(table))) throw new Error('Full restore migration ledger mismatch');
    } else if(actual.rows.length) throw new Error('Full restore refuses nonempty target');
    // Validation must stay pure: discarded D1 prepare/bind bridge proxies grow
    // with every source row and can exhaust the local restore runtime.
    for(const row of table.rows) insertionData(table,row); // Validate before first write.
  }
  try {
    for(const table of order) {
      if(table.name==='d1_migrations') await db.prepare('DELETE FROM d1_migrations').run();
      // A JSON parameter restores many short rows in one statement, avoiding a
      // prepare/bind bridge round trip for every ingredient. Typed hex preserves
      // arbitrary bytes; oversized individual rows retain the direct byte bind.
      const sql=jsonInsertionSql(table);
      let pending=[], size=2;
      const flush=async()=>{
        if(!pending.length)return;
        await db.batch([db.prepare(sql).bind('['+pending.join(',')+']')]);
        pending=[];size=2;
      };
      for(const row of table.rows) {
        const encoded=JSON.stringify(row),rowSize=Buffer.byteLength(encoded);
        if(rowSize+2>512*1024){await flush();await db.batch([insertStatement(db,table,row)]);continue;}
        if(pending.length&&(pending.length>=1000||size+rowSize+1>512*1024))await flush();
        size+=rowSize+(pending.length?1:0);pending.push(encoded);
      }
      await flush();
    }
    if((await all(db,'PRAGMA foreign_key_check')).length) throw new Error('Restored target foreign-key check failed');
    for(const table of order) if(digest(await readTable(db,table.name))!==digest(table)) throw new Error('Full restore comparison failed');
    return {ok:true,tables:order.length,rows:order.reduce((sum,table)=>sum+table.rows.length,0),sha256:backup.sha256};
  } catch(error) {throw new Error('Full restore failed; target is quarantined and must never be published or retried',{cause:error});}
}
export async function writeFullBackup(filename, backup) {
  validateBackup(backup);
  await writeFile(filename,JSON.stringify(backup),{flag:'wx',mode:0o600});
}
export async function exportLocalFull(directory,filename,options) {
  frozen(options);
  directory=await privateDirectory(root,directory,{existingOnly:true});
  const state=path.join(directory,'state/v3/d1');
  await privateDirectory(root,state,{existingOnly:true});
  const files=async folder=>{let count=0;for(const child of await readdir(folder,{withFileTypes:true})){if(child.isSymbolicLink())throw new Error('Redirected D1 files refused');if(child.isDirectory())count+=await files(path.join(folder,child.name));else if(child.name.endsWith('.sqlite'))count++;}return count;};
  if(await files(state)!==1)throw new Error('Full export requires exactly one existing local D1 database');
  filename=path.resolve(filename);
  await privateDirectory(root,path.dirname(filename));
  const runtime=localRuntime(directory);
  try {
    await runtime.ready;
    const backup=await exportFull(await runtime.getD1Database('DB'),options);
    await writeFullBackup(filename,backup);
    const fileSha256=createHash('sha256').update(await readFile(filename)).digest('hex');
    return {ok:true,tables:backup.tables.length,rows:backup.tables.reduce((sum,table)=>sum+table.rows.length,0),sha256:backup.sha256,fileSha256};
  } finally {await runtime.dispose();}
}
export async function restoreLocalFull(filename,label,expectedSha256) {
  if(!/^[a-zA-Z0-9_-]{1,90}$/.test(label)) throw new Error('Explicit isolated local restore label required');
  const content=await readFile(filename);
  if(createHash('sha256').update(content).digest('hex')!==expectedSha256) throw new Error('Portable full backup file checksum mismatch');
  const backup=validateBackup(JSON.parse(content));
  const parent=await privateDirectory(root,path.join(root,'.verification/migration/full-restores'));
  const directory=path.join(parent,label);await mkdir(directory);
  let runtime;
  try {
    await applyMigrations(directory);runtime=localRuntime(directory);await runtime.ready;
    const result=await restoreFull(await runtime.getD1Database('DB'),backup,{quiesced:true,source:label});
    await writeFile(path.join(directory,'RESTORED.private.json'),JSON.stringify(result),{flag:'wx',mode:0o600});
    return {...result,directory};
  } catch(error) {await writeFile(path.join(directory,'QUARANTINED.json'),JSON.stringify({ok:false,stage:'full-restore'}),{flag:'wx',mode:0o600});throw error;}
  finally {await runtime?.dispose();}
}

async function main() {
  const args=process.argv.slice(2), options={};
  for(let i=0;i<args.length;i++){if(args[i]==='--quiesced'){options.quiesced=true;continue;}if(!['--restore','--target','--sha256','--export-state','--output','--source'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Invalid full backup arguments');options[args[i].slice(2)]=args[++i];}
  if(options['export-state']){
    if(options.restore||options.target||!options.output)throw new Error('Export requires existing local state, new private output, source label and --quiesced');
    const result=await exportLocalFull(options['export-state'],options.output,{quiesced:options.quiesced,source:options.source});console.log(JSON.stringify(result));return;
  }
  if(!options.restore||!options.target||!options.sha256)throw new Error('Explicit restore file, isolated target and checksum required');
  const result=await restoreLocalFull(options.restore,options.target,options.sha256);console.log(JSON.stringify({ok:true,tables:result.tables,rows:result.rows}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(()=>{console.error('Full local backup/restore failed; preserve the source and inspect private target quarantine state.');process.exitCode=1;});
