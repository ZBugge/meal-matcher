import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { access, mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserCoverageReport, validateHistoricalCoverage } from './test-coverage.mjs';
import { buildClient, requireCandidate, sourceFingerprint } from './worker-build.mjs';
import { privateDirectory } from './local-paths.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const limitMs = 120_000;
const seconds = ms => `${(ms / 1000).toFixed(1)}s`;

export function validateTestReport(label, data) {
  const minimum = { server: 226, client: 155, browser: 39 }[label];
  const count = label === 'browser' ? data?.stats?.expected : data?.numPassedTests;
  const noFailures = label === 'browser'
    ? ['unexpected', 'flaky', 'skipped'].every(field => data?.stats?.[field] === 0)
    : ['numFailedTests', 'numPendingTests', 'numTodoTests'].every(field => data?.[field] === 0)
      && data?.success === true && Number.isInteger(data?.numTotalTests) && data.numTotalTests === count;
  const browserTests = [];
  const visit = suite => {
    for (const spec of suite.specs ?? []) browserTests.push(...(spec.tests ?? []));
    for (const nested of suite.suites ?? []) visit(nested);
  };
  if (label === 'browser') for (const suite of data?.suites ?? []) visit(suite);
  const actualPasses = label !== 'browser' || (browserTests.length === count && browserTests.every(test =>
    test.expectedStatus === 'passed' && test.status === 'expected' && test.results?.length === 1
    && test.results[0].status === 'passed' && test.results[0].retry === 0 && test.results[0].errors?.length === 0));
  if (!Number.isInteger(count) || count < minimum || !noFailures || !actualPasses) {
    throw new Error(`${label} report is malformed or contains missing, failed, flaky, or skipped tests (at least ${minimum} required).`);
  }
  return count;
}

export function validateNodeReport(output, minimum) {
  const value = label => [...output.matchAll(new RegExp(`^# ${label} (\\d+)$`, 'gm'))].at(-1)?.[1];
  const tests = Number(value('tests'));
  if (!Number.isInteger(tests) || tests < minimum || ['fail', 'cancelled', 'skipped', 'todo'].some(label => value(label) !== '0')) throw new Error('Node regression report has missing, failed, cancelled, skipped or todo tests');
  return tests;
}

async function freePort(exclude = []) {
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
  return exclude.includes(port) ? freePort(exclude) : port;
}

async function stopTree(child) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      const timeout = setTimeout(() => {
        killer.kill();
        reject(new Error(`Timed out stopping process tree ${child.pid}`));
      }, 3_000);
      killer.once('error', error => { clearTimeout(timeout); reject(error); });
      killer.once('close', code => {
        clearTimeout(timeout);
        if (code === 0 || child.exitCode !== null || child.signalCode !== null) resolve();
        else reject(new Error(`Could not stop process tree ${child.pid}: taskkill exited ${code}`));
      });
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}

