import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { runChecks, validateTestReport, validateNodeReport, validateRuntimeReports } from './verify.mjs';
import { validateMutationFailure } from './adversarial-report.mjs';
import { VERIFICATION_BUDGET_MS, VERIFICATION_GOAL_MS, verificationTiming } from './verification-policy.mjs';

test('verification retains a two-minute speed goal with an independent five-minute ceiling', () => {
  assert.equal(VERIFICATION_BUDGET_MS, 300000);
  assert.equal(VERIFICATION_GOAL_MS, 120000);
  assert.equal(verificationTiming(119999).performanceGoalMet, true);
  assert.deepEqual(verificationTiming(120001), { durationMs: 120001, budgetMs: 300000, performanceGoalMs: 120000, performanceGoalMet: false });
});

async function assertProcessStopped(pid, { settleMs = 1_000 } = {}) {
  const deadline = performance.now() + settleMs;
  while (true) {
    try { process.kill(pid, 0); }
    catch (error) { assert.equal(error.code, 'ESRCH'); return; }
    if (process.platform === 'linux') {
      try {
        // SIGKILL delivery and init's reaping are asynchronous. A zombie has
        // released its resources; every live state must settle or fail below.
        const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
        if (stat.match(/^\d+ \(.+\) ([A-Z])/s)?.[1] === 'Z') return;
      } catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return; throw error; }
    }
    if (performance.now() >= deadline) assert.fail(`Process ${pid} is still running`);
    await delay(20);
  }
}

const browserReport = () => ({ stats: { expected: 39, unexpected: 0, skipped: 0, flaky: 0 }, suites: [{ specs: Array.from({ length: 39 }, () => ({ tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0, errors: [] }] }] })) }] });

test('missing counts, skipped tests, and insufficient coverage cannot validate as successful reports', () => {
  assert.equal(validateTestReport('browser', browserReport()), 39);
  assert.equal(validateTestReport('server', { success: true, numPassedTests: 226, numTotalTests: 226, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0 }), 226);
  assert.throws(() => validateTestReport('browser', { stats: {} }), /malformed/);
  assert.throws(() => validateTestReport('client', { success: true }), /malformed/);
  assert.throws(() => validateTestReport('browser', { stats: { expected: 22, unexpected: 0, skipped: 1, flaky: 0 } }), /skipped/);
  assert.throws(() => validateTestReport('browser', { stats: { expected: 21, unexpected: 0, skipped: 0, flaky: 0 } }), /missing/);
  assert.throws(() => validateTestReport('server', { success: true, numPassedTests: 35, numTotalTests: 35, numFailedTests: '0', numPendingTests: 0, numTodoTests: 0 }), /malformed/);
});

test('Node regression reports cannot hide skips, cancellation or missing assertions', () => {
  const report = '# tests 48\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  assert.equal(validateNodeReport(report, 48), 48);
  assert.throws(() => validateNodeReport(report.replace('# skipped 0', '# skipped 1'), 48), /skipped/);
  assert.throws(() => validateNodeReport(report.replace('# cancelled 0', '# cancelled 1'), 48), /cancelled/);
  assert.throws(() => validateNodeReport(report.replace('# tests 48', '# tests 0'), 48), /missing/);
});

