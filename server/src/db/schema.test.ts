import fs from 'fs';
import path from 'path';
import os from 'os';
import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let directory: string;
let testDatabasePath: string;
let freshDatabasePath: string;
const originalDatabasePath = process.env.DATABASE_PATH;

describe('database schema migrations', () => {
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mealmatch-schema-'));
    testDatabasePath = path.join(directory, 'migration.db');
    freshDatabasePath = path.join(directory, 'fresh.db');
  });

  afterEach(() => {
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    vi.resetModules();
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) ||
        !path.basename(directory).startsWith('mealmatch-schema-')) {
      throw new Error('Refusing to remove a non-fixture directory');
    }
    fs.rmSync(directory, { recursive: true, force: true });
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

    const mealColumns = migratedDatabase.exec('PRAGMA table_info(meals)')[0].values;
    expect(mealColumns.some((column) => column[1] === 'instructions')).toBe(true);
    expect(mealColumns.some((column) => column[1] === 'notes')).toBe(true);
    const ingredientColumns = migratedDatabase.exec('PRAGMA table_info(meal_ingredients)')[0].values;
    expect(ingredientColumns.map((column) => column[1])).toEqual([
      'id',
      'meal_id',
      'amount',
      'ingredient',
      'display_order',
    ]);

    const indexes = migratedDatabase.exec('PRAGMA index_list(meals)')[0].values;
    expect(indexes.some((index) => index[1] === 'idx_meals_host_type_archived')).toBe(true);
    const ingredientIndexes = migratedDatabase.exec('PRAGMA index_list(meal_ingredients)')[0].values;
    expect(ingredientIndexes.some((index) => index[1] === 'idx_meal_ingredients_meal_order'))
      .toBe(true);
  });

  it('creates recipe storage in a fresh database', async () => {
    process.env.DATABASE_PATH = freshDatabasePath;
    vi.resetModules();
    const { initializeDatabase } = await import('./schema');
    const freshDatabase = await initializeDatabase();

    const mealColumns = freshDatabase.exec('PRAGMA table_info(meals)')[0].values;
    expect(mealColumns.some((column) => column[1] === 'instructions')).toBe(true);
    expect(mealColumns.some((column) => column[1] === 'notes')).toBe(true);
    const ingredientColumns = freshDatabase.exec('PRAGMA table_info(meal_ingredients)')[0].values;
    expect(ingredientColumns.map((column) => column[1])).toEqual([
      'id',
      'meal_id',
      'amount',
      'ingredient',
      'display_order',
    ]);
  });

  it.each([false, true])('preserves populated durable data after reopening (legacy additions: %s)', async (legacy) => {
    process.env.DATABASE_PATH = freshDatabasePath;
    vi.resetModules();
    const schema = await import('./schema');
    const database = await schema.initializeDatabase();
    schema.runQuery("INSERT INTO hosts (id, email, password_hash, takeout_onboarding_dismissed) VALUES ('host', 'fixture@example.test', 'fixture-hash', 1)");
    schema.runQuery(`INSERT INTO meals
      (id, host_id, title, description, instructions, notes, pick_count)
      VALUES (?, 'host', ?, ?, ?, ?, ?)`,
    ['meal', 'Lemon chickpea stew', 'Family dinner',
      '1. Soften the onion.\n2. Simmer chickpeas for 20 minutes.\n3. Finish with lemon.',
      'Use the wide pot; save a portion for tomorrow.', 4]);
    schema.runQuery("INSERT INTO meals (id, host_id, title, notes, type, archived, pick_count) VALUES ('category', 'host', 'Thai', 'Ask for mild sauce', 'category', 1, 2)");
    // Insert out of order so the assertion exercises the stored ordering column.
    schema.runQuery("INSERT INTO meal_ingredients VALUES ('ingredient-2', 'meal', 'to taste', 'lemon juice', 2)");
    schema.runQuery("INSERT INTO meal_ingredients VALUES ('ingredient-0', 'meal', '1½ tbsp', 'olive oil', 0)");
    schema.runQuery("INSERT INTO meal_ingredients VALUES ('ingredient-1', 'meal', '2 x 400 g cans, drained', 'chickpeas', 1)");
    schema.runQuery(`INSERT INTO sessions (id, host_id, invite_code, status, selected_meal_id, closed_at)
      VALUES ('session', 'host', 'SAVE42', 'closed', 'meal', '2026-10-14 12:30:00')`);
    schema.runQuery("INSERT INTO session_meals VALUES ('session-meal', 'session', 'meal', 0)");
    schema.runQuery("INSERT INTO participants (id, session_id, display_name, submitted) VALUES ('one', 'session', 'One', 1), ('two', 'session', 'Two', 1), ('three', 'session', 'Three', 1)");
    schema.runQuery("INSERT INTO swipes (id, participant_id, session_meal_id, vote) VALUES ('vote-one', 'one', 'session-meal', 1), ('vote-two', 'two', 'session-meal', 2), ('vote-three', 'three', 'session-meal', 0)");
    schema.runQuery("INSERT INTO session_history (id, session_id, selected_meal_id, selected_at) VALUES ('history', 'session', 'meal', '2026-10-14 12:31:00')");
    const tables = ['hosts', 'meals', 'meal_ingredients', 'sessions', 'session_meals', 'participants', 'swipes', 'session_history'];
    const snapshot = () => Object.fromEntries(tables.map(table => [table, schema.getAll(`SELECT * FROM ${table} ORDER BY id`)]));
    const before = snapshot();
    database.close();

    if (legacy) {
      const SQL = await initSqlJs();
      const oldDatabase = new SQL.Database(fs.readFileSync(freshDatabasePath));
      oldDatabase.run(`ALTER TABLE hosts DROP COLUMN takeout_onboarding_dismissed;
        ALTER TABLE meals DROP COLUMN temporary;
        ALTER TABLE meals DROP COLUMN creator_token;
        ALTER TABLE sessions DROP COLUMN mode;`);
      fs.writeFileSync(freshDatabasePath, Buffer.from(oldDatabase.export()));
      oldDatabase.close();
    }

    // A fresh module has no in-memory handle and must load the actual saved bytes.
    vi.resetModules();
    const reopened = await import('./schema');
    const reopenedDatabase = await reopened.initializeDatabase();
    const after = Object.fromEntries(tables.map(table => [table, reopened.getAll(`SELECT * FROM ${table} ORDER BY id`)]));
    expect(after).toEqual(before);
    expect(reopened.getAll('SELECT amount, ingredient FROM meal_ingredients WHERE meal_id = ? ORDER BY display_order', ['meal']))
      .toEqual([
        { amount: '1½ tbsp', ingredient: 'olive oil' },
        { amount: '2 x 400 g cans, drained', ingredient: 'chickpeas' },
        { amount: 'to taste', ingredient: 'lemon juice' },
      ]);
    const { calculateResults } = await import('../services/matching');
    expect(calculateResults('session')).toEqual([expect.objectContaining({
      mealId: 'meal', yesCount: 1, maybeCount: 1, totalVotes: 3, percentage: 67, isUnanimous: false,
    })]);
    reopenedDatabase.close();
  });
});