// Keep all gates running after one fails, so one run reports every independent problem.
export async function runChecks(checks, { directory, budgetMs, onResult = () => {} }) {
  const byId = new Map(checks.map(check => [check.id, check]));
  if (byId.size !== checks.length) throw new Error('Duplicate verification gate ID');
  const visited = new Set();
  const validate = (id, visiting = new Set()) => {
    if (!byId.has(id)) throw new Error(`Unknown verification dependency: ${id}`);
    if (visiting.has(id)) throw new Error(`Circular verification dependency: ${id}`);
    if (visited.has(id)) return;
    const next = new Set([...visiting, id]);
    for (const dependency of byId.get(id).dependsOn ?? []) validate(dependency, next);
    visited.add(id);
  };
  for (const check of checks) validate(check.id);
  const started = performance.now();
  const children = new Map();
  let timedOut = false;
  let interrupted = false;
  let cleanup;
  const cleanupErrors = [];
  const stop = () => cleanup ??= Promise.all([...children].map(async ([child, finish]) => {
    try { await stopTree(child); }
    catch (error) {
      cleanupErrors.push(error.message);
      // A failed tree cleanup must fail verification and cannot leave the runner waiting forever.
      child.kill('SIGKILL');
    } finally {
      if (children.has(child)) {
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        finish(null);
      }
    }
  }));
  const interrupt = () => { interrupted = true; void stop(); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const deadline = setTimeout(() => { timedOut = true; void stop(); }, budgetMs);
  try {
    const jobs = new Map();
    const run = check => {
      if (jobs.has(check.id)) return jobs.get(check.id);
      const job = (async () => {
      const prerequisites = await Promise.all((check.dependsOn ?? []).map(id => run(byId.get(id))));
      const checkStarted = performance.now();
      if (timedOut || interrupted || prerequisites.some(result => !result.passed)) {
        const log = path.join(directory, `${check.id}.log`);
        await writeFile(log, 'Blocked by failed dependency, timeout, or interruption.');
        const result = { id: check.id, name: check.name, exitCode: null, passed: false, durationMs: 0, log };
        onResult(result);
        return result;
      }
      let output = '';
      let spawnError;
      const exitCode = await new Promise(resolve => {
        const child = spawn(process.execPath, check.args, {
          cwd: check.cwd,
          env: { ...process.env, ...check.env },
          windowsHide: true,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const finish = code => { children.delete(child); resolve(code); };
        children.set(child, finish);
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { output += chunk; });
        child.once('error', error => { spawnError = error.message; });
        child.once('close', finish);
      });
      if (spawnError) output += `\n${spawnError}\n`;
      const log = path.join(directory, `${check.id}.log`);
      await writeFile(log, output);
      const result = { id: check.id, name: check.name, exitCode, passed: exitCode === 0 && !spawnError, durationMs: performance.now() - checkStarted, log };
      onResult(result);
      return result;
      })();
      jobs.set(check.id, job);
      return job;
    };
    const results = await Promise.all(checks.map(run));
    await stop();
    return { results, timedOut, interrupted, cleanupErrors, durationMs: performance.now() - started };
  } finally {
    clearTimeout(deadline);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    await stop();
  }
}

async function main() {
  const started = performance.now();
  const verificationDirectory = path.join(root, '.verification');
  await privateDirectory(root, verificationDirectory);
  const lockPath = path.join(verificationDirectory, 'verify.lock');
  let lock;
  let summary;
  let directory;
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another verification holds ${lockPath}. Wait for it to finish; do not run checks concurrently against the same checkout.`);
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }));
    directory = path.join(verificationDirectory, `run-${Date.now()}-${randomUUID().slice(0, 8)}`);
    await mkdir(directory);
    await writeFile(path.join(directory, 'summary.json'), JSON.stringify({ passed: false, status: 'running', directory }));
    // Publish only a pointer under the lock; an older run can never overwrite a newer run's status.
    await writeFile(path.join(verificationDirectory, 'latest.json'), JSON.stringify({ directory, summary: path.join(directory, 'summary.json') }));
    const require = createRequire(path.join(root, 'package.json'));
    await access(require('@playwright/test').chromium.executablePath());
    const clientPort = await freePort();
    const client = path.join(root, 'client');
    const server = path.join(root, 'server');
    const node = (...parts) => path.join(root, ...parts);
    // Keep SQLite's absolute filenames short on Windows; each run owns a new seed.
    const emptyUnitState = node('.verification', `t-${randomUUID().slice(0, 8)}`);
    const sourceBefore = await sourceFingerprint(root);
    const checks = [
      { id: 'verification-tests', name: 'Verification and delivery tool tests', cwd: root, args: ['--test', node('scripts', 'verify.test.mjs'), node('scripts', 'delivery-contract.test.mjs'), node('scripts', 'delivery-metrics.test.mjs'), node('scripts', 'delivery-handoff.test.mjs'), node('scripts', 'worker-build.test.mjs'), node('scripts', 'worker-local.test.mjs'), node('scripts', 'local-paths.test.mjs'), node('scripts', 'legacy-host-guard.test.mjs'), node('scripts', 'test-coverage.test.mjs'), node('scripts', 'audit-adversarial.test.mjs'), node('scripts', 'release-target.test.mjs'), node('scripts', 'release.test.mjs')] },
      { id: 'runtime-regressions', name: 'Worker/D1 compatibility and migration recovery', cwd: root, dependsOn: ['worker-build'], args: ['--test', '--test-concurrency=2', node('compatibility', 'proof.test.mjs'), node('migration', 'preflight.test.mjs'), node('migration', 'check-credentials.test.mjs'), node('migration', 'd1-rehearsal.test.mjs'), node('migration', 'full-backup.test.mjs'), node('migration', 'remote-backup.test.mjs'), node('scripts', 'test-state.test.mjs')] },
      { id: 'server-tests', name: 'Server tests', cwd: server, dependsOn: ['test-state'], args: [node('server', 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--maxWorkers=3', '--minWorkers=1', '--allowOnly=false', '--reporter=json', `--outputFile=${path.join(directory, 'server-results.json')}`], env: { MEALMATCH_TEST_ROOT: root, MEALMATCH_TEST_BUNDLE_DIRECTORY: node('.verification', 'release-bundle'), MEALMATCH_TEST_EMPTY_STATE: emptyUnitState } },
      { id: 'client-tests', name: 'Client tests', cwd: client, args: [node('client', 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--maxWorkers=3', '--minWorkers=1', '--allowOnly=false', '--reporter=json', `--outputFile=${path.join(directory, 'client-results.json')}`] },
      { id: 'lint', name: 'Client lint', cwd: client, args: [node('client', 'node_modules', 'eslint', 'bin', 'eslint.js'), 'src'] },
      { id: 'server-build', name: 'Server build', cwd: server, args: [node('server', 'node_modules', 'typescript', 'bin', 'tsc')] },
      { id: 'client-build', name: 'Client build', cwd: root, args: [fileURLToPath(import.meta.url), '--client-build'] },
      { id: 'worker-build', name: 'Shipped Worker bundle', cwd: root, dependsOn: ['client-build', 'server-build'], args: [node('scripts', 'worker-build.mjs')] },
      { id: 'test-state', name: 'Isolated migrated test template', cwd: root, dependsOn: ['worker-build'], args: [node('scripts', 'test-state.mjs'), '--prepare', emptyUnitState] },
      { id: 'production-smoke', name: 'Built production runtime', cwd: root, dependsOn: ['worker-build'], args: [node('scripts', 'production-smoke.mjs'), '--output', path.join(directory, 'production-results.json')] },
      { id: 'adversarial-audit', name: 'Adversarial mutation checks', cwd: root, dependsOn: ['worker-build'], args: [node('scripts', 'audit-adversarial.mjs'), '--directory', path.join(directory, 'mutations')] },
      { id: 'browser-tests', name: 'Full browser suite + phone check', cwd: root, dependsOn: ['worker-build'], args: [node('node_modules', '@playwright', 'test', 'cli.js'), 'test', '--config=playwright.verify.config.ts'], env: {
        MEALMATCH_VERIFY_CLIENT_PORT: String(clientPort),
        MEALMATCH_VERIFY_DIRECTORY: directory,
      } },
    ];
    console.log('Running verification with dependent production and adversarial checks (120-second budget).');
    const report = await runChecks(checks, { directory, budgetMs: Math.max(1, limitMs - (performance.now() - started)), onResult: result => {
      console.log(`[${result.passed ? 'PASS' : 'FAIL'}] ${result.name}: ${seconds(result.durationMs)}`);
    } });
    const counts = {};
    for (const [label, filename] of [['server', 'server-results.json'], ['client', 'client-results.json'], ['browser', 'browser-results.json']]) {
      const result = report.results.find(result => result.id === `${label}-tests`);
      if (!result?.passed) continue;
      const data = JSON.parse(await readFile(path.join(directory, filename), 'utf8'));
      counts[label] = validateTestReport(label, data);
      const inventory = label === 'server' ? 'cloudflare-test-baseline.json' : `cloudflare-${label}-test-baseline.json`;
      const mappings = JSON.parse(await readFile(node('docs', 'cloudflare-test-mappings.json'), 'utf8'));
      const renames = label === 'server' ? mappings.renames : mappings[`${label}Renames`];
      if (!Array.isArray(renames)) throw new Error(`Missing ${label} historical mappings`);
      counts[label === 'server' ? 'historical' : `${label}Historical`] = validateHistoricalCoverage(label === 'browser' ? browserCoverageReport(data) : data, JSON.parse(await readFile(node('docs', inventory), 'utf8')), { version: mappings.version, renames }).historicalAssertions;
    }
    for (const [id, minimum] of [['verification-tests', 66], ['runtime-regressions', 35]]) {
      const result = report.results.find(result => result.id === id);
      if (result?.passed) counts[id] = validateNodeReport(await readFile(result.log, 'utf8'), minimum);
    }
    const candidate = report.results.find(result => result.id === 'worker-build')?.passed ? await requireCandidate() : undefined;
    if (sourceBefore.sha256 !== (await sourceFingerprint(root)).sha256) throw new Error('Source changed during verification; results are stale');
    const passed = report.results.every(result => result.passed) && !report.timedOut && !report.interrupted && report.cleanupErrors.length === 0;
    summary = { ...report, sourceSha256: sourceBefore.sha256, workerSha256: candidate?.workerSha256, assetSha256: candidate?.assetSha256, commit: candidate?.commit, passed: false, gatesPassed: passed, status: 'finishing', budgetMs: limitMs, counts, directory };
    await writeFile(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2));
    for (const result of report.results.filter(result => !result.passed)) {
      if (['server-tests', 'client-tests'].includes(result.id)) {
        try {
          const data = JSON.parse(await readFile(path.join(directory, result.id.replace('-tests', '-results.json')), 'utf8'));
          for (const file of data.testResults ?? []) for (const assertion of file.assertionResults ?? []) if (assertion.status !== 'passed') {
            console.error(`${assertion.fullName}: ${String(assertion.failureMessages?.[0] ?? assertion.status).split('\n')[0].slice(0, 500)}`);
          }
        } catch (error) { if (error.code !== 'ENOENT') console.error(`Cannot read failure diagnostics: ${error.message}`); }
      }
      console.error(`\n${result.name}:\n${(await readFile(result.log, 'utf8')).split('\n').slice(-35).join('\n')}`);
    }
  } catch (error) {
    if (!directory) throw error;
    summary = { ...summary, passed: false, gatesPassed: false, error: error.message, budgetMs: limitMs, directory };
    console.error(error.message);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
  // Measure after report preparation, owned-process cleanup, and lock release.
  summary.durationMs = performance.now() - started;
  summary.passed = summary.gatesPassed === true && summary.durationMs < limitMs;
  summary.status = summary.passed ? 'passed' : 'failed';
  await writeFile(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2));
  const totalMs = performance.now() - started;
  if (totalMs >= limitMs && summary.passed) {
    summary.passed = false;
    summary.status = 'failed';
    summary.durationMs = totalMs;
    await writeFile(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2));
  }
  const counts = summary.counts ?? {};
  console.log(`${summary.passed ? 'VERIFIED' : 'FAILED'} in ${seconds(totalMs)}. Tests: ${counts.server ?? '?'} server, ${counts.client ?? '?'} client, ${counts.browser ?? '?'} browser.`);
  console.log(`Reports and phone screenshots: ${directory}`);
  if (!summary.passed) process.exitCode = 1;
}

async function clientBuild() {
  await buildClient(root);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (process.argv[2] === '--client-build' ? clientBuild() : main()).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
