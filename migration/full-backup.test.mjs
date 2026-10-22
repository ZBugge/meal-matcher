import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomBytes, randomUUID, createHash, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { exportFull, restoreFull, validateBackup, insertionOrder, writeFullBackup, restoreLocalFull } from './full-backup.mjs';
import { applyMigrations, localRuntime } from './d1-rehearsal.mjs';
import { startLocalWorker } from '../scripts/worker-local.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('full backup requires a freeze and topological parents; corrupted formats fail closed',async()=>{
  await assert.rejects(exportFull({},{}),/quiesced/);
  const parent={name:'parent',foreignKeys:[]},child={name:'child',foreignKeys:[{table:'parent'}]};
  assert.deepEqual(insertionOrder([child,parent]),[parent,child]);
  assert.throws(()=>insertionOrder([{name:'self',foreignKeys:[{table:'self'}]}]),/Self-referencing/);
  assert.throws(()=>insertionOrder([{name:'a',foreignKeys:[{table:'b'}]},{name:'b',foreignKeys:[{table:'a'}]}]),/Cyclic/);
  assert.throws(()=>validateBackup({format:'mealmatch-full-d1-v1',tables:[],schema:[],sha256:'bad'}),/checksum/);
});

test('actual D1 full runtime snapshot restores every table/column/rowid and serves private recipe', {timeout:120000}, async t=>{
  const base=path.join(root,'.verification/migration/full-backup-tests',randomUUID());
  await mkdir(base,{recursive:true});
  const source=path.join(base,'source'),target=path.join(base,'target');await mkdir(source);await mkdir(target);
  await applyMigrations(source);await applyMigrations(target);
  const original=localRuntime(source), restored=localRuntime(target);
  let portable;
  const stage=async(name,run)=>{
    let completed=false;
    await t.test(name,async child=>{await run(child);completed=true;});
    assert.ok(completed,'Required full-backup stage failed: '+name);
  };
  const key=randomBytes(32), nonce=randomBytes(12), token='synthetic-integration-token';
  const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from('mealmatch:notion:v1:h'));
  const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  const sealed=['v1',nonce.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.');
  const privateText='\ufeffbefore\0after 🍽 ½ cup\n'+'x'.repeat(70000);
  const sha=createHash('sha256').update(privateText).digest('hex');
  const largeText='\ufefflarge\0🍽'+ 'x'.repeat(1536*1024-32);
  const largeBlob=new Uint8Array(1536*1024);largeBlob.fill(173);largeBlob[0]=0;largeBlob[largeBlob.length-1]=255;
  const largeTextSha=createHash('sha256').update(largeText).digest('hex');
  const largeBlobSha=createHash('sha256').update(largeBlob).digest('hex');
  const ref=randomUUID();
  const secret=randomBytes(48).toString('base64');
  try {
    await Promise.all([original.ready,restored.ready]);
    const db=await original.getD1Database('DB'),targetDb=await restored.getD1Database('DB');
    const typed='CREATE TABLE backup_types(id TEXT PRIMARY KEY, text_value TEXT, blob_value BLOB, real_value REAL, int_value INTEGER)';
    await db.prepare(typed).run();await targetDb.prepare(typed).run();
    const commands=[
      ["INSERT INTO hosts(id,email,password_hash,library_revision,plan_revision) VALUES('h','fixture@example.test','synthetic-hash',9,7)"],
      ["INSERT INTO meals(id,host_id,title,instructions,notes,pick_count) VALUES('m','h','Private soup',?,'Private note',0.125)",['\u001fmealmatch:text:'+ref+':'+sha]],
      ["INSERT INTO meal_ingredients(id,meal_id,amount,ingredient,display_order) VALUES('i','m','½ cup','beans',0)"],
      ["INSERT INTO sessions(id,host_id,invite_code,status,selected_meal_id) VALUES('s','h','BACKUP','closed','m')"],
      ["INSERT INTO session_meals(id,session_id,meal_id,display_order) VALUES('sm','s','m',0)"],
      ["INSERT INTO participants(id,session_id,display_name,host_id,submitted) VALUES('p','s','Private voter','h',1)"],
      ["INSERT INTO swipes(id,participant_id,session_meal_id,vote) VALUES('sw','p','sm',2)"],
      ["INSERT INTO session_history(id,session_id,selected_meal_id) VALUES('history','s','m')"],
      ["INSERT INTO dinner_staples(rowid,id,host_id,title) VALUES(900,'d','h','Rice')"],
      ["INSERT INTO recurring_groceries(id,host_id,ingredient,amount) VALUES('r','h','Milk','one carton')"],
      ["INSERT INTO plan_entries(id,host_id,week,meal_id,kind,title) VALUES('e','h','2026-10-19','m','home','Soup')"],
      ["INSERT INTO shopping_items(id,host_id,week,entry_id,ingredient,state,recurring_id) VALUES('shop','h','2026-10-19','e','Milk','bought','r')"],
      ["INSERT INTO login_sessions(id,data,expires) VALUES('synthetic-session',?,?)",[JSON.stringify({cookie:{originalMaxAge:86400000,expires:new Date(Date.now()+86400000).toISOString(),httpOnly:true,secure:false,sameSite:'lax'},hostId:'h'}),Date.now()+86400000]],
      ["INSERT INTO notion_connections(host_id,token_ciphertext,data_source_id,source_url) VALUES('h',?,'source','https://example.test/source')",[sealed]],
      ["INSERT INTO notion_recipes(host_id,data_source_id,page_id,meal_id,source_url,content_hash) VALUES('h','source','page','m','https://example.test/recipe','hash')"],
      ["INSERT INTO text_chunks(ref,owner,ordinal,value,digest,chunk_count) VALUES(?,'h',0,?,?,2),(?,'h',1,?,?,2)",[ref,privateText.slice(0,60000),sha,ref,privateText.slice(60000),sha]],
      ["INSERT INTO mutation_stages(id,owner,expected_chunks,expected_rows,digest,expires) VALUES('stage','h',1,1,'hash',9999999999999)"],
      ["INSERT INTO mutation_chunks(stage_id,ordinal,value) VALUES('stage',0,'[{\"id\":\"pending\"}]')"],
      ["INSERT INTO mutation_assertions(id,ok) VALUES('assertion',1)"],
      ["INSERT INTO mutation_receipts(id,created_at) VALUES('receipt',123)"],
      ["INSERT INTO operation_receipts(host_id,key,scope,digest,response,created_at) VALUES('h','synthetic-operation-key','POST /api/plans/2026-10-19/entries','synthetic-digest','{\"week\":\"2026-10-19\",\"status\":201}',123)"],
      ["INSERT INTO anonymous_operation_receipts(key_hash,digest,response,created_at) VALUES('synthetic-hashed-key','synthetic-digest','{\"status\":200,\"body\":{\"creatorToken\":\"synthetic-only\"}}',123)"],
      ["INSERT INTO session_tombstones(id,revoked_at) VALUES('dead',123)"],
      ["INSERT INTO notion_leases(host_id,token,expires,revision) VALUES('h','synthetic-lease',9999999999999,11)"],
      ["INSERT INTO abuse_windows(key,window,count) VALUES('synthetic',123,2)"],
      ["INSERT INTO backup_types(rowid,id,text_value,blob_value,real_value,int_value) VALUES(444,'typed',?,?,0.125,9007199254740991)",['\ufeffBOM\0NUL🍽',new Uint8Array([0,1,255])]],
      ["INSERT INTO backup_types(rowid,id,text_value) VALUES(445,'large-text',?)",[largeText]],
      ["INSERT INTO backup_types(rowid,id,blob_value) VALUES(446,'large-blob',?)",[largeBlob]],
    ];
    for(const [sql,params=[]] of commands) await db.prepare(sql).bind(...params).run();
    for(let start=0;start<5000;start+=100) {
      await db.batch(Array.from({length:100},(_,offset)=>{
        const index=start+offset;
        return db.prepare("INSERT INTO meal_ingredients(id,meal_id,amount,ingredient,display_order) VALUES(?,'m','1 tsp','synthetic ingredient',?)").bind('page-'+index,index+1);
      }));
    }
    await stage('all runtime and ledger rows are captured with exact storage classes',async()=>{
      let ingredientQueries=0;
      const counted={prepare(sql){
        const statement=db.prepare(sql);
        if(!sql.startsWith('WITH "__full_backup_candidates"')||!sql.includes('FROM "meal_ingredients"')) return statement;
        return {bind(...params){const bound=statement.bind(...params);return {async all(){
          ingredientQueries++;
          const result=await bound.all();
          assert.ok(Buffer.byteLength(JSON.stringify(result.results))<=1048576,'aggregate initial projection exceeds 1 MiB');
          return result;
        }};}};
      }};
      portable=await exportFull(counted,{quiesced:true,source:'synthetic-live-runtime'});
      assert.equal(portable.tables.find(table=>table.name==='meal_ingredients').rows.length,5001);
      assert.ok(ingredientQueries<=14,`5001 ingredient rows required ${ingredientQueries} queries across both passes`);
      assert.ok(portable.tables.length>=25);
      for(const table of portable.tables) assert.ok(table.rows.length>0,table.name+' fixture missing');
      const types=portable.tables.find(table=>table.name==='backup_types');
      assert.equal(types.rows[0].rowid,'444');assert.equal(types.rows[0].values[4].type,'integer');
      for(const [id,index,expected] of [['large-text',1,largeTextSha],['large-blob',2,largeBlobSha]]) {
        const row=types.rows.find(row=>Buffer.from(row.values[0].value,'hex').toString('utf8')===id);
        assert.equal(createHash('sha256').update(Buffer.from(row.values[index].value,'hex')).digest('hex'),expected);
      }
      const broken=structuredClone(portable);broken.tables[0].rows=[];assert.throws(()=>validateBackup(broken),/checksum/);
      const duplicate=structuredClone(portable);duplicate.tables[1]=duplicate.tables[0];delete duplicate.sha256;duplicate.sha256=createHash('sha256').update(JSON.stringify(duplicate)).digest('hex');assert.throws(()=>validateBackup(duplicate),/inventory/);
    });
    await stage('bounded restore preserves FK order, exact ledger times and all typed row hashes',async()=>{
      assert.equal((await targetDb.prepare("SELECT hex(unhex('EFBBBF0041FF')) AS value").first()).value,'EFBBBF0041FF');
      let preparedInserts=0,ingredientInserts=0,firstBatch=true;
      const boundedTarget={
        prepare(sql){
          if(sql.startsWith('INSERT INTO '))preparedInserts++;
          if(sql.startsWith('INSERT INTO "meal_ingredients"'))ingredientInserts++;
          return targetDb.prepare(sql);
        },
        async batch(statements){
          if(firstBatch){assert.equal(preparedInserts,statements.length,'validation must not allocate discarded D1 statements');firstBatch=false;}
          return targetDb.batch(statements);
        },
      };
      const result=await restoreFull(boundedTarget,portable,{quiesced:true,source:'synthetic-empty-target'});assert.equal(result.ok,true);
      assert.ok(ingredientInserts<=10,`5001 ingredients required ${ingredientInserts} restore statements`);
      const after=await exportFull(targetDb,{quiesced:true,source:'synthetic-restored'});assert.deepEqual(after.tables,portable.tables);
      const types=await targetDb.prepare("SELECT hex(CAST(text_value AS BLOB)) AS text,hex(blob_value) AS blob,real_value,CAST(int_value AS TEXT) AS integer FROM backup_types WHERE id='typed'").first();
      assert.equal(types.text,Buffer.from('\ufeffBOM\0NUL🍽').toString('hex').toUpperCase());assert.equal(types.blob,'0001FF');assert.equal(types.real_value,0.125);assert.equal(types.integer,'9007199254740991');
      await assert.rejects(restoreFull(targetDb,portable,{quiesced:true,source:'nonempty-target'}),/nonempty/);
      const connection=await targetDb.prepare('SELECT token_ciphertext FROM notion_connections').first();
      const [,iv,tag,encrypted]=connection.token_ciphertext.split('.');const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));decipher.setAAD(Buffer.from('mealmatch:notion:v1:h'));decipher.setAuthTag(Buffer.from(tag,'base64url'));
      assert.equal(Buffer.concat([decipher.update(Buffer.from(encrypted,'base64url')),decipher.final()]).toString('utf8'),token);
    });
    await stage('exclusive private backup writing and schema guard refuse unsafe operations',async()=>{
      const filename=path.join(base,'full.private.json');await writeFullBackup(filename,portable);await assert.rejects(writeFullBackup(filename,portable),/EEXIST/);
      await assert.rejects(restoreLocalFull(filename,'../unsafe','0'.repeat(64)),/local restore label/);
      await assert.rejects(restoreLocalFull(filename,'hash-mismatch','0'.repeat(64)),/checksum/);
      await targetDb.prepare('ALTER TABLE backup_types ADD COLUMN changed TEXT').run();
      await assert.rejects(restoreFull(targetDb,portable,{quiesced:true,source:'schema-mismatch'}),/schema/);
      await targetDb.prepare('ALTER TABLE backup_types DROP COLUMN changed').run();
    });
    await stage('unsafe SQLite integer is refused before producing a misleading export',async()=>{
      await db.prepare("UPDATE backup_types SET int_value=9223372036854775807").run();await assert.rejects(exportFull(db,{quiesced:true,source:'unsafe-int'}),/unsafe SQLite integer/);
    });
  } finally {await Promise.all([original.dispose(),restored.dispose()]);}
  await stage('actual compiled Worker reads restored private recipe and excludes it from public results',async()=>{
    const active=await startLocalWorker({root,directory:target,migrate:false,secrets:{SESSION_SECRET:secret,NOTION_ENCRYPTION_KEY:key.toString('base64')}});
    try {
      const identity=await fetch(new URL('/api/deployment',active.url));assert.equal(identity.status,503);assert.equal(identity.headers.get('cache-control'),'no-store');assert.deepEqual(await identity.json(),{error:'Deployment identity unavailable'});
      const signature=createHmac('sha256',secret).update('synthetic-session').digest('base64').replace(/=+$/,'');
      const cookie='connect.sid='+encodeURIComponent('s:synthetic-session.'+signature);
      const response=await fetch(new URL('/api/meals/m',active.url),{headers:{cookie}});assert.equal(response.status,200);const recipe=await response.json();assert.equal(recipe.instructions.length,privateText.length);assert.equal(createHash('sha256').update(recipe.instructions).digest('hex'),sha);assert.equal(recipe.notes,'Private note');
      const publicResponse=await fetch(new URL('/api/results/s?host=true',active.url));assert.equal(publicResponse.status,200);const publicBody=JSON.stringify(await publicResponse.json());assert.ok(!publicBody.includes('Private voter'));assert.ok(!publicBody.includes('instructions'));assert.ok(!publicBody.includes('token_ciphertext'));
    } finally {await active.runtime.dispose();}
  });
});
