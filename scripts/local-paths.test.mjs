import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { applicationRoot } from './worker-build.mjs';
import { privateDirectory } from './local-paths.mjs';

test('private directory guard refuses redirection before creating any outside child', async () => {
  const root = path.join(applicationRoot, '.verification/path-guard', randomUUID());
  const outside = path.join(applicationRoot, '.verification/path-guard', randomUUID());
  await mkdir(root, { recursive: true }); await mkdir(outside);
  await symlink(outside, path.join(root, '.verification'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(privateDirectory(root, path.join(root, '.verification/must-not-be-created')), /redirected/);
  await assert.rejects(stat(path.join(outside, 'must-not-be-created')), { code: 'ENOENT' });
  await assert.rejects(privateDirectory(root, outside));
  await assert.rejects(privateDirectory(root, path.join(root, '.wrangler/missing'), { existingOnly: true }), { code: 'ENOENT' });
  assert.equal(await privateDirectory(root, path.join(root, '.wrangler/new')), path.join(root, '.wrangler/new'));
});
