import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll } from 'vitest';

// Runs before each test file imports the database module, which captures DATABASE_PATH at import time.
const directory = mkdtempSync(path.join(tmpdir(), 'mealmatch-unit-'));
const previousDatabasePath = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = path.join(directory, 'database.db');

afterAll(() => {
  if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previousDatabasePath;

  const resolvedDirectory = path.resolve(directory);
  if (path.dirname(resolvedDirectory) !== path.resolve(tmpdir()) || !path.basename(resolvedDirectory).startsWith('mealmatch-unit-')) {
    throw new Error('Refusing to remove a test directory outside the allocated temporary location');
  }
  rmSync(resolvedDirectory, { recursive: true, force: true });
});
