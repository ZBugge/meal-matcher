import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseTarget, releaseEvidence } from './release-target.mjs';

function fixture() {
  const targets = { version: 1, accountId: 'a'.repeat(32), staging: { worker: 'mealmatch-staging', database: 'mealmatch-staging', databaseId: '12345678-1234-1234-1234-123456789012', origin: 'https://stage.example.test' }, production: { worker: 'mealmatch-production', database: 'mealmatch-production', databaseId: '22345678-1234-1234-1234-123456789012', origin: 'https://app.example.test' } };
  const config = { assets: { binding: 'ASSETS', directory: 'client/dist' }, env: Object.fromEntries(['staging', 'production'].map(name => [name, { name: targets[name].worker, account_id: targets.accountId, preview_urls: false, assets: { binding: 'ASSETS', directory: 'client/dist' }, d1_databases: [{ binding: 'DB', database_name: targets[name].database, database_id: targets[name].databaseId, migrations_dir: 'cloudflare/migrations' }] }])) };
  return { targets, config };
}
test('remote release refuses unconfigured, inherited, wrong-account and shared targets', () => {
  const { targets, config } = fixture();
  assert.equal(releaseTarget(config, targets, 'staging', targets.accountId).worker, 'mealmatch-staging');
  assert.throws(() => releaseTarget(config, targets, undefined, targets.accountId));
  assert.throws(() => releaseTarget(config, targets, 'staging', 'b'.repeat(32)));
  config.env.staging.d1_databases[0].database_id = targets.production.databaseId;
  assert.throws(() => releaseTarget(config, targets, 'staging', targets.accountId));
  targets.staging.databaseId = targets.production.databaseId;
  assert.throws(() => releaseTarget(config, targets, 'staging', targets.accountId));
  delete config.env.staging;
  assert.throws(() => releaseTarget(config, targets, 'staging', targets.accountId));
});
test('release rejects stale commit/source, missing gates and over-budget evidence', () => {
  const candidate = { commit: 'abc', sourceSha256: 'hash', workerSha256: 'worker', assetSha256: 'assets' };
  const summary = { ...candidate, passed: true, status: 'passed', durationMs: 119999, counts: { server: 226, client: 155, browser: 39, historical: 201, clientHistorical: 153, browserHistorical: 38 }, results: Array.from({ length: 11 }, () => ({ passed: true })) };
  releaseEvidence(summary, candidate, 'abc', '');
  releaseEvidence({ ...summary, durationMs: 120000, performanceGoalMet: false }, candidate, 'abc', '');
  releaseEvidence({ ...summary, durationMs: 299999, performanceGoalMet: false }, candidate, 'abc', '');
  for (const patch of [{ sourceSha256: 'changed' }, { workerSha256: 'changed' }, { assetSha256: 'changed' }, { durationMs: 300000 }, { durationMs: -1 }, { durationMs: NaN }, { durationMs: Infinity }, { passed: false }, { status: 'failed' }, { results: [] }, { counts: { server: 999, client: 999, browser: 999 } }]) assert.throws(() => releaseEvidence({ ...summary, ...patch }, candidate, 'abc', ''));
  assert.throws(() => releaseEvidence(summary, candidate, 'changed', ''));
  assert.throws(() => releaseEvidence(summary, candidate, 'abc', '?? uncommitted-source.ts'));
  assert.throws(() => releaseEvidence(summary, candidate, 'abc'));
});

test('remote release rejects shared origins including equivalent URL spellings', () => {
  for (const origin of ['https://stage.example.test', 'https://STAGE.example.test:443/']) {
    const { targets, config } = fixture();
    targets.production.origin = origin;
    assert.throws(() => releaseTarget(config, targets, 'staging', targets.accountId), /share an origin/);
  }
});

test('staging can be commissioned while production remains unconfigured', () => {
  const { targets, config } = fixture();
  targets.production.origin = 'UNCONFIGURED';
  targets.production.databaseId = 'UNCONFIGURED';
  assert.equal(releaseTarget(config, targets, 'staging', targets.accountId).environment, 'staging');
  assert.throws(() => releaseTarget(config, targets, 'production', targets.accountId));
  targets.production.origin = 'malformed';
  assert.throws(() => releaseTarget(config, targets, 'staging', targets.accountId));
});
