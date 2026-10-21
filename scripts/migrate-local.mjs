import path from 'node:path';
import { applicationRoot } from './worker-build.mjs';
import { prepareLocalState } from './worker-local.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--state')) throw new Error('Usage: npm run db:migrate:local -- [--state <checkout .wrangler/.verification directory>]');
  const target = args.length ? path.resolve(args[1]) : path.join(applicationRoot, '.wrangler/dev');
  const result = await prepareLocalState(target);
  console.log(JSON.stringify({ localOnly: true, state: result.directory, database: result.binding.database_name }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
