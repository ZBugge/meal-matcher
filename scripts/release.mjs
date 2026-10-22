import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationRoot, requireCandidate } from './worker-build.mjs';
import { releaseTarget, releaseEvidence } from './release-target.mjs';
import { smoke } from './smoke.mjs';

const execute = promisify(execFile);
export async function releaseSequence(environment, steps) {
  await steps.identity();
  if (environment === 'production') {
    await steps.stagingEvidence();
    await steps.recovery();
  }
  await steps.migrate();
  await steps.deploy();
  await steps.smoke();
  await steps.receipt();
}

async function main() {
  const args = process.argv.slice(2);
  assert(args[0] === '--env' && ['staging', 'production'].includes(args[1]) && (args.length === 2 || (args.length === 3 && args[2] === '--execute')), 'Usage: release.mjs --env staging|production [--execute]');
  const environment = args[1], root = applicationRoot;
  const config = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
  const targets = JSON.parse(await readFile(path.join(root, 'cloudflare/targets.json'), 'utf8'));
  const target = releaseTarget(config, targets, environment, process.env.CLOUDFLARE_ACCOUNT_ID);
  const candidate = await requireCandidate();
  const { stdout } = await execute('git', ['rev-parse', 'HEAD'], { cwd: root, windowsHide: true });
  const status = await execute('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, windowsHide: true });
  const pointer = JSON.parse(await readFile(path.join(root, '.verification/latest.json'), 'utf8'));
  const summary = JSON.parse(await readFile(pointer.summary, 'utf8'));
  releaseEvidence(summary, candidate, stdout.trim(), status.stdout.trim());
  console.log(JSON.stringify({ target, commit: candidate.commit, sourceSha256: candidate.sourceSha256, steps: environment === 'production' ? ['identity', 'staging-evidence', 'recovery-export', 'migrations', 'verified-worker-assets', 'read-only-smoke'] : ['identity', 'migrations', 'verified-worker-assets', 'read-only-smoke'], execute: args[2] === '--execute' }));
  if (args[2] !== '--execute') return;
  assert.equal(process.env.MEALMATCH_HOSTED_AUTHORITY, `${environment}-authorized`, 'Hosted authority is not configured for this environment');
  assert(process.env.CLOUDFLARE_API_TOKEN, 'Scoped Cloudflare CI token required');
  const directory = path.join(root, '.verification', `release-${environment}-${Date.now()}-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const wrangler = async (name, args) => {
    const result = await execute(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...args, '--config', path.join(root, 'wrangler.jsonc'), '--env', environment], { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(directory, `${name}.private.log`) }, windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    await writeFile(path.join(directory, `${name}.private.log`), result.stdout + result.stderr, { mode: 0o600 });
    return result;
  };
  let stage = 'identity';
  try {
    await releaseSequence(environment, {
      async identity() {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${target.accountId}/d1/database/${target.databaseId}`, { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(10000) });
        const payload = await response.json();
        assert(response.ok && payload.success && payload.result?.uuid === target.databaseId && payload.result?.name === target.database, 'Provider database/account identity differs from reviewed target');
      },
      async stagingEvidence() {
        stage = 'staging-evidence';
        const staging = JSON.parse(await readFile(path.join(root, '.verification/staging-release.json'), 'utf8'));
        assert(staging.success && staging.commit === candidate.commit && staging.workerSha256 === candidate.workerSha256 && staging.assetSha256 === candidate.assetSha256 && staging.databaseId === targets.staging.databaseId, 'Exact candidate has no successful isolated staging release');
        const acceptance = JSON.parse(await readFile(path.join(root, '.verification/hosted-acceptance.private.json'), 'utf8'));
        for (const field of ['sourceSelected', 'finalImportCompared', 'originalKeyPreserved', 'offDeviceBackupVerified', 'restoreAppReadVerified', 'hostedTlsVerified', 'notionRefreshVerified', 'cpuEnvelopeMeasured', 'phonePwaVerified', 'singleWriterConfirmed']) assert(acceptance[field] === true, `Hosted acceptance missing: ${field}`);
        assert.equal(acceptance.commit, candidate.commit, 'Hosted acceptance is stale');
      },
      async recovery() {
        stage = 'recovery';
        await wrangler('time-travel', ['d1', 'time-travel', 'info', target.database, '--json']);
        // Full portable backup/restore is a separate private administrative step.
        // Require its receipt before proceeding; a code version is not a data backup.
        const recovery = JSON.parse(await readFile(path.join(root, '.verification/production-recovery.private.json'), 'utf8'));
        assert(recovery.verified === true && recovery.databaseId === target.databaseId && recovery.commit === candidate.commit && /^[a-f0-9]{64}$/.test(recovery.backupSha256) && Date.now() - Date.parse(recovery.createdAt) < 3600000 && Date.parse(recovery.createdAt) <= Date.now(), 'Current private production export/recovery receipt required');
      },
      async migrate() { stage = 'migrations'; await wrangler(stage, ['d1', 'migrations', 'apply', target.database, '--remote']); },
      async deploy() {
        stage = 'deploy';
        await requireCandidate();
        await wrangler(stage, ['deploy', '.verification/release-bundle/worker.js', '--no-bundle', '--assets', 'client/dist']);
      },
      async smoke() { stage = 'smoke'; await smoke(target.origin); },
      async receipt() {
        const receipt = { success: true, ...target, ...candidate, releasedAt: new Date().toISOString() };
        await writeFile(path.join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
        if (environment === 'staging') await writeFile(path.join(root, '.verification/staging-release.json'), JSON.stringify(receipt));
      },
    });
  } catch {
    await writeFile(path.join(directory, 'FAILED.json'), JSON.stringify({ success: false, stage, commit: candidate.commit, target, recovery: 'Preserve state/logs. Inspect provider migration/deployment state before any retry.' }), { flag: 'wx' });
    throw new Error(`Release stopped at ${stage}; private logs retained. Do not retry an ambiguous write automatically.`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
