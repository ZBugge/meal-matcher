import { cp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runChecks } from './verify.mjs';
import { validateMutationFailure } from './adversarial-report.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const option = process.argv.indexOf('--directory');
const directory = option < 0 ? path.join(root, '.verification', `audit-${Date.now()}-${randomUUID().slice(0, 8)}`) : path.resolve(process.argv[option + 1]);
const mutations = [
  { id: 'invalid-vote', file: 'src/routes/swipes.ts', from: '![0, 1, 2].includes(swipe.vote)', to: '![0, 1, 2, 3].includes(swipe.vote)', expected: 'rejects invalid vote 3 without writing an initial or replacement ballot' },
  { id: 'rejected-ballot-loss', file: 'src/routes/swipes.ts', from: 'const seenMealIds = new Set<string>();', to: "getDatabase().run('DELETE FROM swipes WHERE participant_id = ?', [participantId]);\n    const seenMealIds = new Set<string>();", expected: 'preserves the complete accepted ballot when a later replacement vote is invalid' },
  { id: 'public-voters', file: 'src/routes/swipes.ts', from: 'calculateResults(sessionId, requestorIsHost && isHost)', to: 'calculateResults(sessionId, isHost)', expected: 'keeps voter identities and recipe fields private' },
  { id: 'anonymous-close-voters', file: 'src/routes/swipes.ts', from: 'calculateResults(sessionId, req.session.hostId === session.host_id)', to: 'calculateResults(sessionId, true)', expected: 'rejects missing, wrong and other-session creator tokens without closing or leaking votes' },
  { id: 'recipe-owner', file: 'src/routes/meals.ts', from: 'WHERE id = ? AND host_id = ?`,', to: 'WHERE id = ? AND (? IS NOT NULL OR 1=1)`,', expected: 'allows the owner recipe view but rejects anonymous and other-owner reads and mutations' },
  { id: 'lost-persistence', file: 'src/db/schema.ts', from: 'fs.renameSync(temporaryPath, DATABASE_PATH);', to: 'fs.unlinkSync(temporaryPath);', expected: 'preserves populated durable data after reopening' },
];
for (const mutation of mutations) mutation.assertion = {
  'invalid-vote': /^expected 200 to be 400/,
  'recipe-owner': /^expected 200 to be 404/,
  'public-voters': /not to contain '"voters"'/,
  'anonymous-close-voters': /not to contain '"voters"'/,
  'rejected-ballot-loss': /^expected .*to deeply equal/s,
  'lost-persistence': /^expected .*to deeply equal/s,
}[mutation.id];

async function prepare(id, mutation) {
  const server = path.join(directory, id, 'server');
  await mkdir(server, { recursive: true });
  for (const name of ['src', 'package.json', 'tsconfig.json', 'vitest.config.ts']) {
    await cp(path.join(root, 'server', name), path.join(server, name), { recursive: true });
  }
  await symlink(path.join(root, 'server', 'node_modules'), path.join(server, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  if (mutation) {
    const filename = path.join(server, mutation.file);
    const source = await readFile(filename, 'utf8');
    if (source.split(mutation.from).length !== 2) throw new Error(`${id}: mutation anchor missing or ambiguous`);
    await writeFile(filename, source.replace(mutation.from, mutation.to));
  }
  return { id, name: id, cwd: server, args: [path.join(server, 'node_modules/vitest/vitest.mjs'), 'run', 'src/routes/swipes.test.ts', 'src/routes/quick-session.test.ts', 'src/db/schema.test.ts', '--maxWorkers=1', '--minWorkers=1', '--allowOnly=false', '--reporter=json', `--outputFile=${path.join(directory, `${id}.json`)}`] };
}

async function reportFor(id) {
  const report = JSON.parse(await readFile(path.join(directory, `${id}.json`), 'utf8'));
  const assertions = (report.testResults ?? []).flatMap(result => result.assertionResults ?? []);
  if (!assertions.length || assertions.some(result => !['passed', 'failed'].includes(result.status))) throw new Error(`${id}: missing or skipped assertions`);
  return { report, assertions };
}

async function main() {
  const started = performance.now();
  await mkdir(directory, { recursive: true });
  const control = await prepare('control');
  const baseline = await runChecks([control], { directory, budgetMs: 30_000 });
  const controlData = await reportFor('control');
  if (!baseline.results[0].passed || baseline.timedOut || baseline.interrupted || baseline.cleanupErrors.length || controlData.report.success !== true || controlData.report.numFailedTests !== 0) throw new Error('Unmodified control must pass before auditing mutants');
  const results = [];
  for (let index = 0; index < mutations.length; index += 2) {
    const batch = mutations.slice(index, index + 2);
    const checks = [];
    for (const mutation of batch) checks.push(await prepare(mutation.id, mutation));
    const execution = await runChecks(checks, { directory, budgetMs: 30_000 });
    if (execution.timedOut || execution.interrupted || execution.cleanupErrors.length) throw new Error('Mutation execution failed or timed out');
    for (const mutation of batch) {
      const result = execution.results.find(result => result.id === mutation.id);
      const { report, assertions } = await reportFor(mutation.id);
      const failedAssertions = validateMutationFailure(result, report, controlData.report.numTotalTests, mutation);
      results.push({ id: mutation.id, caught: true, failedAssertions });
      console.log(`CAUGHT ${mutation.id}`);
    }
  }
  await writeFile(path.join(directory, 'summary.json'), JSON.stringify({ success: true, elapsedMs: performance.now() - started, controlTests: controlData.report.numTotalTests, results }, null, 2));
}

main().catch(async error => {
  console.error(error.message);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'summary.json'), JSON.stringify({ success: false, error: error.message }));
  process.exitCode = 1;
});
