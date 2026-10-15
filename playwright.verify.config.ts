import { defineConfig } from '@playwright/test';
import path from 'path';
import baseline from './playwright.config';

const clientPort = Number(process.env.MEALMATCH_VERIFY_CLIENT_PORT);
const apiPort = Number(process.env.MEALMATCH_VERIFY_API_PORT);
const runDirectory = process.env.MEALMATCH_VERIFY_DIRECTORY;
if (!runDirectory || !clientPort || !apiPort || clientPort === apiPort) {
  throw new Error('Use npm run verify to allocate isolated verification ports and data.');
}

export default defineConfig({
  ...baseline,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  outputDir: path.join(runDirectory, 'browser-artifacts'),
  reporter: [
    ['json', { outputFile: path.join(runDirectory, 'browser-results.json') }],
    ['html', { outputFolder: path.join(runDirectory, 'browser-report'), open: 'never' }],
  ],
  use: { ...baseline.use, baseURL: `http://localhost:${clientPort}` },
  webServer: [
    {
      command: 'node server/node_modules/tsx/dist/cli.mjs server/src/index.ts',
      url: `http://localhost:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        NODE_ENV: 'development',
        PORT: String(apiPort),
        DATABASE_PATH: path.join(runDirectory, 'browser.db'),
        SESSION_SECRET: 'mealmatch-isolated-verification',
      },
    },
    {
      command: `node node_modules/vite/bin/vite.js --port ${clientPort} --strictPort`,
      cwd: path.resolve('client'),
      url: `http://localhost:${clientPort}`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { NODE_ENV: 'development', MEALMATCH_API_PORT: String(apiPort) },
    },
  ],
});
