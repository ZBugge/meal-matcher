import { defineConfig } from '@playwright/test';
import path from 'path';
import baseline from './playwright.config';

const clientPort = Number(process.env.MEALMATCH_VERIFY_CLIENT_PORT);
const runDirectory = process.env.MEALMATCH_VERIFY_DIRECTORY;
if (!runDirectory || !clientPort) {
  throw new Error('Use npm run verify to allocate isolated verification ports and data.');
}

export default defineConfig({
  ...baseline,
  forbidOnly: true,
  retries: 0,
  workers: 3,
  outputDir: path.join(runDirectory, 'browser-artifacts'),
  reporter: [
    ['json', { outputFile: path.join(runDirectory, 'browser-results.json') }],
    ['html', { outputFolder: path.join(runDirectory, 'browser-report'), open: 'never' }],
  ],
  use: { ...baseline.use, baseURL: `http://127.0.0.1:${clientPort}` },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `http://127.0.0.1:${clientPort}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { MEALMATCH_LOCAL_STATE: path.join(runDirectory, 'browser-worker'), MEALMATCH_LOCAL_PORT: String(clientPort) },
  },
});
