import assert from 'node:assert/strict';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function releaseTarget(config, targets, environment, expectedAccount) {
  assert(['staging', 'production'].includes(environment), 'Choose staging or production explicitly');
  assert(targets.version === 1 && /^[a-f0-9]{32}$/.test(targets.accountId), 'Configure the reviewed Cloudflare account identity first');
  assert.equal(expectedAccount, targets.accountId, 'CLOUDFLARE_ACCOUNT_ID differs from reviewed target');
  const target = targets[environment];
  assert(uuid.test(target.databaseId) && !target.databaseId.startsWith('00000000-'), 'Configure a real environment database identity');
  assert.notEqual(target.databaseId, targets[environment === 'production' ? 'staging' : 'production'].databaseId, 'Staging and production cannot share a database');
  assert.notEqual(target.worker, targets[environment === 'production' ? 'staging' : 'production'].worker, 'Workers must be distinct');
  assert.equal(target.worker, `mealmatch-${environment}`, 'Unexpected Worker target');
  assert.equal(target.database, `mealmatch-${environment}`, 'Unexpected database target');
  const url = new URL(target.origin);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.origin, target.origin, 'Expected a bare HTTPS origin');
  assert(!url.username && !url.password);
  const selected = config.env?.[environment];
  assert(selected && selected.name === target.worker && selected.account_id === targets.accountId, 'Wrangler environment account/Worker mismatch');
  assert(selected.preview_urls === false, 'Disable version preview exposure');
  assert.equal(selected.d1_databases?.length, 1, 'Exactly one database binding is required');
  const db = selected.d1_databases[0];
  assert(db.binding === 'DB' && db.database_id === target.databaseId && db.database_name === target.database, 'Wrangler database target mismatch');
  assert.equal(db.migrations_dir, 'cloudflare/migrations');
  assert(selected.assets?.binding === 'ASSETS' && selected.assets.directory === 'client/dist', 'Explicit same-origin static assets are required');
  assert.deepEqual(selected.assets, config.assets, 'Hosted assets/routing must match the locally tested configuration');
  return { environment, ...target, accountId: targets.accountId };
}

export function releaseEvidence(summary, candidate, head, gitStatus) {
  assert.equal(gitStatus, '', 'Release requires a clean committed checkout, including untracked source');
  assert.equal(candidate.commit, head, 'Candidate commit differs from checked-out release commit');
  assert(summary.passed === true && summary.status === 'passed' && summary.durationMs < 120000, 'A complete passing verification under 120 seconds is required');
  assert.equal(summary.sourceSha256, candidate.sourceSha256, 'Verification belongs to different source');
  for (const name of ['commit', 'workerSha256', 'assetSha256']) assert(typeof candidate[name] === 'string' && candidate[name] && summary[name] === candidate[name], 'Verification does not bind the exact candidate artifacts');
  for (const [label, minimum] of [['server', 226], ['client', 155], ['browser', 39], ['historical', 201], ['clientHistorical', 153], ['browserHistorical', 38]]) assert(summary.counts?.[label] >= minimum, `Missing ${label} verification`);
  assert(summary.results?.length >= 10 && summary.results.every(result => result.passed === true), 'Missing or failed verification gates');
}
