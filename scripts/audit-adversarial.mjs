import { cp, lstat, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runChecks } from './verify.mjs';
import { buildWorker, applicationRoot, clientFingerprint, assetFingerprint } from './worker-build.mjs';
import { validateMutationFailure } from './adversarial-report.mjs';
import { privateDirectory } from './local-paths.mjs';

export const mutations = [
  { id: 'invalid-vote', file: 'server/src/routes/swipes.ts', from: '![0, 1, 2].includes(swipe.vote)', to: '![0, 1, 2, 3].includes(swipe.vote)' },
  { id: 'rejected-ballot-loss', file: 'server/src/routes/swipes.ts', from: 'const seenMealIds = new Set<string>();', to: "await runQuery('DELETE FROM swipes WHERE participant_id = ?', [participantId]);\n        const seenMealIds = new Set<string>();" },
  { id: 'public-voters', file: 'server/src/routes/swipes.ts', from: 'calculateResults(sessionId, requestorIsHost && isHost)', to: 'calculateResults(sessionId, isHost)' },
  { id: 'anonymous-close-voters', file: 'server/src/routes/swipes.ts', from: 'calculateResults(sessionId, req.session.hostId === session.host_id)', to: 'calculateResults(sessionId, true)' },
  { id: 'recipe-owner', file: 'server/src/routes/meals.ts', from: 'WHERE id = ? AND host_id = ?`, [req.params.id, req.session.hostId]', to: 'WHERE id = ? AND (? IS NOT NULL OR 1=1)`, [req.params.id, req.session.hostId]' },
  { id: 'lost-persistence', file: 'server/src/routes/swipes.ts', from: 'await database.commit();', to: "await database.commit();\n        await runQuery('DELETE FROM swipes WHERE participant_id = ?', [participantId]);" },
].map(value => ({ ...value, expected: value.id, assertion: new RegExp(`AssertionError[^]*audit:${value.id}`) }));

export function applyMutation(source, mutation) {
  if (source.split(mutation.from).length !== 2) throw new Error(`${mutation.id}: mutation anchor missing or ambiguous`);
  return source.replace(mutation.from, mutation.to);
}

