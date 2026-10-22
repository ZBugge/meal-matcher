import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function smoke(url, expectedIdentity) {
  const origin = new URL(url);
  assert(origin.protocol === 'https:' || (origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname)), 'Use HTTPS or an explicit loopback URL');
  assert(!origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash, 'Use an origin without credentials, paths or queries');
  const request = async (route, headers = {}) => {
    const response = await fetch(new URL(route, origin), { headers, redirect: 'manual', signal: AbortSignal.timeout(5000) });
    assert(response.status < 300 || response.status >= 400, 'Smoke requests must not redirect to another origin');
    return response;
  };
  const health = await request('/api/health');
  assert.equal(health.status, 200, 'Worker/schema health failed');
  assert.equal((await health.json()).status, 'ok');
  assert.equal(health.headers.get('cache-control'), 'no-store');
  if (expectedIdentity) {
    const identity = await request('/api/deployment');
    assert.equal(identity.status, 200, 'Serving deployment identity is missing');
    assert.equal(identity.headers.get('cache-control'), 'no-store');
    assert.match(identity.headers.get('content-type') || '', /application\/json/);
    const actual = await identity.json();
    for (const field of ['environment', 'commit', 'sourceSha256', 'workerSha256', 'assetSha256']) {
      assert(typeof expectedIdentity[field] === 'string' && expectedIdentity[field], `Missing expected deployment ${field}`);
      assert.equal(actual[field], expectedIdentity[field], `Serving deployment ${field} differs from verified release`);
    }
  }
  for (const route of ['/api', '/api/release-smoke-unknown']) {
    const response = await request(route, { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' });
    assert.equal(response.status, 404, 'Unknown API request must remain JSON');
    assert.match(response.headers.get('content-type') || '', /application\/json/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    await response.json();
  }
  for (const route of ['/', '/week', '/shopping', '/recipes', '/join/SMOKE2', '/results/release-smoke']) {
    const response = await request(route, { Accept: 'text/html' });
    assert.equal(response.status, 200, 'SPA deep link failed');
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    assert.match(await response.text(), /<div id="root"><\/div>/);
  }
  return { success: true, origin: origin.origin, checks: ['database-health', ...(expectedIdentity ? ['deployment-identity'] : []), 'api-json-no-store', 'spa-deep-links'], syntheticWrites: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--url') throw new Error('Usage: node scripts/smoke.mjs --url <explicit-origin>');
  smoke(args[1]).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
