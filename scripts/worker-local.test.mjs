import test from 'node:test';
import assert from 'node:assert/strict';
import { localAssetOptions } from './worker-local.mjs';

test('local routing derives shipped Worker-first rules and SPA configuration', () => {
  const config = { main: 'cloudflare/worker.ts', compatibility_date: '2025-09-15', compatibility_flags: ['nodejs_compat'], assets: { directory: 'client/dist', binding: 'ASSETS', run_worker_first: ['/api', '/api/*'], not_found_handling: 'single-page-application' } };
  const options = localAssetOptions(config, '/fixture');
  assert.deepEqual(options.routerConfig, { has_user_worker: true, static_routing: { user_worker: ['/api', '/api/*'], asset_worker: [] } });
  delete config.assets.run_worker_first;
  delete config.assets.not_found_handling;
  const changed = localAssetOptions(config, '/fixture');
  assert.equal(changed.routerConfig.static_routing, undefined);
  assert.equal(changed.assetConfig.not_found_handling, undefined);
  config.assets.binding = 'WRONG';
  assert.throws(() => localAssetOptions(config, '/fixture'));
});
