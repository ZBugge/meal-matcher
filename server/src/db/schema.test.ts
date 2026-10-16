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
    expect(freshDatabase.exec('PRAGMA table_info(shopping_items)')[0].values.some(column => column[1] === 'aisle')).toBe(true);
    expect(freshDatabase.exec('PRAGMA table_info(dinner_staples)')[0].values.map(column => column[1])).toEqual(['id', 'host_id', 'title']);
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
  it('adds aisle and staple storage to existing family plans without losing progress', async () => {
    process.env.DATABASE_PATH = freshDatabasePath; vi.resetModules();
    const schema = await import('./schema'); const database = await schema.initializeDatabase();
    database.run("INSERT INTO hosts (id, email, password_hash) VALUES ('family', 'family@test', 'hash')");
    database.run("INSERT INTO plan_entries (id, host_id, week, kind, title) VALUES ('dinner', 'family', '2026-10-12', 'takeout', 'Pizza')");
    database.run("INSERT INTO shopping_items (id, host_id, week, ingredient, amount, state) VALUES ('item', 'family', '2026-10-12', 'Milk', '1 carton', 'bought')");
    database.run('ALTER TABLE shopping_items DROP COLUMN aisle; DROP TABLE dinner_staples;'); schema.saveDatabase(); database.close();
    vi.resetModules(); const migrated = await import('./schema'); const reopened = await migrated.initializeDatabase();
    expect(migrated.getAll('SELECT ingredient, amount, state, aisle FROM shopping_items')).toEqual([{ ingredient: 'Milk', amount: '1 carton', state: 'bought', aisle: null }]);
    expect(migrated.getAll('SELECT title FROM plan_entries')).toEqual([{ title: 'Pizza' }]);
    expect(migrated.getAll('SELECT * FROM dinner_staples')).toEqual([]);
    migrated.runQuery("INSERT INTO dinner_staples VALUES ('staple', 'family', 'Tofu night')"); reopened.close();
    vi.resetModules(); const again = await import('./schema'); const final = await again.initializeDatabase();
    expect(again.getAll('SELECT title FROM dinner_staples')).toEqual([{ title: 'Tofu night' }]); final.close();
  });

  it('adds recipe metadata and recurring groceries to populated pre-pilot databases and reopens safely', async () => {
    process.env.DATABASE_PATH = freshDatabasePath; vi.resetModules();
    const schema = await import('./schema'); const database = await schema.initializeDatabase();
    database.run("INSERT INTO hosts (id, email, password_hash) VALUES ('family', 'pilot@test', 'hash')");
    database.run("INSERT INTO meals (id, host_id, title, instructions, notes) VALUES ('recipe', 'family', 'Tofu', 'Bake it.', 'Keep this note.')");
    database.run("INSERT INTO shopping_items (id, host_id, week, ingredient, amount, state) VALUES ('milk', 'family', '2026-10-12', 'Milk', '1½ cartons', 'bought')");
    database.run(`DROP INDEX idx_shopping_recurring_week;
      ALTER TABLE shopping_items DROP COLUMN recurring_id;
      ALTER TABLE meals DROP COLUMN total_minutes;
      ALTER TABLE meals DROP COLUMN effort;
      DROP TABLE recurring_groceries;`);
    schema.saveDatabase(); database.close();
    vi.resetModules(); const migrated = await import('./schema'); const reopened = await migrated.initializeDatabase();
    expect(migrated.getOne('SELECT title, instructions, notes, total_minutes, effort FROM meals WHERE id = ?', ['recipe']))
      .toEqual({ title: 'Tofu', instructions: 'Bake it.', notes: 'Keep this note.', total_minutes: null, effort: null });
    expect(migrated.getOne('SELECT ingredient, amount, state, recurring_id FROM shopping_items WHERE id = ?', ['milk']))
      .toEqual({ ingredient: 'Milk', amount: '1½ cartons', state: 'bought', recurring_id: null });
    migrated.runQuery("UPDATE meals SET total_minutes = 25, effort = 'easy' WHERE id = 'recipe'");
    migrated.runQuery("INSERT INTO recurring_groceries VALUES ('template', 'family', 'Bread', 'one large loaf')");
    migrated.runQuery("INSERT INTO shopping_items (id, host_id, week, ingredient, amount, recurring_id) VALUES ('bread', 'family', '2026-10-12', 'Bread', 'one large loaf', 'template')");
    expect(() => reopened.run("INSERT INTO shopping_items (id, host_id, week, ingredient, recurring_id) VALUES ('duplicate', 'family', '2026-10-12', 'Bread', 'template')")).toThrow();
    migrated.runQuery("INSERT INTO shopping_items (id, host_id, week, ingredient, recurring_id) VALUES ('next-week', 'family', '2026-10-19', 'Bread', 'template')");
    reopened.close();
    vi.resetModules(); const again = await import('./schema'); const final = await again.initializeDatabase();
    expect(again.getOne('SELECT total_minutes, effort FROM meals WHERE id = ?', ['recipe'])).toEqual({ total_minutes: 25, effort: 'easy' });
    expect(again.getAll('SELECT ingredient, amount FROM recurring_groceries')).toEqual([{ ingredient: 'Bread', amount: 'one large loaf' }]);
    expect(again.getAll('SELECT id FROM shopping_items ORDER BY id')).toEqual([{ id: 'bread' }, { id: 'milk' }, { id: 'next-week' }]);
    final.close();
  });
});
