import { afterAll } from 'vitest';
import { closeTestFixture } from './runtime';
// Each Vitest isolate owns an actual Worker and private D1 directory. No runtime
// helper reads DATABASE_PATH or creates a developer database/key file.
afterAll(async () => { await closeTestFixture(); });
