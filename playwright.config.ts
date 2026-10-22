import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const directory = process.env.MEALMATCH_E2E_DIRECTORY || path.resolve('.verification', `e2e-${process.pid}`);
const port = Number(process.env.MEALMATCH_LOCAL_PORT || '5173');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 3,
  outputDir: path.join(directory, 'browser-artifacts'),
  reporter: [['json', { outputFile: path.join(directory, 'browser-results.json') }], ['html', { outputFolder: path.join(directory, 'browser-report'), open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      MEALMATCH_LOCAL_STATE: path.join(directory, 'worker'),
      MEALMATCH_LOCAL_PORT: String(port),
    },
  },
});
