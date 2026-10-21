import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildAll } from './build.mjs';
import { applicationRoot } from './worker-build.mjs';
import { validateTestReport } from './verify.mjs';
import { privateDirectory } from './local-paths.mjs';

async function main() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const directory = path.join(applicationRoot, '.verification', `e2e-${randomUUID()}`);
  await privateDirectory(applicationRoot, directory);
  await buildAll();
  const args = process.argv.slice(2);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(applicationRoot, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.config.ts', ...args], { cwd: applicationRoot, windowsHide: true, stdio: 'inherit', env: { ...process.env, MEALMATCH_LOCAL_PORT: String(port), MEALMATCH_E2E_DIRECTORY: directory, PLAYWRIGHT_REUSE_SERVER: '0' } });
    child.once('error', reject); child.once('close', resolve);
  });
  if (code !== 0) throw new Error(`Browser checks failed (${code})`);
  const report = JSON.parse(await readFile(path.join(directory, 'browser-results.json'), 'utf8'));
  if (!args.length) validateTestReport('browser', report);
  else if (!report.stats.expected || ['unexpected', 'skipped', 'flaky'].some(key => report.stats[key] !== 0)) throw new Error('Focused browser run has missing, failed, skipped or flaky tests');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
