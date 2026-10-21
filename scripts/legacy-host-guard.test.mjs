import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { assertWorkerHost } from './legacy-host-guard.mjs';
import { applicationRoot } from './worker-build.mjs';
import { startLocalWorker } from './worker-local.mjs';

test('legacy build entrypoints refuse before installs and Railway context cannot build the Worker', async () => {
  assert.doesNotThrow(() => assertWorkerHost({}));
  for (const name of ['RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID', 'RAILWAY_DEPLOYMENT_ID']) assert.throws(() => assertWorkerHost({ [name]: 'synthetic' }), /Railway release refused/);
  const config = JSON.parse(await readFile(path.join(applicationRoot, 'railway.json'), 'utf8'));
  assert.match(config.build.buildCommand, /^node scripts\/legacy-host-guard\.mjs --legacy-entrypoint && /);
  const shell = await readFile(path.join(applicationRoot, 'build.sh'), 'utf8');
  assert.ok(shell.indexOf('node scripts/legacy-host-guard.mjs --legacy-entrypoint') < shell.indexOf('npm install'));
  const execute = promisify(execFile);
  await assert.rejects(execute(process.execPath, ['scripts/legacy-host-guard.mjs', '--legacy-entrypoint'], { cwd: applicationRoot }), error => error.code === 1 && /Railway release refused/.test(error.stderr));
  await assert.rejects(execute(process.execPath, ['scripts/build.mjs'], { cwd: applicationRoot, env: { ...process.env, RAILWAY_DEPLOYMENT_ID: 'synthetic' } }), error => error.code === 1 && /Railway release refused/.test(error.stderr));
});

test('Railway startup is refused before candidate loading, database or secret creation', async () => {
  const directory = path.join(applicationRoot, '.verification', `guard-${randomUUID()}`);
  const prior = process.env.RAILWAY_SERVICE_ID;
  process.env.RAILWAY_SERVICE_ID = 'synthetic';
  try {
    await assert.rejects(startLocalWorker({ directory }), /Railway release refused/);
    await assert.rejects(access(directory), { code: 'ENOENT' });
  } finally {
    if (prior === undefined) delete process.env.RAILWAY_SERVICE_ID;
    else process.env.RAILWAY_SERVICE_ID = prior;
  }
});
