import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runHandoff } from './delivery-handoff.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });

async function fixture(t, stub = '') {
  const prefix = path.join(await realpath(tmpdir()), 'mealmatch-handoff-');
  const temporary = await mkdtemp(prefix);
  t.after(async () => {
    const resolved = await realpath(temporary);
    assert.ok(resolved.startsWith(prefix) && path.dirname(resolved) === path.dirname(prefix));
    await rm(resolved, { recursive: true, force: true });
  });
  const origin = path.join(temporary, 'origin');
  const tree = path.join(temporary, 'builder');
  await mkdir(path.join(origin, 'client/src'), { recursive: true });
  await mkdir(path.join(origin, 'server/src'), { recursive: true });
  await writeFile(path.join(origin, '.gitignore'), '.verification/\n');
  await writeFile(path.join(origin, 'client/src/owned.ts'), 'export const value = 1;\n');
  await writeFile(path.join(origin, 'server/src/owned.ts'), 'export const value = 1;\n');
  await writeFile(path.join(origin, 'other.txt'), 'other\n');
  git(origin, 'init', '--quiet');
  git(origin, 'config', 'user.email', 'fixture@example.invalid');
  git(origin, 'config', 'user.name', 'Handoff fixture');
  git(origin, 'config', 'core.autocrlf', 'false');
  git(origin, 'add', '.');
  git(origin, 'commit', '--quiet', '-m', 'fixture');
  const baseSha = git(origin, 'rev-parse', 'HEAD').trim();
  git(origin, 'worktree', 'add', '--quiet', '-b', 'builder', tree);
  const contract = {
    version: 1, id: 'handoff-fixture', baseSha,
    acceptance: ['Build before handoff'], sharedContract: 'Exact files', overheadMinutes: 1,
    coordinator: { owner: 'lead', worktree: origin, files: ['other.txt'] },
    builders: [{ owner: 'worker', worktree: tree, files: ['client/src/owned.ts', 'server/src/owned.ts'],
      acceptance: ['Build passes'], checks: ['DO NOT EXECUTE THIS'], estimatedMinutes: 3 }],
    integrationOrder: ['worker'], budget: { maxDelegatedTurns: 4, maxImplementationAttempts: 2 },
  };
  const contractPath = path.join(temporary, 'contract.json');
  const npmCli = path.join(temporary, 'npm-cli.cjs');
  await writeFile(npmCli, `const fs = require('node:fs'); const cp = require('node:child_process');\n${stub}`);
  const save = () => writeFile(contractPath, JSON.stringify(contract));
  await save();
  return { temporary, origin, tree, contract, contractPath, npmCli, save,
    run: () => runHandoff(contractPath, 'worker', { cwd: tree, npmCli }) };
}

test('immutable successful receipt binds contract, HEAD, source and complete status; descriptive checks never execute', async t => {
  const f = await fixture(t, `if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['--prefix', process.argv[3], 'run', 'build'])) process.exit(9); console.log(process.argv[3]);`);
  const marker = path.join(f.temporary, 'must-not-exist');
  f.contract.builders[0].checks = [`node -e "require('fs').writeFileSync(${JSON.stringify(marker)}, 'unsafe')"`];
  await f.save();
  await writeFile(path.join(f.tree, 'client/src/owned.ts'), 'export const value = 2;\n');
  const result = await f.run();
  assert.equal(result.passed, true, result.errors.join('\n'));
  assert.deepEqual(result.results.map(check => check.id), ['client-build', 'server-build']);
  assert.deepEqual(result.before, result.after);
  assert.equal(result.head, f.contract.baseSha);
  assert.match(result.contractHash, /^[a-f0-9]{64}$/);
  assert.match(result.sourceHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(await readFile(result.receiptPath)).passed, true);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
  assert.match(await readFile(result.results[0].log, 'utf8'), /client/);
});

test('failed package build cannot yield a passing receipt', async t => {
  const f = await fixture(t, 'console.error("typescript error"); process.exit(2);');
  const result = await f.run();
  assert.equal(result.passed, false);
  assert.equal(result.results[0].exitCode, 2);
  assert.match(await readFile(result.results[0].log, 'utf8'), /typescript error/);
});

for (const mutation of ['source', 'head', 'status']) test(`${mutation} mutation during a successful build fails the binding`, async t => {
  const script = mutation === 'head'
    ? `cp.execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'mutation']);`
    : `fs.writeFileSync(${JSON.stringify(mutation === 'source' ? 'client/src/owned.ts' : 'unexpected.txt')}, 'mutation');`;
  const f = await fixture(t, `if (process.argv[3] === 'client') { ${script} }`);
  const result = await f.run();
  assert.equal(result.results.every(check => check.passed), true);
  assert.equal(result.passed, false);
  assert.match(result.errors.join('\n'), /changed during|does not own/);
});

