import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function assertWorkerHost(environment = process.env, { legacyEntrypoint = false } = {}) {
  const railway = ['RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID', 'RAILWAY_DEPLOYMENT_ID']
    .some(name => typeof environment[name] === 'string' && environment[name].trim());
  if (legacyEntrypoint || railway) throw new Error('Railway release refused: this source targets Cloudflare Workers and D1. Preserve the existing Railway deployment and database; use npm run build for the Cloudflare candidate.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--legacy-entrypoint') throw new Error('Expected --legacy-entrypoint');
    assertWorkerHost(process.env, { legacyEntrypoint: true });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
