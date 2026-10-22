import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDirectory } from './local-paths.mjs';
import { assertWorkerHost } from './legacy-host-guard.mjs';

const execute = promisify(execFile);
export const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clientHash = source => hash(JSON.stringify(source.files.filter(([name]) => name.startsWith('client/'))));
const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const inputs = ['client/src', 'client/public', 'server/src', 'cloudflare', 'scripts', 'e2e', 'migration', 'compatibility', '.github/workflows'];
const topLevel = ['package.json', 'package-lock.json', 'railway.json', 'build.sh', 'wrangler.jsonc', 'playwright.config.ts', 'playwright.verify.config.ts', 'client/package.json', 'client/package-lock.json', 'client/vite.config.ts', 'client/vite.config.js', 'client/vitest.config.ts', 'client/eslint.config.js', 'client/tsconfig.json', 'client/tsconfig.node.json', 'client/index.html', 'client/tailwind.config.js', 'client/postcss.config.js', 'server/package.json', 'server/package-lock.json', 'server/tsconfig.json', 'server/tsconfig.runtime.json', 'server/vitest.config.ts', 'docs/cloudflare-test-baseline.json', 'docs/cloudflare-test-mappings.json', 'docs/cloudflare-client-test-baseline.json', 'docs/cloudflare-browser-test-baseline.json'];
async function rejectImplicitBuildEnvironment(root) {
  for (const directory of [root, path.join(root, 'client'), path.join(root, 'server')]) {
    const files = await readdir(directory);
    if (files.some(name => /^\.env(?:\.|$)/.test(name) && !name.endsWith('.example'))) throw new Error('Release builds refuse implicit .env files; preserve them and use an isolated checkout with Worker bindings');
  }
}
// Bound filesystem pressure across large scans, and drain active reads before
// surfacing an error. Hash ordering is established only after all reads finish.
async function readBounded(names, action) {
  let next = 0, failed = false;
  const results = await Promise.allSettled(Array.from({ length: Math.min(8, names.length) }, async () => {
    while (!failed && next < names.length) {
      const name = names[next++];
      try { await action(name); }
      catch (error) { failed = true; throw error; }
    }
  }));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}
