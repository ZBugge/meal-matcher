import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarizeDelivery } from './delivery-metrics.mjs';

const at = second => new Date(Date.UTC(2026, 9, 16, 0, 0, second)).toISOString();
const phase = (id, kind, start, end) => ({ id, kind, startedAt: at(start), finishedAt: at(end) });
const fixture = () => ({ version: 1, id: 'trial', startedAt: at(0), finishedAt: at(100),
  phases: [phase('a', 'builder', 10, 50), phase('b', 'builder', 20, 60), phase('r', 'review', 70, 90), phase('v', 'verification', 70, 100)],
  quality: { verificationPassed: true, reviewPassed: true, ownershipPassed: true },
  usage: { totalTokens: 100, sequentialBaselineTokens: 100 } });

test('records builder union and final gate overlap without claiming a benchmark', () => {
  const result = summarizeDelivery(fixture());
  assert.deepEqual(result.observed, { elapsedMs: 100000, builderUnionMs: 50000, builderSummedMs: 80000,
    builderOverlapMs: 30000, nonbuilderElapsedMs: 50000, finalGateUnionMs: 30000, finalGateSummedMs: 50000 });
  assert.equal(result.counterfactual.estimatedSequentialMs, 150000);
  assert.ok(Math.abs(result.counterfactual.estimatedSavingPercent - 100 / 3) < 1e-10);
  assert.match(result.counterfactual.label, /not a measured sequential benchmark/);
  assert.equal(result.timingTarget.met, true);
  assert.equal(result.costNeutralityTarget.met, true);
});

test('zero duration intervals and touching boundaries use half-open concurrency', () => {
  const input = fixture();
  input.phases = [phase('a', 'builder', 0, 10), phase('b', 'builder', 0, 10), phase('c', 'builder', 10, 20), phase('zero', 'builder', 5, 5)];
  assert.equal(summarizeDelivery(input).observed.builderOverlapMs, 10000);
  input.finishedAt = input.startedAt;
  input.phases = [phase('zero', 'builder', 0, 0)];
  const result = summarizeDelivery(input);
  assert.equal(result.counterfactual.estimatedSequentialMs, 0);
  assert.equal(result.timingTarget.met, null);
});

test('rejects triple concurrency and gates before builder completion', () => {
  const input = fixture();
  input.phases.push(phase('third', 'builder', 30, 40));
  assert.throws(() => summarizeDelivery(input), /at most two builders/);
  input.phases.pop();
  input.phases[2].startedAt = at(40);
  assert.throws(() => summarizeDelivery(input), /after all builders finish/);
});

test('rejects invalid, missing, unordered and out-of-run timestamps', () => {
  for (const value of [undefined, null, 0, '', '2026-02-30T00:00:00Z', '2026-10-16', '2026-10-16T24:00:00Z', 'garbage']) {
    const input = fixture();
    input.finishedAt = value;
    assert.throws(() => summarizeDelivery(input), /timestamp/);
  }
  for (const [start, end] of [[20, 10], [-1, 10], [0, 101]]) {
    const input = fixture();
    input.phases = [phase('bad', 'builder', start, end)];
    assert.throws(() => summarizeDelivery(input), /ordered and inside/);
  }
  const input = fixture();
  input.finishedAt = at(-1);
  assert.throws(() => summarizeDelivery(input), /at or after/);
});

test('quality evidence is required and failed quality cannot pass', () => {
  for (const quality of [undefined, {}, { verificationPassed: true, reviewPassed: true }]) {
    assert.throws(() => summarizeDelivery({ ...fixture(), quality }), /quality/);
  }
  const input = fixture();
  input.quality.reviewPassed = false;
  assert.equal(summarizeDelivery(input).qualityPassed, false);
});

test('separates favorable inferred timing from unfavorable or unknown usage', () => {
  const input = fixture();
  input.usage.totalTokens = 120;
  const result = summarizeDelivery(input);
  assert.equal(result.timingTarget.met, true);
  assert.equal(result.costNeutralityTarget.met, false);
  assert.equal(result.usage.ratio, 1.2);
  for (const usage of [{ totalTokens: null, sequentialBaselineTokens: 100 }, { totalTokens: 100, sequentialBaselineTokens: null }, { totalTokens: 0, sequentialBaselineTokens: 0 }]) {
    const unknown = summarizeDelivery({ ...input, usage });
    assert.equal(unknown.usage.status, 'unknown');
    assert.equal(unknown.costNeutralityTarget.met, null);
  }
});

test('validates structure, finite usage, unique IDs and phase kinds', () => {
  for (const mutate of [input => { input.version = 2; }, input => { input.phases = null; },
    input => { input.phases[1].id = 'a'; }, input => { input.phases[0].kind = 'unknown'; },
    input => { input.usage.totalTokens = Infinity; }, input => { input.usage.totalTokens = -1; },
    input => { delete input.usage.totalTokens; }]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => summarizeDelivery(input));
  }
});

test('CLI reports clean JSON errors, and imports have no CLI side effects', () => {
  const script = fileURLToPath(new URL('./delivery-metrics.mjs', import.meta.url));
  for (const args of [[], ['report', 'nonexistent-delivery-metrics-file.json']]) {
    const child = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(child.status, 1);
    assert.equal(child.stdout, '');
    assert.equal(typeof JSON.parse(child.stderr).error, 'string');
  }
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('./delivery-metrics.mjs', import.meta.url).href)})`], { encoding: 'utf8' });
  assert.equal(child.status, 0);
  assert.equal(child.stdout + child.stderr, '');
});

test('CLI accepts a recorded fixture and rejects malformed JSON', () => {
  const directory = mkdtempSync(join(tmpdir(), 'delivery-metrics-'));
  const file = join(directory, 'run.json');
  const script = fileURLToPath(new URL('./delivery-metrics.mjs', import.meta.url));
  try {
    writeFileSync(file, JSON.stringify(fixture()));
    const success = spawnSync(process.execPath, [script, 'report', file], { encoding: 'utf8' });
    assert.equal(success.status, 0);
    assert.deepEqual(JSON.parse(success.stdout), summarizeDelivery(fixture()));
    assert.equal(success.stderr, '');
    writeFileSync(file, '{broken');
    const failure = spawnSync(process.execPath, [script, 'report', file], { encoding: 'utf8' });
    assert.equal(failure.status, 1);
    assert.equal(typeof JSON.parse(failure.stderr).error, 'string');
  } finally {
    rmSync(file, { force: true });
    rmdirSync(directory);
  }
});
