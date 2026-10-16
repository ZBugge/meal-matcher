import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateContract, validateOwnership } from './delivery-contract.mjs';

function fixture() {
  return {
    version: 1, id: 'MM-I009', baseSha: 'a'.repeat(40),
    acceptance: ['Preflight refuses unsafe dispatch'], sharedContract: 'Exact ownership fixed before dispatch',
    overheadMinutes: 2,
    coordinator: { owner: 'lead', worktree: 'C:\\work\\integration', files: ['docs/delivery.md'] },
    builders: [
      { owner: 'validator', worktree: 'C:\\work\\validator', files: ['scripts/contract.mjs'],
        acceptance: ['Reject overlapping paths'], checks: ['node --test'], estimatedMinutes: 4 },
      { owner: 'timing', worktree: 'C:\\work\\timing', files: ['scripts/timing.mjs'],
        acceptance: ['Report measured durations'], checks: ['node --test'], estimatedMinutes: 6 },
    ],
    integrationOrder: ['validator', 'timing'],
    budget: { maxDelegatedTurns: 5, maxImplementationAttempts: 3 },
  };
}

test('accepts measured small slices and either complete integration order', () => {
  const contract = fixture();
  assert.deepEqual(validateContract(contract), []);
  contract.integrationOrder.reverse();
  assert.deepEqual(validateContract(contract), []);
  contract.builders.pop();
  contract.integrationOrder = ['validator'];
  contract.budget.maxDelegatedTurns = 4;
  assert.deepEqual(validateContract(contract), []);
});

test('rejects path collisions across coordinator/builders and within an owner', () => {
  for (const files of [['DOCS\\DELIVERY.MD'], ['scripts/contract.mjs', 'SCRIPTS\\CONTRACT.MJS']]) {
    const contract = fixture();
    contract.builders[0].files = files;
    assert.match(validateContract(contract).join('\n'), /collides/);
  }
});

test('refuses traversal, absolute paths, ambiguous segments and glob syntax', () => {
  for (const file of ['../secret', 'x/../secret', 'x\\..\\secret', '/tmp/file', 'C:\\work\\file',
    '\\\\host\\share\\file', '*.js', 'src/[ab].js', 'src/{a,b}.js', 'src/./file',
    'src//file', 'src/file ', 'src/file.', 'src/', 'file:stream', 'x\u0000y']) {
    const contract = fixture();
    contract.builders[0].files = [file];
    assert.match(validateContract(contract).join('\n'), /exact relative file path/, file);
  }
});

test('requires distinct, absolute, non-nested worktrees including coordinator', () => {
  for (const tree of ['c:/WORK/integration', 'C:/work/integration/child', 'C:/work',
    'C:/work/else/../integration', 'relative/path', 'C:relative']) {
    const contract = fixture();
    contract.builders[0].worktree = tree;
    assert.ok(validateContract(contract).some(error => /worktree/.test(error)), tree);
  }
  const contract = fixture();
  delete contract.coordinator.worktree;
  assert.match(validateContract(contract).join('\n'), /coordinator.worktree/);
  contract.coordinator.worktree = '/';
  contract.builders[0].worktree = '/work/child';
  assert.match(validateContract(contract).join('\n'), /overlaps/);
});

test('validates UNC worktrees and detects Windows aliases', () => {
  const contract = fixture();
  contract.coordinator.worktree = '\\\\host\\share\\integration';
  contract.builders[0].worktree = '\\\\HOST\\share\\integration\\nested';
  assert.match(validateContract(contract).join('\n'), /overlaps/);
  contract.builders[0].worktree = '\\\\host\\share\\builder';
  assert.deepEqual(validateContract(contract), []);
  contract.builders[0].worktree = '//HOST/share/integration';
  assert.match(validateContract(contract).join('\n'), /overlaps/);
  contract.builders[0].worktree = 'C:/work/integration.';
  assert.match(validateContract(contract).join('\n'), /absolute checkout path/);
});