export async function sourceFingerprint(root = applicationRoot) {
  root = await realpath(root);
  const entries = [];
  const filenames = [];
  const add = async name => {
    try {
      const filename = path.join(root, name);
      if ((await lstat(filename)).isSymbolicLink() || !same(await realpath(filename), filename)) throw new Error('Source inputs must not be redirected');
      entries.push([name.replaceAll('\\', '/'), hash(await readFile(filename))]);
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
  const walk = async directory => {
    let children;
    try {
      const absolute = path.join(root, directory);
      if ((await lstat(absolute)).isSymbolicLink() || !same(await realpath(absolute), absolute)) throw new Error('Source inputs must not be redirected');
      children = await readdir(absolute, { withFileTypes: true });
    }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const child of children) {
      const name = path.join(directory, child.name);
      if (child.isSymbolicLink()) throw new Error('Source inputs must not be redirected through symlinks');
      if (child.isDirectory()) {
        if (!['node_modules', 'dist', '.verification', '.wrangler', '.git'].includes(child.name)) await walk(name);
      } else if (child.isFile()) filenames.push(name);
    }
  };
  for (const input of inputs) await walk(input);
  await readBounded([...filenames, ...topLevel], add);
  entries.sort(([a], [b]) => a.localeCompare(b));
  return { sha256: hash(JSON.stringify(entries)), files: entries };
}
export async function assetFingerprint(root = applicationRoot) {
  const entries = [];
  const filenames = [];
  const directory = path.join(root, 'client/dist');
  const physicalDirectory = path.join(await realpath(root), 'client/dist');
  if ((await lstat(directory)).isSymbolicLink() || !same(await realpath(directory), physicalDirectory)) throw new Error('Compiled assets must not be redirected');
  const walk = async relative => {
    for (const child of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      if (child.isSymbolicLink()) throw new Error('Compiled assets must not be redirected');
      const name = path.join(relative, child.name);
      if (child.isDirectory()) await walk(name);
      else if (child.isFile()) filenames.push(name);
    }
  };
  await walk('');
  await readBounded(filenames, async name => {
    const filename = path.join(directory, name);
    if ((await lstat(filename)).isSymbolicLink() || !same(await realpath(filename), path.join(physicalDirectory, name))) throw new Error('Compiled assets must not be redirected');
    entries.push([name.replaceAll('\\', '/'), hash(await readFile(filename))]);
  });
  if (!entries.some(([name]) => name === 'index.html')) throw new Error('Build the frontend before packaging the Worker');
  entries.sort(([a], [b]) => a.localeCompare(b));
  return { sha256: hash(JSON.stringify(entries)), files: entries };
}

export async function clientFingerprint(root = applicationRoot) {
  return clientHash(await sourceFingerprint(root));
}

export async function buildClient(root = applicationRoot) {
  await rejectImplicitBuildEnvironment(root);
  const before = await clientFingerprint(root);
  const output = path.join(root, 'client/dist');
  try {
    if ((await lstat(output)).isSymbolicLink() || !same(await realpath(output), path.join(await realpath(root), 'client/dist'))) throw new Error('Refusing redirected frontend build output');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) if (/^(VITE_|CLOUDFLARE_|CF_|NOTION_|DATABASE_PATH$|SESSION_SECRET$)/.test(name)) delete environment[name];
  // Type checking emits no application files. Run it beside Vite, then drain
  // both processes before accepting assets or reporting either failure.
  const builds = await Promise.allSettled([['node_modules/typescript/bin/tsc'], ['node_modules/vite/bin/vite.js', 'build']].map(args =>
    execute(process.execPath, args, { cwd: path.join(root, 'client'), env: environment, windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })));
  for (const result of builds) if (result.status === 'fulfilled') {
    process.stdout.write(result.value.stdout);
    process.stderr.write(result.value.stderr);
  }
  const failure = builds.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  if (before !== await clientFingerprint(root)) throw new Error('Frontend source changed during its build');
  const receipt = { version: 1, clientSourceSha256: before, assetSha256: (await assetFingerprint(root)).sha256 };
  await privateDirectory(root, path.join(root, '.verification'));
  await writeFile(path.join(root, '.verification/client-build.json'), JSON.stringify(receipt));
  return receipt;
}

async function ensureClientBuild(root) {
  let receipt;
  try { receipt = JSON.parse(await readFile(path.join(root, '.verification/client-build.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!receipt || receipt.version !== 1 || receipt.clientSourceSha256 !== await clientFingerprint(root) || receipt.assetSha256 !== (await assetFingerprint(root)).sha256) return buildClient(root);
  return receipt;
}

export async function buildWorker({ root = applicationRoot, directory = path.join(root, '.verification/release-bundle') } = {}) {
  assertWorkerHost();
  await rejectImplicitBuildEnvironment(root);
  const clientBuild = await ensureClientBuild(root);
  directory = path.resolve(directory);
  directory = await privateDirectory(root, directory);
  const before = await sourceFingerprint(root);
  const assets = await assetFingerprint(root);
  const environment = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(directory, 'wrangler.log') };
  for (const name of Object.keys(environment)) if (/^(CLOUDFLARE_|CF_|NOTION_|DATABASE_PATH$|SESSION_SECRET$)/.test(name)) delete environment[name];
  const result = await execute(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--dry-run', '--config', path.join(root, 'wrangler.jsonc'), '--outdir', directory], { cwd: root, env: environment, windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  await writeFile(path.join(directory, 'build.log'), result.stdout + result.stderr);
  const after = await sourceFingerprint(root);
  if (before.sha256 !== after.sha256 || assets.sha256 !== (await assetFingerprint(root)).sha256) throw new Error('Source/assets changed while building the Worker; candidate is stale');
  const worker = path.join(directory, 'worker.js');
  const { stdout } = await execute('git', ['rev-parse', 'HEAD'], { cwd: root, windowsHide: true });
  const artifact = { version: 1, commit: stdout.trim(), sourceSha256: before.sha256, clientSourceSha256: clientBuild.clientSourceSha256, assetSha256: assets.sha256, workerSha256: hash(await readFile(worker)), builtAt: new Date().toISOString(), compatibilityDate: JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8')).compatibility_date, files: before.files, assetFiles: assets.files };
  await writeFile(path.join(directory, 'candidate.json'), JSON.stringify(artifact, null, 2));
  return { directory, worker, artifact };
}

export async function requireCandidate({ root = applicationRoot, directory = path.join(root, '.verification/release-bundle') } = {}) {
  const candidate = JSON.parse(await readFile(path.join(directory, 'candidate.json'), 'utf8'));
  const source = await sourceFingerprint(root);
  if (candidate.version !== 1 || candidate.clientSourceSha256 !== clientHash(source) || candidate.sourceSha256 !== source.sha256 || candidate.assetSha256 !== (await assetFingerprint(root)).sha256 || candidate.workerSha256 !== hash(await readFile(path.join(directory, 'worker.js')))) throw new Error('Missing, modified or stale Worker candidate; build and verify the current source');
  return candidate;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildWorker().then(({ artifact }) => console.log(JSON.stringify({ built: true, commit: artifact.commit, sourceSha256: artifact.sourceSha256 }))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
