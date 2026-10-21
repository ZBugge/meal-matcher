import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
    // Hooks provision real Wrangler migrations and Worker processes, including
    // cold startup alongside the browser/recovery gates. The full verifier
    // still enforces its independent 120-second deadline without retries.
    hookTimeout: 30_000,
  },
});
