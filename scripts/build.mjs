import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationRoot, buildWorker, buildClient } from './worker-build.mjs';

async function command(cwd, args) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/^(CLOUDFLARE_|CF_|NOTION_|DATABASE_PATH$|SESSION_SECRET$)/.test(name)) delete env[name];
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Build step failed (${code})`)));
  });
}
export async function buildAll() {
  await Promise.all([
    buildClient(),
    command(path.join(applicationRoot, 'server'), ['node_modules/typescript/bin/tsc']),
  ]);
  return buildWorker();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildAll().then(({ artifact }) => console.log(`Built Worker + Static Assets for ${artifact.commit}.`)).catch(error => { console.error(error.message); process.exitCode = 1; });
