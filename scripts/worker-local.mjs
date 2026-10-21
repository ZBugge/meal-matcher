import { Miniflare } from 'miniflare';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationRoot, buildWorker, requireCandidate } from './worker-build.mjs';
import { privateDirectory } from './local-paths.mjs';

const execute = promisify(execFile);
export function localAssetOptions(config, root) {
  const assets = config.assets;
  if (assets?.directory !== 'client/dist' || assets.binding !== 'ASSETS') throw new Error('Unexpected static asset target');
  const routerConfig = { has_user_worker: !!config.main };
  if (typeof assets.run_worker_first === 'boolean') routerConfig.invoke_user_worker_ahead_of_assets = assets.run_worker_first;
  else if (Array.isArray(assets.run_worker_first)) {
    routerConfig.static_routing = { user_worker: assets.run_worker_first.filter(rule => !rule.startsWith('!')), asset_worker: assets.run_worker_first.filter(rule => rule.startsWith('!')).map(rule => rule.slice(1)) };
  }
  return { directory: path.join(root, assets.directory), binding: assets.binding, routerConfig, assetConfig: { not_found_handling: assets.not_found_handling, html_handling: assets.html_handling, compatibility_date: config.compatibility_date, compatibility_flags: config.compatibility_flags } };
}
export async function prepareLocalState(directory, { root = applicationRoot, migrate = true } = {}) {
  directory = path.resolve(directory);
  const relative = path.relative(root, directory);
  if (!relative || !['.verification', '.wrangler'].includes(relative.split(path.sep)[0]) || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Local state must stay in this checkout .verification/ or .wrangler/');
  directory = await privateDirectory(root, directory);
  const config = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
  const binding = config.d1_databases?.find(binding => binding.binding === 'DB');
  if (!binding || !/^00000000-0000-0000-0000-/.test(binding.database_id) || !binding.database_name.includes('local')) throw new Error('Base configuration must select an explicitly local placeholder DB');
  if (!migrate) return { directory, config, binding };
  const environment = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(directory, 'wrangler.log') };
  for (const name of Object.keys(environment)) if (/^(CLOUDFLARE_|CF_|NOTION_|DATABASE_PATH$|SESSION_SECRET$)/.test(name)) delete environment[name];
  const result = await execute(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', binding.database_name, '--local', '--persist-to', path.join(directory, 'state'), '--config', path.join(root, 'wrangler.jsonc')], { cwd: root, env: environment, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
  await writeFile(path.join(directory, `migrations-${Date.now()}.log`), result.stdout + result.stderr);
  return { directory, config, binding };
}

async function developmentSecrets(directory) {
  const filename = path.join(directory, 'local-secrets.private.json');
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const secrets = { SESSION_SECRET: randomBytes(48).toString('base64'), NOTION_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
    try { await writeFile(filename, JSON.stringify(secrets), { flag: 'wx', mode: 0o600 }); return secrets; }
    catch (error) { if (error.code !== 'EEXIST') throw error; return JSON.parse(await readFile(filename, 'utf8')); }
  }
}

export async function startLocalWorker({ directory, port = 0, root = applicationRoot, bundleDirectory = path.join(root, '.verification/release-bundle'), secrets, migrate = true, allowNotionNetwork = false, outboundService, initializeState } = {}) {
  if (!directory) throw new Error('Explicit local state directory required');
  const candidate = await requireCandidate({ root, directory: bundleDirectory });
  // Synthetic fixture initialization runs only after current source/assets and
  // Worker bytes have been verified. Normal development still runs migrations.
  await initializeState?.(candidate);
  const prepared = await prepareLocalState(directory, { root, migrate });
  const binding = prepared.binding ?? prepared.config.d1_databases.find(value => value.binding === 'DB');
  secrets ??= await developmentSecrets(prepared.directory);
  if (typeof secrets.SESSION_SECRET !== 'string' || secrets.SESSION_SECRET.length < 32) throw new Error('Strong isolated session binding required');
  const options = {
    rootPath: root, modulesRoot: root,
    host: '127.0.0.1', port, modules: true, scriptPath: path.join(bundleDirectory, 'worker.js'),
    compatibilityDate: prepared.config.compatibility_date, compatibilityFlags: prepared.config.compatibility_flags,
    d1Databases: { DB: binding.database_id }, d1Persist: path.join(prepared.directory, 'state/v3/d1'), bindings: secrets,
    assets: localAssetOptions(prepared.config, root),
  };
  if (outboundService) options.outboundService = outboundService;
  else if (!allowNotionNetwork) options.outboundService = () => new Response('External network is disabled in isolated verification.', { status: 503 });
  const runtime = new Miniflare(options);
  try {
    const url = await runtime.ready;
    return { runtime, url: url.toString(), candidate, directory: prepared.directory, secrets };
  } catch (error) { await runtime.dispose(); throw error; }
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  let build = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--build') build = true;
    else if (args[i] === '--allow-notion-network') options.allowNotionNetwork = true;
    else if (args[i] === '--port') options.port = Number(args[++i]);
    else if (args[i] === '--state') options.directory = path.resolve(args[++i]);
    else throw new Error('Unknown local Worker argument');
  }
  if (!options.directory || !Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('Use --port <port> --state <isolated-directory> [--build]');
  if (build) await buildWorker();
  const active = await startLocalWorker(options);
  console.log(`Local Worker + D1 ready at ${active.url}`);
  let closing;
  const close = () => closing ??= active.runtime.dispose();
  process.once('SIGINT', () => { close().finally(() => process.exit()); });
  process.once('SIGTERM', () => { close().finally(() => process.exit()); });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
