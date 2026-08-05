import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const testDatabasePath = path.join(__dirname, '../../data/schema-migration-test.db');

describe('database schema migrations', () => {
  afterEach(() => {
    delete process.env.DATABASE_PATH;
    vi.resetModules();
    if (fs.existsSync(testDatabasePath)) {
      fs.rmSync(testDatabasePath);
    }
  });

  it('migrates existing meals and sessions to the mode-aware schema', async () => {
    const SQL = await initSqlJs();
    const legacyDatabase = new SQL.Database();
    legacyDatabase.run(`
      CREATE TABLE meals (
        id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        type TEXT,
        archived INTEGER DEFAULT 0
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY
      );
      CREATE TABLE hosts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL
      );
      INSERT INTO meals (id, host_id, type, archived)
      VALUES ('meal-1', 'host-1', NULL, 0);
      INSERT INTO hosts (id, email, password_hash)
      VALUES ('host-1', 'host@example.com', 'hash');
      INSERT INTO hosts (id, email, password_hash)
      VALUES ('host-2', 'category-host@example.com', 'hash');
      INSERT INTO meals (id, host_id, type, archived)
      VALUES ('category-1', 'host-2', 'category', 0);
      INSERT INTO sessions (id) VALUES ('session-1');
    `);
    fs.mkdirSync(path.dirname(testDatabasePath), { recursive: true });
    fs.writeFileSync(testDatabasePath, Buffer.from(legacyDatabase.export()));
    legacyDatabase.close();

    process.env.DATABASE_PATH = testDatabasePath;
    vi.resetModules();
    const { initializeDatabase, getOne } = await import('./schema');
    const migratedDatabase = await initializeDatabase();

    const sessionColumns = migratedDatabase.exec('PRAGMA table_info(sessions)')[0].values;
    expect(sessionColumns.some((column) => column[1] === 'mode')).toBe(true);
    const hostColumns = migratedDatabase.exec('PRAGMA table_info(hosts)')[0].values;
    expect(hostColumns.some((column) => column[1] === 'takeout_onboarding_dismissed')).toBe(true);
    expect(getOne<{ mode: string }>('SELECT mode FROM sessions WHERE id = ?', ['session-1'])?.mode)
      .toBe('home');
    expect(getOne<{ dismissed: number }>(
      'SELECT takeout_onboarding_dismissed AS dismissed FROM hosts WHERE id = ?',
      ['host-1']
    )?.dismissed).toBe(0);
    expect(getOne<{ dismissed: number }>(
      'SELECT takeout_onboarding_dismissed AS dismissed FROM hosts WHERE id = ?',
      ['host-2']
    )?.dismissed).toBe(1);
    expect(getOne<{ type: string }>('SELECT type FROM meals WHERE id = ?', ['meal-1'])?.type)
      .toBe('meal');

    const indexes = migratedDatabase.exec('PRAGMA index_list(meals)')[0].values;
    expect(indexes.some((index) => index[1] === 'idx_meals_host_type_archived')).toBe(true);
  });
});
