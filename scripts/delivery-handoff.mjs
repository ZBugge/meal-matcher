import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, lstat, mkdir, readFile, readlink, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { validateContract, validateOwnership } from './delivery-contract.mjs';
import { runChecks } from './verify.mjs';

const execute = promisify(execFile);
const hash = data => createHash('sha256').update(data).digest('hex');
const key = value => process.platform === 'win32' ? value.toLowerCase() : value;
const same = (a, b) => key(path.resolve(a)) === key(path.resolve(b));
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};
const git = async (cwd, ...args) => (await execute('git', args, { cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })).stdout;

function statusPaths(status) {
  const fields = status.split('\0');
  const files = [];
  for (let i = 0; i < fields.length; i++) {
    if (!fields[i]) continue;
    const code = fields[i].slice(0, 2);
    files.push(fields[i].slice(3));
    if (/[RC]/.test(code)) files.push(fields[++i]);
  }
  return files;
}

async function containedPath(root, file, depth = 0) {
  if (!inside(root, file)) throw new Error(`Path escapes assigned worktree: ${file}`);
  if (depth > 40) throw new Error(`Cannot resolve source symlink: ${file}`);
  let candidate = file;
  while (true) {
    try {
      const resolved = await realpath(candidate);
      if (!inside(root, resolved)) throw new Error(`Path escapes assigned worktree: ${file}`);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const stat = await lstat(candidate).catch(missing => {
        if (missing.code !== 'ENOENT') throw missing;
        return null;
      });
      if (stat?.isSymbolicLink()) return containedPath(root, path.resolve(path.dirname(candidate), await readlink(candidate)), depth + 1);
      const parent = path.dirname(candidate);
      if (parent === candidate) throw error;
      candidate = parent;
    }
  }
}

async function fingerprint(root, files) {
  const entries = [];
  for (const file of [...files].sort()) {
    const absolute = path.join(root, ...file.replaceAll('\\', '/').split('/'));
    await containedPath(root, absolute);
    try {
      const stat = await lstat(absolute);
      if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`Owned source is not a file: ${file}`);
      entries.push([file, stat.isSymbolicLink() ? 'symlink' : 'file', hash(await readFile(absolute))]);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      entries.push([file, 'missing']);
    }
  }
  return hash(JSON.stringify(entries));
}

async function npmPath(injected) {
  const candidates = injected ? [path.resolve(injected)] : [
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    ...(process.env.npm_execpath ? [process.env.npm_execpath] : []),
  ];
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* Try installed layouts. */ }
  }
  throw new Error('Cannot locate installed npm-cli.js; run with an installed Node/npm distribution.');
}

