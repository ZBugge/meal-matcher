// Synthetic unit-test seed only. Wrangler exits before any state is fingerprinted.
import { createHash } from 'node:crypto';
import { mkdir, lstat, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationRoot, sourceFingerprint } from './worker-build.mjs';
import { privateDirectory } from './local-paths.mjs';
import { prepareLocalState } from './worker-local.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestName='empty-test-state.json';
const same=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
async function exclusiveDirectory(root,directory){
  directory=path.resolve(directory);
  await privateDirectory(root,path.dirname(directory));
  await mkdir(directory); // Never reuse a developer, preview, or previous test state.
  return privateDirectory(root,directory,{existingOnly:true});
}
async function stateFiles(directory){
  const entries=[];
  const walk=async(relative)=>{
    const absolute=path.join(directory,relative),info=await lstat(absolute);
    if(info.isSymbolicLink()||!same(await realpath(absolute),absolute))throw new Error('Redirected test state refused');
    if(info.isDirectory()){
      for(const name of (await readdir(absolute)).sort())await walk(path.join(relative,name));
    }else if(info.isFile())entries.push({path:relative.replaceAll('\\','/'),sha256:hash(await readFile(absolute))});
    else throw new Error('Special test state file refused');
  };
  await walk('');
  if(!entries.some(entry=>entry.path.endsWith('.sqlite')))throw new Error('Empty test template requires migrated D1 state');
  return entries;
}
async function fingerprints(root){
  const source=await sourceFingerprint(root);
  const migrations=source.files.filter(([name])=>name.startsWith('cloudflare/migrations/'));
  if(!migrations.length)throw new Error('Test template requires migration sources');
  return {sourceSha256:source.sha256,schemaSha256:hash(JSON.stringify(migrations))};
}
export async function prepareEmptyTestState(directory,{root=applicationRoot}={}){
  root=path.resolve(root);
  directory=await exclusiveDirectory(root,directory);
  const before=await fingerprints(root);
  await prepareLocalState(directory,{root}); // Child process has exited on return.
  if(JSON.stringify(await fingerprints(root))!==JSON.stringify(before))throw new Error('Sources changed preparing test template');
  const state=await privateDirectory(root,path.join(directory,'state'),{existingOnly:true});
  const payload={version:1,kind:'closed-empty-migrated-d1-test-state',...before,files:await stateFiles(state)};
  await writeFile(path.join(directory,manifestName),JSON.stringify({...payload,sha256:hash(JSON.stringify(payload))}),{flag:'wx',mode:0o600});
  return {directory,files:payload.files.length,...before};
}
export async function cloneEmptyTestState(root,template,directory,{verifiedSourceSha256}={}){
  root=path.resolve(root);
  template=await privateDirectory(root,template,{existingOnly:true});
  const relativeTarget=path.relative(template,path.resolve(directory));
  if(!relativeTarget||(!relativeTarget.startsWith('..')&&!path.isAbsolute(relativeTarget)))throw new Error('Test clone must stay outside its template');
  const manifestFile=path.join(template,manifestName);
  const info=await lstat(manifestFile);
  if(!info.isFile()||info.isSymbolicLink()||!same(await realpath(manifestFile),manifestFile))throw new Error('Redirected test manifest refused');
  const {sha256,...manifest}=JSON.parse(await readFile(manifestFile,'utf8'));
  if(manifest.version!==1||manifest.kind!=='closed-empty-migrated-d1-test-state'||hash(JSON.stringify(manifest))!==sha256)throw new Error('Invalid test template manifest');
  // startLocalWorker's initialization callback already verified every current
  // source/config/asset/Worker byte. Reuse that result rather than hashing all
  // source files twice per fixture. Direct administrative callers still verify.
  if(verifiedSourceSha256!==undefined){
    if(verifiedSourceSha256!==manifest.sourceSha256)throw new Error('Stale test template source/schema fingerprint');
  }else{
    const current=await fingerprints(root);
    if(current.sourceSha256!==manifest.sourceSha256||current.schemaSha256!==manifest.schemaSha256)throw new Error('Stale test template source/schema fingerprint');
  }
  const state=await privateDirectory(root,path.join(template,'state'),{existingOnly:true});
  if(JSON.stringify(await stateFiles(state))!==JSON.stringify(manifest.files))throw new Error('Changed test template state');
  directory=await exclusiveDirectory(root,directory);
  const target=await privateDirectory(root,path.join(directory,'state'));
  for(const entry of manifest.files){
    const filename=path.join(state,entry.path);
    await privateDirectory(root,path.dirname(filename),{existingOnly:true});
    const info=await lstat(filename);
    if(!info.isFile()||info.isSymbolicLink()||!same(await realpath(filename),filename))throw new Error('Redirected test state refused');
    const bytes=await readFile(filename);
    if(hash(bytes)!==entry.sha256)throw new Error('Test template changed during copy');
    const destination=path.join(target,entry.path);
    await privateDirectory(root,path.dirname(destination));
    await writeFile(destination,bytes,{flag:'wx',mode:0o600});
  }
  if(JSON.stringify(await stateFiles(target))!==JSON.stringify(manifest.files)||JSON.stringify(await stateFiles(state))!==JSON.stringify(manifest.files))throw new Error('Test template copy verification failed');
  return directory;
}

async function main(){
  const args=process.argv.slice(2);
  if(args[0]!=='--prepare'||!args[1]||(args.length!==2&&(args.length!==4||args[2]!=='--root')))throw new Error('Use --prepare <new-private-test-directory> [--root <checkout>]');
  console.log(JSON.stringify(await prepareEmptyTestState(args[1],{root:args[3]||applicationRoot})));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
