import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkBrain } from './check-brain.mjs';

const script = fileURLToPath(new URL('./check-brain.mjs', import.meta.url));

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mealmatch-brain-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    'Ideas.md': '# Ideas\n- **MM-I001 — Side dishes:** Think about sides.\n',
    'brain/README.md': '# Brain\n[Ideas](../Ideas.md)\n',
    'brain/STATE.md': '# State\n[Current digest](digests/2026-10-13.md)\n',
    'brain/DECISIONS.md': '# Decisions\n',
    'brain/digests/2026-10-13.md': '# Digest\n\n## Summary\n- Captured MM-I001.\n\n## Decision queue\n- [ ] MM-D001: Choose the pilot.\n',
    ...overrides,
  };
  for (const [file, content] of Object.entries(files)) {
    if (content === null) continue;
    const absolute = path.join(root, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  return root;
}

test('healthy memory validates through the public CLI and JSON output', async t => {
  const root = await fixture(t);
  const result = spawnSync(process.execPath, [script, '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.checkedFiles.length, 5);
  assert.deepEqual(report.errors, []);
});

test('required missing files produce a failed CLI result', async t => {
  const root = await fixture(t, { 'brain/DECISIONS.md': null });
  const result = spawnSync(process.execPath, [script, '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).errors[0].message, /Required file is missing/);
});

test('limits count UTF-8 bytes in state, readme, and digests', async t => {
  const root = await fixture(t, {
    'brain/STATE.md': 'é'.repeat(4097),
    'brain/README.md': 'x'.repeat(8193),
    'brain/digests/2026-10-13.md': 'x'.repeat(12289),
  });
  const result = await checkBrain(root);
  assert.equal(result.errors.filter(error => /bytes exceeds/.test(error.message)).length, 3);
});

test('broken relative links fail, with spaces and angle brackets supported', async t => {
  const root = await fixture(t, {
    'brain/briefs/side dishes.md': '# Side dishes\n',
    'brain/README.md': '[Spaces](briefs/side dishes.md#details)\n[Angles](<briefs/side dishes.md>)\n[Title](<briefs/side dishes.md> "Title")\n[Encoded](briefs/side%20dishes.md)\n[Remote](https://example.com)\n[Email](mailto:a@example.com)\n[Anchor](#example)\n[Missing](briefs/missing.md)\n',
  });
  const result = await checkBrain(root);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Broken file link "briefs\/missing.md"/);
});

test('summary and open decision limits are scoped to their sections', async t => {
  const summary = Array.from({ length: 9 }, () => '- Update').join('\n');
  const queue = Array.from({ length: 11 }, (_, index) => `- [ ] MM-D${String(index + 1).padStart(3, '0')}: Pending`).join('\n');
  const root = await fixture(t, { 'brain/digests/2026-10-13.md': `## Summary\n${summary}\n## Decision queue\n${queue}\n` });
  const result = await checkBrain(root);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.some(error => /Summary has 9/.test(error.message)));
  assert.ok(result.errors.some(error => /11 open entries/.test(error.message)));
});

test('closed decisions and other section bullets do not consume open queue capacity', async t => {
  const closed = Array.from({ length: 12 }, (_, index) => `- [x] MM-D${String(index + 1).padStart(3, '0')}: Resolved`).join('\n');
  const root = await fixture(t, { 'brain/digests/2026-10-13.md': `## Summary\n- One update\n## Decision queue\n${closed}\n## Details\n${'- Detail\n'.repeat(20)}` });
  assert.equal((await checkBrain(root)).ok, true);
});

test('malformed and duplicate idea IDs are rejected', async t => {
  const root = await fixture(t, { 'Ideas.md': '- **MM-I001:** First\n- **MM-I001:** Duplicate\n- **MM-I12:** Malformed\n' });
  const result = await checkBrain(root);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.some(error => /Duplicate idea ID MM-I001/.test(error.message)));
  assert.ok(result.errors.some(error => /Malformed idea ID MM-I12/.test(error.message)));
});

test('missing, malformed, multiple, and duplicate decision IDs are rejected', async t => {
  const root = await fixture(t, { 'brain/digests/2026-10-13.md': '## Decision queue\n- [ ] Missing ID\n- [ ] MM-D1: Malformed\n- [ ] MM-D001: First\n- [x] MM-D001: Duplicate\n- [ ] MM-D002 / MM-D003: Ambiguous\n' });
  const result = await checkBrain(root);
  assert.equal(result.errors.length, 4);
  assert.ok(result.errors.some(error => /Duplicate decision ID MM-D001/.test(error.message)));
});

test('only Ideas and brain markdown are inspected', async t => {
  const root = await fixture(t, { 'docs/unrelated.md': '[Broken](missing.md)', 'brain/data.txt': '[Broken](missing.md)' });
  const result = await checkBrain(root);
  assert.equal(result.ok, true);
  assert.equal(result.checkedFiles.length, 5);
});

test('linked directories are not traversed', async t => {
  const root = await fixture(t, { 'outside/broken.md': '[Broken](missing.md)' });
  await symlink(path.join(root, 'outside'), path.join(root, 'brain', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = await checkBrain(root);
  assert.equal(result.ok, true);
  assert.equal(result.checkedFiles.length, 5);
});