/** Checks only fixed package builds. Contract check strings are descriptive, never executable. */
export async function runHandoff(contractPath, owner, { cwd = process.cwd(), npmCli } = {}) {
  const receipt = { version: 1, startedAt: new Date().toISOString(), owner, passed: false, errors: [], results: [] };
  let directory;
  try {
    const content = await readFile(contractPath);
    const contract = JSON.parse(content);
    receipt.contractHash = hash(content);
    receipt.contractId = contract.id;
    receipt.baseSha = contract.baseSha;
    const errors = validateContract(contract);
    if (errors.length) throw new Error(errors.join('\n'));
    const builder = contract.builders.find(entry => entry.owner === owner);
    if (!builder) throw new Error(`Unknown builder owner: ${owner}`);
    const root = await realpath(cwd);
    if (!same(root, await realpath(builder.worktree))) throw new Error('Current worktree does not match assigned builder worktree.');
    const top = (await git(root, 'rev-parse', '--show-toplevel')).trim();
    if (!same(root, await realpath(top))) throw new Error('Run from the exact assigned worktree root.');
    const registered = (await git(root, 'worktree', 'list', '--porcelain', '-z')).split('\0')
      .filter(field => field.startsWith('worktree ')).map(field => field.slice(9));
    if (!registered.some(tree => same(tree, root))) throw new Error('Assigned worktree is not registered with Git.');
    const outputRoot = path.join(root, '.verification/delivery/handoff');
    await containedPath(root, outputRoot);
    await git(root, 'check-ignore', '--no-index', path.relative(root, path.join(outputRoot, 'probe')));
    directory = path.join(outputRoot, `run-${Date.now()}-${randomUUID()}`);
    await mkdir(directory, { recursive: true });
    receipt.directory = directory;
    await git(root, 'merge-base', '--is-ancestor', contract.baseSha, 'HEAD');
    const snapshot = async () => {
      const head = (await git(root, 'rev-parse', 'HEAD')).trim();
      const status = await git(root, 'status', '--porcelain=v1', '-z', '--untracked-files=all');
      const committed = (await git(root, 'diff', '--no-renames', '--name-only', '-z', contract.baseSha, 'HEAD')).split('\0').filter(Boolean);
      const actualPaths = [...new Set([...committed, ...statusPaths(status)])];
      const violations = validateOwnership(contract, [{ owner, files: actualPaths }]);
      if (violations.length) throw new Error(violations.join('\n'));
      return { head, sourceHash: await fingerprint(root, [...new Set([...builder.files, ...actualPaths])].sort()), status, statusHash: hash(status) };
    };
    receipt.before = await snapshot();
    receipt.head = receipt.before.head;
    receipt.sourceHash = receipt.before.sourceHash;
    const ownedPaths = builder.files.map(file => file.replaceAll('\\', '/').toLowerCase());
    const rootBuildInput = ownedPaths.some(file => ['package.json', 'package-lock.json', 'tsconfig.json'].includes(file));
    const workerInput = ownedPaths.some(file => file === 'wrangler.jsonc' || file.startsWith('cloudflare/'));
    const packages = ['client', 'server'].filter(pkg => rootBuildInput || workerInput || ownedPaths.some(file => file.startsWith(`${pkg}/`)));
    if (!packages.length) {
      receipt.notApplicable = true;
      throw new Error('No affected client/server package builds; this handoff guard cannot validate this assignment.');
    }
    const cli = await npmPath(npmCli);
    const checks = packages.map(pkg => ({ id: `${pkg}-build`, name: `${pkg} package build`, cwd: root, args: [cli, '--prefix', pkg, 'run', 'build'] }));
    const hasWorker = workerInput || await access(path.join(root, 'cloudflare/worker.ts')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (hasWorker) checks.push({ id: 'worker-build', name: 'Worker and Static Assets package', cwd: root, dependsOn: packages.map(pkg => `${pkg}-build`), args: [cli, 'run', 'build:worker'] });
    const report = await runChecks(checks, { directory, budgetMs: 90_000 });
    Object.assign(receipt, report);
    receipt.after = await snapshot();
    if (JSON.stringify(receipt.before) !== JSON.stringify(receipt.after)) throw new Error('HEAD, owned source, or complete Git status changed during checks.');
    if (hash(await readFile(contractPath)) !== receipt.contractHash) throw new Error('Contract changed during checks.');
    receipt.passed = report.results.every(result => result.passed) && !report.timedOut && !report.interrupted && report.cleanupErrors.length === 0;
    if (!receipt.passed) receipt.errors.push('Package build checks failed, timed out, or could not clean up.');
  } catch (error) {
    receipt.passed = false;
    receipt.errors.push(error.message);
  }
  receipt.endedAt = new Date().toISOString();
  if (directory) {
    receipt.receiptPath = path.join(directory, 'receipt.json');
    await writeFile(receipt.receiptPath, JSON.stringify(receipt, null, 2));
  }
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const receipt = args.length === 2 ? await runHandoff(...args) : { passed: false, errors: ['Usage: node scripts/delivery-handoff.mjs <contract.json> <builder-owner>'] };
  console.log(JSON.stringify({ passed: receipt.passed, receipt: receipt.receiptPath, errors: receipt.errors }));
  if (!receipt.passed) process.exitCode = 1;
}
