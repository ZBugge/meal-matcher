import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildAll } from './build.mjs';
import { applicationRoot } from './worker-build.mjs';

try {
  const args = process.argv.slice(2);
  const packages = args[0] === '--server' ? ['server'] : args[0] === '--client' ? ['client'] : ['server', 'client'];
  if (['--server', '--client'].includes(args[0])) args.shift();
  if (packages.includes('server')) await buildAll();
  const results = await Promise.all(packages.map(pkg => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(applicationRoot, pkg, 'node_modules/vitest/vitest.mjs'), 'run', '--allowOnly=false', ...args], { cwd: path.join(applicationRoot, pkg), windowsHide: true, stdio: 'inherit', env: { ...process.env, MEALMATCH_TEST_ROOT: applicationRoot, MEALMATCH_TEST_BUNDLE_DIRECTORY: path.join(applicationRoot, '.verification/release-bundle') } });
    child.once('error', reject); child.once('close', resolve);
  })));
  if (results.some(code => code !== 0)) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
