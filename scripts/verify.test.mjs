import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runChecks, validateTestReport } from './verify.mjs';
import { validateMutationFailure } from './adversarial-report.mjs';

const browserReport = () => ({ stats: { expected: 27, unexpected: 0, skipped: 0, flaky: 0 }, suites: [{ specs: Array.from({ length: 27 }, () => ({ tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0, errors: [] }] }] })) }] });

test('missing counts, skipped tests, and insufficient coverage cannot validate as successful reports', () => {
  assert.equal(validateTestReport('browser', browserReport()), 27);
  assert.equal(validateTestReport('server', { success: true, numPassedTests: 104, numTotalTests: 104, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0 }), 104);
  assert.throws(() => validateTestReport('browser', { stats: {} }), /malformed/);
  assert.throws(() => validateTestReport('client', { success: true }), /malformed/);
  assert.throws(() => validateTestReport('browser', { stats: { expected: 22, unexpected: 0, skipped: 1, flaky: 0 } }), /skipped/);
  assert.throws(() => validateTestReport('browser', { stats: { expected: 21, unexpected: 0, skipped: 0, flaky: 0 } }), /missing/);
  assert.throws(() => validateTestReport('server', { success: true, numPassedTests: 35, numTotalTests: 35, numFailedTests: '0', numPendingTests: 0, numTodoTests: 0 }), /malformed/);
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
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