test('enforces full SHA, positive finite timing and policy budgets', () => {
  for (const baseSha of ['097a7da', 'A'.repeat(40), 'g'.repeat(40), null]) {
    assert.match(validateContract({ ...fixture(), baseSha }).join('\n'), /baseSha/);
  }
  for (const budget of [{ maxDelegatedTurns: 6, maxImplementationAttempts: 3 },
    { maxDelegatedTurns: 4, maxImplementationAttempts: 3 },
    { maxDelegatedTurns: 5, maxImplementationAttempts: 4 },
    { maxDelegatedTurns: 5, maxImplementationAttempts: 1 },
    { maxDelegatedTurns: 5, maxImplementationAttempts: 2 },
    { maxDelegatedTurns: 5, maxImplementationAttempts: 0 }]) {
    assert.match(validateContract({ ...fixture(), budget }).join('\n'), /budget/);
  }
  for (const overheadMinutes of [0, -1, Infinity, NaN, '2', undefined, 4]) {
    assert.match(validateContract({ ...fixture(), overheadMinutes }).join('\n'), /overheadMinutes/);
  }
  const contract = fixture();
  contract.builders[0].estimatedMinutes = Infinity;
  assert.match(validateContract(contract).join('\n'), /estimatedMinutes/);
});

test('requires complete unique owner schedule, bounded builders and nonempty evidence', () => {
  for (const integrationOrder of [[], ['validator'], ['validator', 'validator'],
    ['validator', 'lead'], ['validator', 'timing', 'unknown']]) {
    assert.match(validateContract({ ...fixture(), integrationOrder }).join('\n'), /integrationOrder/);
  }
  for (const builders of [[], [...fixture().builders, fixture().builders[0]]]) {
    assert.match(validateContract({ ...fixture(), builders }).join('\n'), /one or two/);
  }
  const contract = fixture();
  contract.builders[1].owner = 'lead';
  contract.builders[0].checks = [' '];
  contract.builders[0].acceptance = [];
  assert.match(validateContract(contract).join('\n'), /duplicates owner/);
  assert.match(validateContract(contract).join('\n'), /checks/);
  assert.match(validateContract(contract).join('\n'), /acceptance/);
  for (const input of [null, [], true, { builders: [null], budget: null }]) {
    assert.ok(validateContract(input).length);
  }
});

test('checks actual ownership and detects unknown owners, duplicates and traversal', () => {
  assert.deepEqual(validateOwnership(fixture(), [
    { owner: 'validator', files: ['SCRIPTS\\CONTRACT.MJS'] },
    { owner: 'lead', files: ['docs/delivery.md'] },
  ]), []);
  assert.deepEqual(validateOwnership(fixture(), []), []);
  for (const changes of [
    [{ owner: 'unknown', files: ['scripts/contract.mjs'] }],
    [{ owner: 'timing', files: ['scripts/contract.mjs'] }],
    [{ owner: 'validator', files: ['../secret'] }],
    [{ owner: 'validator', files: ['scripts/contract.mjs', 'SCRIPTS\\CONTRACT.MJS'] }],
    [{ owner: 'validator', files: [] }, { owner: 'validator', files: [] }],
    [null], {}, [{ owner: 'lead', files: null }],
  ]) assert.ok(validateOwnership(fixture(), changes).length, JSON.stringify(changes));
});

test('CLI emits JSON, exits nonzero for invalid input, and never runs declared checks', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'delivery-contract-test-'));
  const script = fileURLToPath(new URL('./delivery-contract.mjs', import.meta.url));
  const run = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  try {
    const contractPath = path.join(directory, 'contract.json');
    const changesPath = path.join(directory, 'changes.json');
    const contract = fixture();
    contract.builders[0].checks = ['this command must never execute'];
    await writeFile(contractPath, JSON.stringify(contract));
    await writeFile(changesPath, JSON.stringify([{ owner: 'unknown', files: [] }]));
    const valid = run(['check', contractPath]);
    assert.equal(valid.status, 0, valid.stderr);
    assert.deepEqual(JSON.parse(valid.stdout), { valid: true, errors: [] });
    const invalid = run(['check', contractPath, changesPath]);
    assert.equal(invalid.status, 1);
    assert.equal(JSON.parse(invalid.stdout).valid, false);
    await writeFile(contractPath, '{bad JSON');
    for (const args of [['check', contractPath], ['check', path.join(directory, 'missing.json')], []]) {
      const result = run(args);
      assert.equal(result.status, 1);
      assert.equal(JSON.parse(result.stdout).valid, false);
    }
    assert.match(run(['--help']).stdout, /not filesystem or sandbox enforcement/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