// Serialized into each copied tree, so no probe can silently import canonical code.
async function workerProbe() {
  const { default: assert } = await import('node:assert/strict');
  const { default: path } = await import('node:path');
  const { writeFile } = await import('node:fs/promises');
  const { startLocalWorker } = await import('./worker-local.mjs');
  const root = process.env.MEALMATCH_TEST_ROOT;
  if (!root || path.resolve(root) !== path.resolve(import.meta.dirname, '..')) throw new Error('Copied test root required');
  const options = { root, directory: path.join(root, '.verification/s'), bundleDirectory: process.env.MEALMATCH_TEST_BUNDLE_DIRECTORY };
  let active = await startLocalWorker(options);
  const assertions = [];
  function client() {
    let cookie = '';
    return async (route, method = 'GET', body) => {
      const response = await fetch(new URL('/api' + route, active.url), { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
      const set = response.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Expected API JSON');
      return { status: response.status, body: await response.json() };
    };
  }
  const quick = async request => { const result = await request('/quick-session', 'POST', { creatorName: 'Audit voter', mode: 'home', meals: [{ title: 'Soup' }, { title: 'Pasta' }] }); if (result.status !== 200) throw new Error('Quick fixture failed'); return result.body; };
  const ballot = q => ({ participantId: q.participantId, swipes: q.meals.map(meal => ({ mealId: meal.id, vote: 1 })) });
  const submit = (request, q, body = ballot(q)) => request('/swipes/' + q.session.id, 'POST', body);
  const rows = async q => (await (await active.runtime.getD1Database('DB')).prepare('SELECT session_meal_id,vote FROM swipes WHERE participant_id=? ORDER BY session_meal_id').bind(q.participantId).all()).results;
  async function probe(name, action) {
    try { await action(); assertions.push({ fullName: name, title: name, status: 'passed', failureMessages: [] }); }
    catch (error) { if (error.code !== 'ERR_ASSERTION') throw error; assertions.push({ fullName: name, title: name, status: 'failed', failureMessages: [error.stack] }); }
  }
  try {
    await probe('invalid-vote', async () => {
      const request = client(), q = await quick(request), body = ballot(q); body.swipes[0].vote = 3;
      assert.equal((await submit(request, q, body)).status, 400, 'audit:invalid-vote'); assert.deepEqual(await rows(q), []);
    });
    await probe('rejected-ballot-loss', async () => {
      const request = client(), q = await quick(request); assert.equal((await submit(request, q)).status, 200);
      const before = await rows(q), body = ballot(q); body.swipes.at(-1).vote = 3;
      assert.equal((await submit(request, q, body)).status, 400); assert.deepEqual(await rows(q), before, 'audit:rejected-ballot-loss');
    });
    await probe('public-voters', async () => {
      const request = client(), q = await quick(request); assert.equal((await submit(request, q)).status, 200);
      assert.equal((await request('/close-session/' + q.session.id, 'POST', { creatorToken: q.creatorToken })).status, 200);
      const result = await client()('/results/' + q.session.id + '?host=true'); assert.equal(result.status, 200);
      assert.equal(JSON.stringify(result.body).includes('"voters"'), false, 'audit:public-voters');
    });
    await probe('anonymous-close-voters', async () => {
      const request = client(), q = await quick(request); assert.equal((await submit(request, q)).status, 200);
      const result = await request('/close-session/' + q.session.id, 'POST', { creatorToken: q.creatorToken }); assert.equal(result.status, 200);
      assert.equal(JSON.stringify(result.body).includes('"voters"'), false, 'audit:anonymous-close-voters');
    });
    await probe('recipe-owner', async () => {
      const owner = client(), stranger = client();
      for (const [index, request] of [owner, stranger].entries()) { const result = await request('/auth/register', 'POST', { email: 'audit' + index + '@example.test', password: 'synthetic-password' }); if (result.status !== 201) throw new Error('Auth fixture failed'); }
      const meal = await owner('/meals', 'POST', { title: 'Private soup', type: 'meal', instructions: 'Private instructions', ingredients: [] }); if (meal.status !== 201) throw new Error('Recipe fixture failed');
      const id = meal.body.id; assert.equal((await owner('/meals/' + id)).status, 200); assert.equal((await stranger('/meals/' + id)).status, 404, 'audit:recipe-owner'); assert.equal((await client()('/meals/' + id)).status, 401);
    });
    await probe('lost-persistence', async () => {
      const request = client(), q = await quick(request); assert.equal((await submit(request, q)).status, 200);
      await active.runtime.dispose(); active = await startLocalWorker({ ...options, migrate: false });
      const saved = await rows(q); assert.equal(saved.length, q.meals.length, 'audit:lost-persistence'); assert.deepEqual(saved.map(row => row.vote), q.meals.map(() => 1));
      const result = await client()('/session-status/' + q.session.id); assert.equal(result.status, 200); assert.equal(result.body.participants.find(p => p.id === q.participantId).submitted, true);
    });
  } finally { await active.runtime.dispose(); }
  const failed = assertions.filter(result => result.status === 'failed').length;
  await writeFile(process.env.MEALMATCH_AUDIT_REPORT, JSON.stringify({ success: failed === 0, numTotalTests: assertions.length, numPassedTests: assertions.length - failed, numFailedTests: failed, testResults: [{ assertionResults: assertions }] }));
  process.exitCode = failed ? 1 : 0;
}
export const probeSource = `(${workerProbe.toString()})();\n`;

// Establish the real runtime baseline first, then bound expensive isolated builds.
// Wait for both active jobs on failure so nothing continues after audit returns.
export async function runAuditCases(runCase) {
  await runCase(undefined);
  let next = 0, failed = false;
  const workers = await Promise.allSettled(Array.from({ length: 2 }, async () => {
    while (!failed && next < mutations.length) {
      const mutation = mutations[next++];
      try { await runCase(mutation); }
      catch (error) { failed = true; throw error; }
    }
  }));
  const failure = workers.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}

export function auditCasePaths(treeDirectory, mutation) {
  const index = mutation ? mutations.findIndex(value => value.id === mutation.id) : -1;
  if (mutation && index < 0) throw new Error('Unknown audit mutation');
  const copiedRoot = path.join(treeDirectory, mutation ? String(index + 1) : 'c');
  return { id: mutation?.id ?? 'control', copiedRoot, bundleDirectory: path.join(copiedRoot, '.verification/b'), stateDirectory: path.join(copiedRoot, '.verification/s') };
}

// A normal checkout has a .git directory; a worktree has a pointer file whose
// relative target must be resolved before moving the pointer into a copied tree.
export async function writeAuditGitPointer(root, copiedRoot) {
  const gitEntry = path.join(root, '.git');
  const info = await lstat(gitEntry);
  let gitDirectory;
  if (info.isDirectory()) gitDirectory = gitEntry;
  else if (info.isFile()) {
    const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(await readFile(gitEntry, 'utf8'));
    if (!match) throw new Error('Audit checkout has an invalid .git pointer');
    gitDirectory = path.resolve(root, match[1]);
  } else throw new Error('Audit checkout requires a .git directory or pointer file');
  gitDirectory = await realpath(gitDirectory);
  if (!(await lstat(gitDirectory)).isDirectory()) throw new Error('Audit Git pointer must select a directory');
  await writeFile(path.join(copiedRoot, '.git'), `gitdir: ${gitDirectory}\n`, { flag: 'wx' });
}

export async function prepareAuditTree(root, directory, id, mutation) {
  const copiedRoot = path.join(directory, id);
  await privateDirectory(root, copiedRoot);
  for (const name of ['server/src', 'server/package.json', 'server/tsconfig.json', 'server/tsconfig.runtime.json', 'server/vitest.config.ts', 'cloudflare', 'scripts', 'client', 'wrangler.jsonc', 'railway.json', 'build.sh', 'package.json', 'package-lock.json']) await cp(path.join(root, name), path.join(copiedRoot, name), { recursive: true, filter: filename => !['node_modules', '.verification', '.wrangler'].includes(path.basename(filename)) });
  for (const name of ['node_modules', 'server/node_modules']) await symlink(path.join(root, name), path.join(copiedRoot, name), process.platform === 'win32' ? 'junction' : 'dir');
  // Read-only pointer lets buildWorker record the original HEAD without copying Git data.
  await writeAuditGitPointer(root, copiedRoot);
  if (mutation) { const filename = path.join(copiedRoot, mutation.file); await writeFile(filename, applyMutation(await readFile(filename, 'utf8'), mutation)); }
  await writeFile(path.join(copiedRoot, 'scripts/audit-worker-probe.mjs'), probeSource);
  const receipt = JSON.parse(await readFile(path.join(root, '.verification/client-build.json'), 'utf8'));
  if (receipt.version !== 1 || receipt.clientSourceSha256 !== await clientFingerprint(copiedRoot) || receipt.assetSha256 !== (await assetFingerprint(copiedRoot)).sha256) throw new Error('Build the current frontend before auditing mutants');
  await mkdir(path.join(copiedRoot, '.verification'), {recursive:true});
  await writeFile(path.join(copiedRoot, '.verification/client-build.json'), JSON.stringify(receipt));
  return copiedRoot;
}

export async function audit({ root = applicationRoot, directory = path.join(root, '.verification', `audit-${Date.now()}-${randomUUID().slice(0, 8)}`) } = {}) {
  const relative = path.relative(path.join(root, '.verification'), directory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Audit directory must be a new child of checkout .verification');
  await privateDirectory(root, path.dirname(directory));
  await mkdir(directory);
  await privateDirectory(root, directory, { existingOnly: true });
  // Workerd's SQLite filenames must fit Windows path limits, independently of
  // verbose verifier report paths and descriptive mutation names.
  const treeDirectory = path.join(root, '.verification', `a-${randomUUID().slice(0, 8)}`);
  await mkdir(treeDirectory);
  await privateDirectory(root, treeDirectory, { existingOnly: true });
  const cases = [undefined, ...mutations].map(mutation => auditCasePaths(treeDirectory, mutation));
  await writeFile(path.join(directory, 'cases.json'), JSON.stringify(cases, null, 2), { flag: 'wx' });
  const started = performance.now(), results = [];
  let controlCount;
  await runAuditCases(async mutation => {
    const id = mutation?.id ?? 'control';
    const { copiedRoot, bundleDirectory } = cases.find(value => value.id === id);
    await prepareAuditTree(root, treeDirectory, path.basename(copiedRoot), mutation);
    // Compilation failure fails the audit; it cannot kill a mutant.
    await buildWorker({ root: copiedRoot, directory: bundleDirectory });
    const reportPath = path.join(directory, `${id}.json`);
    const execution = await runChecks([{ id, name: id, cwd: copiedRoot, args: [path.join(copiedRoot, 'scripts/audit-worker-probe.mjs')], env: { ...process.env, MEALMATCH_TEST_ROOT: copiedRoot, MEALMATCH_TEST_BUNDLE_DIRECTORY: bundleDirectory, MEALMATCH_AUDIT_REPORT: reportPath } }], { directory, budgetMs: 60000 });
    if (execution.timedOut || execution.interrupted || execution.cleanupErrors.length) throw new Error(`${id}: probe infrastructure failed`);
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    if (!mutation) {
      if (!execution.results[0].passed || report.success !== true || report.numTotalTests !== 6 || report.numPassedTests !== 6 || report.numFailedTests !== 0) throw new Error('Unmodified Worker control must pass all six probes');
      controlCount = report.numTotalTests;
    } else {
      const failedAssertions = validateMutationFailure(execution.results[0], report, controlCount, mutation);
      results.push({ id, caught: true, failedAssertions }); console.log(`CAUGHT ${id}`);
    }
  });
  results.sort((a, b) => mutations.findIndex(value => value.id === a.id) - mutations.findIndex(value => value.id === b.id));
  const summary = { success: true, elapsedMs: performance.now() - started, controlTests: controlCount, cases, results };
  await writeFile(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2)); return summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--directory');
  audit(index < 0 ? {} : { directory: path.resolve(process.argv[index + 1]) }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