test('runtime foundation totals cannot conceal missing restored-application coverage', () => {
  const report = count => `# tests ${count}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
  assert.deepEqual(validateRuntimeReports(report(28), report(7)), { foundations: 28, recovery: 7, total: 35 });
  assert.throws(() => validateRuntimeReports(report(35), report(0)), /missing/);
  assert.throws(() => validateRuntimeReports(report(27), report(8)), /missing/);
  assert.throws(() => validateRuntimeReports(report(28), ''), /missing/);
  assert.throws(() => validateRuntimeReports(report(28), report(7).replace('# skipped 0', '# skipped 1')), /skipped/);
});

test('a mutant setup error or unrelated mismatch cannot count as an assertion detecting the bug', () => {
  const mutation = { id: 'vote', expected: 'rejects invalid vote', assertion: /^expected 200 to be 400/ };
  const failed = { status: 'failed', fullName: 'API rejects invalid vote', failureMessages: ['beforeEach: database unavailable'] };
  const report = { numTotalTests: 2, numFailedTests: 1, numPassedTests: 1, testResults: [{ assertionResults: [failed, { status: 'passed' }] }] };
  assert.throws(() => validateMutationFailure({ exitCode: 1 }, report, 2, mutation), /intended/);
  failed.failureMessages = ['expected 500 to be 400'];
  assert.throws(() => validateMutationFailure({ exitCode: 1 }, report, 2, mutation), /intended/);
  failed.failureMessages = ['expected 200 to be 400 // Object.is equality'];
  assert.equal(validateMutationFailure({ exitCode: 1 }, report, 2, mutation).length, 1);
  assert.throws(() => validateMutationFailure({ exitCode: 0 }, report, 2, mutation), /survived/);
});

test('expected failures and missing actual browser assertions cannot masquerade as passing', () => {
  const disguised = browserReport();
  disguised.suites[0].specs[0].tests[0].expectedStatus = 'failed';
  disguised.suites[0].specs[0].tests[0].results[0].status = 'failed';
  assert.throws(() => validateTestReport('browser', disguised), /malformed/);
  assert.throws(() => validateTestReport('browser', { ...browserReport(), suites: [] }), /malformed/);
});

test('dependencies wait for successful output and never run after a failed prerequisite', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mealmatch-verify-dependencies-'));
  const output = path.join(directory, 'build-output');
  const report = await runChecks([
    { id: 'production', name: 'Production', dependsOn: ['build'], args: ['-e', "require('node:fs').readFileSync(process.argv[1]);", output] },
    { id: 'build', name: 'Build', args: ['-e', "setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'built'), 75);", output] },
    { id: 'bad-build', name: 'Failed build', args: ['-e', 'process.exitCode = 9'] },
    { id: 'blocked', name: 'Blocked', dependsOn: ['bad-build'], args: ['-e', "throw new Error('must never run')"] },
  ], { directory, budgetMs: 5_000 });
  assert.equal(report.results[0].passed, true);
  assert.equal(report.results[3].exitCode, null);
  assert.equal(report.results[3].passed, false);
  assert.match(await readFile(report.results[3].log, 'utf8'), /Blocked/);
});

test('unknown and cyclic dependencies fail before spawning checks', async () => {
  const options = { directory: os.tmpdir(), budgetMs: 5_000 };
  await assert.rejects(runChecks([{ id: 'a', dependsOn: ['missing'] }], options), /Unknown/);
  await assert.rejects(runChecks([{ id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['a'] }], options), /Circular/);
});

test('a failed gate remains failed while independent gates finish and keep their logs', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mealmatch-verify-failure-'));
  const report = await runChecks([
    { id: 'failure', name: 'Failing gate', args: ['-e', "console.error('intentional failure'); process.exitCode = 7"] },
    { id: 'success', name: 'Independent gate', args: ['-e', "setTimeout(() => console.log('independent gate finished'), 150)"] },
  ], { directory, budgetMs: 5_000 });
  assert.equal(report.results.length, 2);
  assert.equal(report.results[0].passed, false);
  assert.equal(report.results[0].exitCode, 7);
  assert.equal(report.results[1].passed, true);
  assert.match(await readFile(report.results[0].log, 'utf8'), /intentional failure/);
  assert.match(await readFile(report.results[1].log, 'utf8'), /independent gate finished/);
  assert.equal(report.timedOut, false);
  assert.deepEqual(report.cleanupErrors, []);
});

test('the time budget stops a stuck gate and its descendant instead of reporting success', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mealmatch-verify-deadline-'));
  const descendantPid = path.join(directory, 'descendant.pid');
  const fixture = `
    const { spawn } = require('node:child_process');
    const { writeFileSync } = require('node:fs');
    const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    writeFileSync(process.argv[1], String(descendant.pid));
    setInterval(() => {}, 1000);
  `;
  const report = await runChecks([
    { id: 'stuck', name: 'Stuck gate', args: ['-e', fixture, descendantPid] },
  ], { directory, budgetMs: 500 });
  assert.equal(report.timedOut, true);
  assert.equal(report.results[0].passed, false);
  assert.ok(report.durationMs < 5_000, 'cleanup must not hang indefinitely');
  assert.deepEqual(report.cleanupErrors, []);
  const pid = Number(await readFile(descendantPid, 'utf8'));
  await assertProcessStopped(pid);
  await assert.rejects(assertProcessStopped(process.pid, { settleMs: 0 }), /still running/);
});
