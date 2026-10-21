import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMutation, mutations, probeSource, runAuditCases, auditCasePaths, writeAuditGitPointer } from './audit-adversarial.mjs';
import path from 'node:path';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { validateMutationFailure } from './adversarial-report.mjs';

test('copied audit Git metadata supports ordinary checkouts and absolute or relative worktree pointers', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'mealmatch-audit-git-'));
  try {
    const checkout = path.join(fixture, 'checkout');
    const metadata = path.join(checkout, '.git');
    await mkdir(metadata, { recursive: true });
    await writeFile(path.join(metadata, 'HEAD'), 'synthetic head\n');
    const worktreeMetadata = path.join(metadata, 'worktrees', 'example');
    await mkdir(worktreeMetadata, { recursive: true });
    for (const kind of ['directory', 'absolute', 'relative']) {
      const root = kind === 'directory' ? checkout : path.join(fixture, kind);
      const copy = path.join(fixture, 'copy-' + kind);
      await mkdir(copy);
      if (kind !== 'directory') {
        await mkdir(root);
        const target = kind === 'relative' ? path.relative(root, worktreeMetadata) : worktreeMetadata;
        await writeFile(path.join(root, '.git'), `gitdir: ${target}\n`);
      }
      await writeAuditGitPointer(root, copy);
      assert.equal((await lstat(path.join(copy, '.git'))).isFile(), true);
      assert.equal(await readFile(path.join(copy, '.git'), 'utf8'), `gitdir: ${await realpath(kind === 'directory' ? metadata : worktreeMetadata)}\n`);
      await assert.rejects(writeAuditGitPointer(root, copy), { code: 'EEXIST' });
    }
    assert.equal(await readFile(path.join(metadata, 'HEAD'), 'utf8'), 'synthetic head\n');
    const malformed = path.join(fixture, 'malformed');
    await mkdir(malformed);
    await writeFile(path.join(malformed, '.git'), 'unexpected metadata\n');
    await assert.rejects(writeAuditGitPointer(malformed, fixture), /invalid .git pointer/);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test('six distinct Worker regressions require exact source anchors', () => {
  assert.equal(mutations.length, 6); assert.equal(new Set(mutations.map(value => value.id)).size, 6);
  for (const mutation of mutations) {
    assert.equal(applyMutation(mutation.from, mutation), mutation.to);
    assert.throws(() => applyMutation('', mutation), /missing or ambiguous/);
    assert.throws(() => applyMutation(mutation.from + mutation.from, mutation), /missing or ambiguous/);
  }
});

test('mutation anchors match the current production route sources', async () => {
  for (const mutation of mutations) {
    const source = await readFile(new URL('../' + mutation.file, import.meta.url), 'utf8');
    assert.notEqual(applyMutation(source, mutation), source);
  }
});

test('each audit case uses short distinct copied source, bundle and state paths', () => {
  const root = path.resolve('.verification/a-12345678');
  const cases = [undefined, ...mutations].map(mutation => auditCasePaths(root, mutation));
  assert.equal(new Set(cases.map(value => value.copiedRoot)).size, 7);
  assert.deepEqual(cases.map(value => value.id), ['control', ...mutations.map(value => value.id)]);
  for (const value of cases) {
    assert.equal(path.dirname(value.copiedRoot), root);
    assert.equal(path.basename(value.copiedRoot).length, 1);
    assert.equal(value.bundleDirectory, path.join(value.copiedRoot, '.verification/b'));
    assert.equal(value.stateDirectory, path.join(value.copiedRoot, '.verification/s'));
  }
  assert.throws(() => auditCasePaths(root, { id: 'unknown' }), /Unknown audit mutation/);
});

test('control completes before a bounded pair of mutant jobs', async () => {
  let controlPassed = false, active = 0, maximum = 0;
  const seen = [];
  await runAuditCases(async mutation => {
    if (!mutation) { controlPassed = true; return; }
    assert.equal(controlPassed, true);
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setImmediate(resolve));
    seen.push(mutation.id); active--;
  });
  assert.equal(maximum, 2);
  assert.deepEqual(seen.sort(), mutations.map(value => value.id).sort());
});

test('failed control prevents mutants and a failed mutant drains active work', async () => {
  let calls = 0;
  await assert.rejects(runAuditCases(async () => { calls++; throw new Error('control failed'); }), /control failed/);
  assert.equal(calls, 1);
  let activeFinished = false, mutantCalls = 0;
  await assert.rejects(runAuditCases(async mutation => {
    if (!mutation) return;
    mutantCalls++;
    if (mutation === mutations[0]) throw new Error('build failed');
    await new Promise(resolve => setImmediate(resolve));
    activeFinished = true;
  }), /build failed/);
  assert.equal(mutantCalls, 2);
  assert.equal(activeFinished, true);
});
test('probe selects copied compiled Worker and restarts persisted D1', () => {
  assert.match(probeSource, /MEALMATCH_TEST_ROOT/); assert.match(probeSource, /MEALMATCH_TEST_BUNDLE_DIRECTORY/);
  assert.match(probeSource, /getD1Database\('DB'\)/); assert.match(probeSource, /migrate: false/);
  assert.doesNotMatch(probeSource, /sql\.js|\.skip\(/);
  for (const mutation of mutations) assert.ok(probeSource.includes(`probe('${mutation.id}'`));
});
test('process and skipped or wrong failures cannot catch mutants', () => {
  const mutation = mutations[0], assertion = { fullName: mutation.id, title: mutation.id, status: 'failed', failureMessages: ['AssertionError: audit:invalid-vote expected 400'] };
  const report = { numTotalTests: 6, numPassedTests: 5, numFailedTests: 1, testResults: [{ assertionResults: [assertion, ...Array.from({ length: 5 }, (_, i) => ({ fullName: 'pass' + i, status: 'passed' }))] }] };
  assert.deepEqual(validateMutationFailure({ exitCode: 1 }, report, 6, mutation), [mutation.id]);
  const unrelated = structuredClone(report); unrelated.testResults[0].assertionResults[0].failureMessages = ['AssertionError: fixture failed'];
  assert.throws(() => validateMutationFailure({exitCode:1},unrelated,6,mutation));
  for (const exitCode of [0, 2]) assert.throws(() => validateMutationFailure({ exitCode }, report, 6, mutation));
  for (const status of ['skipped', 'pending']) assert.throws(() => validateMutationFailure({ exitCode: 1 }, { ...report, testResults: [{ assertionResults: [{ ...assertion, status }] }] }, 6, mutation));
  assert.throws(() => validateMutationFailure({ exitCode: 1 }, { ...report, testResults: [{ assertionResults: [{ ...assertion, failureMessages: ['SyntaxError: build failed'] }] }] }, 6, mutation));
});
