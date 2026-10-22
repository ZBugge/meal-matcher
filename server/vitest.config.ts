import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
    // Hooks provision real Wrangler migrations and Worker processes, including
    // cold startup alongside the browser/recovery gates. The full verifier
    // still enforces its independent 120-second deadline without retries.
    hookTimeout: 30_000,
    // These cases now make real HTTP/D1 calls instead of synchronous sql.js
    // calls. Keep bounded case execution on shared four-core CI; the complete
    // verifier still has its separate, unchanged 120-second deadline.
    testTimeout: 10_000,
  },
});
