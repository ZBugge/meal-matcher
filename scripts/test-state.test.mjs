import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { LocalMiniflare as Miniflare } from './local-emulator.mjs';
import { applicationRoot, sourceFingerprint } from './worker-build.mjs';
import { prepareEmptyTestState, cloneEmptyTestState } from './test-state.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('test templates reject existing targets, stale sources, changed files and redirected state',async()=>{
  const root=path.join(applicationRoot,'.verification/test-state-guards',randomUUID());
  await mkdir(path.join(root,'cloudflare/migrations'),{recursive:true});
  await writeFile(path.join(root,'cloudflare/migrations/0001.sql'),'CREATE TABLE fixture(id TEXT)');
  const template=path.join(root,'.verification/template');
  const state=path.join(template,'state');await mkdir(state,{recursive:true});
  await writeFile(path.join(state,'synthetic.sqlite'),'synthetic guard bytes only');
  const source=await sourceFingerprint(root);
  const payload={version:1,kind:'closed-empty-migrated-d1-test-state',sourceSha256:source.sha256,schemaSha256:hash(JSON.stringify(source.files.filter(([name])=>name.startsWith('cloudflare/migrations/')))),files:[{path:'synthetic.sqlite',sha256:hash('synthetic guard bytes only')}]};
  await writeFile(path.join(template,'empty-test-state.json'),JSON.stringify({...payload,sha256:hash(JSON.stringify(payload))}));
  const target=path.join(root,'.verification/clone');
  await assert.rejects(cloneEmptyTestState(root,template,target,{verifiedSourceSha256:'different-verified-candidate'}),/Stale test template/);
  await cloneEmptyTestState(root,template,target);
  await assert.rejects(cloneEmptyTestState(root,template,target),/EEXIST/);
  await assert.rejects(prepareEmptyTestState(template,{root}),/EEXIST/);
  await assert.rejects(cloneEmptyTestState(root,template,path.join(root,'outside-private')),/Private local state/);
  await writeFile(path.join(state,'synthetic.sqlite'),'changed');
  await assert.rejects(cloneEmptyTestState(root,template,path.join(root,'.verification/changed')),/Changed test template/);
  await writeFile(path.join(state,'synthetic.sqlite'),'synthetic guard bytes only');
  const redirected=path.join(state,'redirected');
  await symlink(path.join(root,'cloudflare'),redirected,process.platform==='win32'?'junction':'dir');
  await assert.rejects(cloneEmptyTestState(root,template,path.join(root,'.verification/redirected')),/Redirected test state/);
  // Leave the harmless synthetic junction in ignored state; never traverse it.
  await writeFile(path.join(root,'cloudflare/migrations/0001.sql'),'changed migration');
  await assert.rejects(cloneEmptyTestState(root,template,path.join(root,'.verification/stale')),/Stale test template/);
});

test('actual closed migrated D1 seed clones remain empty and independent after fixture writes',{timeout:60000},async()=>{
  const base=path.join(applicationRoot,'.verification',`ts-${randomUUID().slice(0,8)}`);
  const template=path.join(base,'template');
  await prepareEmptyTestState(template);
  const config=JSON.parse(await readFile(path.join(applicationRoot,'wrangler.jsonc'),'utf8'));
  const binding=config.d1_databases.find(value=>value.binding==='DB');
  const open=directory=>new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:config.compatibility_date,d1Databases:{DB:binding.database_id},d1Persist:path.join(directory,'state/v3/d1')});
  const a=await cloneEmptyTestState(applicationRoot,template,path.join(base,'a'));
  const first=open(a);
  try{
    await first.ready;const db=await first.getD1Database('DB');
    assert.equal((await db.prepare('SELECT count(*) AS n FROM hosts').first()).n,0);
    await db.prepare("INSERT INTO hosts(id,email,password_hash) VALUES('synthetic-clone','clone@example.test','synthetic')").run();
    assert.equal((await db.prepare('SELECT count(*) AS n FROM hosts').first()).n,1);
  }finally{await first.dispose();}
  const b=await cloneEmptyTestState(applicationRoot,template,path.join(base,'b'));
  const second=open(b);
  try{
    await second.ready;const db=await second.getD1Database('DB');
    assert.equal((await db.prepare('SELECT count(*) AS n FROM hosts').first()).n,0);
    assert.ok((await db.prepare('SELECT count(*) AS n FROM d1_migrations').first()).n>0);
  }finally{await second.dispose();}
  // A third verified clone proves neither open fixture changed template bytes.
  await cloneEmptyTestState(applicationRoot,template,path.join(base,'after'));
});
