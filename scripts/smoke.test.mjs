import test from 'node:test';
import assert from 'node:assert/strict';
import { smoke } from './smoke.mjs';

const identity = { environment: 'staging', commit: 'a'.repeat(40), sourceSha256: 'b'.repeat(64), workerSha256: 'c'.repeat(64), assetSha256: 'd'.repeat(64) };
function transport(actual = identity, override) {
  return async url => {
    assert.equal(url.origin, 'https://staging.example.test');
    if (url.pathname === '/api/deployment') return override?.() ?? Response.json(actual, { headers: { 'Cache-Control': 'no-store' } });
    if (url.pathname === '/api/health') return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
    if (url.pathname.startsWith('/api')) return Response.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new Response('<div id="root"></div>', { headers: { 'Content-Type': 'text/html' } });
  };
}

test('release smoke accepts the exact serving candidate and performs only read requests', async t => {
  t.mock.method(globalThis, 'fetch', transport());
  const result = await smoke('https://staging.example.test', identity);
  assert(result.checks.includes('deployment-identity'));
  assert.equal(result.syntheticWrites, false);
  for (const call of fetch.mock.calls) {
    assert.equal(call.arguments[1].method, undefined);
    assert.equal(call.arguments[1].redirect, 'manual');
  }
});

test('generic healthy app, wrong environment, stale code or assets cannot pass release smoke', async t => {
  const mock = t.mock.method(globalThis, 'fetch', transport());
  for (const field of Object.keys(identity)) {
    mock.mock.mockImplementation(transport({ ...identity, [field]: 'stale' }));
    await assert.rejects(smoke('https://staging.example.test', identity), /differs from verified release/);
  }
  for (const response of [
    () => Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } }),
    () => Response.json(identity),
    () => new Response(null, { status: 302, headers: { Location: 'https://production.example.test' } }),
    () => Response.json({ error: 'unconfigured' }, { status: 503 }),
  ]) {
    mock.mock.mockImplementation(transport(identity, response));
    await assert.rejects(smoke('https://staging.example.test', identity));
  }
});
