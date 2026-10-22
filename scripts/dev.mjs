import path from 'node:path';
import { buildAll } from './build.mjs';
import { applicationRoot } from './worker-build.mjs';
import { startLocalWorker } from './worker-local.mjs';

try {
  await buildAll();
  const active = await startLocalWorker({ directory: path.join(applicationRoot, '.wrangler/dev'), port: 5173, allowNotionNetwork: true });
  console.log(`MealMatch Worker + D1: ${active.url} (restart npm run dev after source edits)`);
  let closing;
  const close = () => closing ??= active.runtime.dispose();
  process.once('SIGINT', () => { close().finally(() => process.exit()); });
  process.once('SIGTERM', () => { close().finally(() => process.exit()); });
} catch (error) { console.error(error.message); process.exitCode = 1; }
