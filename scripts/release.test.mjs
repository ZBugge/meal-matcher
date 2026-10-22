import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseSequence } from './release.mjs';
import { readFile } from 'node:fs/promises';

test('staging CI authority cannot publish production or receive production credentials', async () => {
  const workflow = await readFile(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8');
  assert.match(workflow, /environment: cloudflare-staging/);
  assert.match(workflow, /MEALMATCH_HOSTED_AUTHORITY: staging-authorized/);
  assert(!workflow.includes('production-authorized'));
  assert(!/run:.*deploy:production/.test(workflow));
});

test('failed identity, recovery or migration prevents Worker release; no automatic retry', async () => {
  for (const failure of ['identity', 'stagingEvidence', 'recovery', 'migrate']) {
    const calls = [];
    const steps = Object.fromEntries(['identity', 'stagingEvidence', 'recovery', 'migrate', 'deploy', 'smoke', 'receipt'].map(name => [name, async () => { calls.push(name); if (name === failure) throw new Error('injected'); }]));
    await assert.rejects(releaseSequence('production', steps), /injected/);
    assert(!calls.includes('deploy'));
    assert.equal(calls.filter(name => name === failure).length, 1);
  }
});
test('staging and production release order is explicit and serial', async () => {
  for (const environment of ['staging', 'production']) {
    const calls = [];
    const steps = Object.fromEntries(['identity', 'stagingEvidence', 'recovery', 'migrate', 'deploy', 'smoke', 'receipt'].map(name => [name, async () => calls.push(name)]));
    await releaseSequence(environment, steps);
    assert.deepEqual(calls, environment === 'production' ? ['identity', 'stagingEvidence', 'recovery', 'migrate', 'deploy', 'smoke', 'receipt'] : ['identity', 'migrate', 'deploy', 'smoke', 'receipt']);
  }
});
