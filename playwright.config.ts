import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const e2eDatabasePath = path.resolve('test-results', `e2e-database-${process.pid}.db`);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
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
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 120 * 1000,
    env: {
      DATABASE_PATH: e2eDatabasePath,
      SESSION_SECRET: 'mealmatch-e2e-session-secret',
    },
  },
});