for (const dirty of ['tracked', 'untracked', 'rename', 'committed-rename']) test(`rejects out-of-allowlist ${dirty} changes before building`, async t => {
  const f = await fixture(t, 'throw new Error("must not run");');
  if (dirty === 'tracked') await writeFile(path.join(f.tree, 'other.txt'), 'changed');
  if (dirty === 'untracked') await writeFile(path.join(f.tree, 'extra.txt'), 'new');
  if (dirty === 'rename' || dirty === 'committed-rename') {
    f.contract.builders[0].files.push('client/src/renamed.ts');
    await f.save();
    git(f.tree, 'mv', 'other.txt', 'client/src/renamed.ts');
    if (dirty === 'committed-rename') git(f.tree, 'commit', '--quiet', '-m', 'move coordinator file');
  }
  const result = await f.run();
  assert.equal(result.passed, false);
  assert.match(result.errors.join('\n'), /does not own/);
  assert.deepEqual(result.results, []);
});

test('configuration-only assignments run affected builds and cannot pass on a failed build', async t => {
  const f = await fixture(t, 'process.exit(2);');
  f.contract.builders[0].files = ['client/tsconfig.json', 'server/tsconfig.json'];
  await f.save();
  const result = await f.run();
  assert.equal(result.passed, false);
  assert.deepEqual(result.results.map(check => check.id), ['client-build', 'server-build']);
  assert.ok(result.results.every(check => check.exitCode === 2));
});

test('package selection recognizes case aliases and root build inputs', async t => {
  const f = await fixture(t);
  for (const files of [['CLIENT/SRC/OWNED.TS', 'SERVER/SRC/OWNED.TS'], ['package.json']]) {
    f.contract.builders[0].files = files;
    await f.save();
    const result = await f.run();
    assert.equal(result.passed, true, result.errors.join('\n'));
    assert.deepEqual(result.results.map(check => check.id), ['client-build', 'server-build']);
  }
});

test('assignments with no applicable package builds are explicitly unsupported rather than passing', async t => {
  const f = await fixture(t);
  f.contract.builders[0].files = ['notes.md'];
  await f.save();
  const result = await f.run();
  assert.equal(result.passed, false);
  assert.equal(result.notApplicable, true);
  assert.deepEqual(result.results, []);
  assert.match(result.errors.join('\n'), /No affected.*package builds/);
});

test('rejects mismatched checkout, invalid contract, and nonancestor base', async t => {
  const f = await fixture(t);
  let result = await runHandoff(f.contractPath, 'worker', { cwd: f.origin, npmCli: f.npmCli });
  assert.equal(result.passed, false);
  assert.match(result.errors.join('\n'), /does not match/);
  f.contract.baseSha = 'invalid';
  await f.save();
  result = await f.run();
  assert.equal(result.passed, false);
  assert.match(result.errors.join('\n'), /baseSha/);
  f.contract.baseSha = 'a'.repeat(40);
  await f.save();
  result = await f.run();
  assert.equal(result.passed, false);
  assert.deepEqual(result.results, []);
});

test('missing owned files have a stable explicit fingerprint', async t => {
  const f = await fixture(t);
  await rm(path.join(f.tree, 'client/src/owned.ts'));
  const result = await f.run();
  assert.equal(result.passed, true, result.errors.join('\n'));
  assert.equal(result.before.sourceHash, result.after.sourceHash);
});

test('rejects source symlinks escaping the assigned tree', async t => {
  const f = await fixture(t);
  await rm(path.join(f.tree, 'client/src'), { recursive: true });
  await symlink(path.join(f.origin, 'client/src'), path.join(f.tree, 'client/src'), 'junction');
  const result = await f.run();
  assert.equal(result.passed, false);
  assert.match(result.errors.join('\n'), /escapes|does not own/);
  assert.deepEqual(result.results, []);
});

test('rejects dangling source symlinks escaping the assigned tree', async t => {
  const f = await fixture(t);
  await rm(path.join(f.tree, 'client/src'), { recursive: true });
  await symlink(path.join(f.temporary, 'missing'), path.join(f.tree, 'client/src'), 'junction');
  const result = await f.run();
  assert.equal(result.passed, false);
  assert.match(result.errors.join('\n'), /escapes|does not own/);
  assert.deepEqual(result.results, []);
});
