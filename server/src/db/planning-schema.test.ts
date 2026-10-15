import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import initSqlJs from 'sql.js';
const originalPath = process.env.DATABASE_PATH;
let fixtureDirectory: string | undefined;
afterEach(() => {
  process.env.DATABASE_PATH = originalPath;
  vi.resetModules();
  if (fixtureDirectory && path.dirname(fixtureDirectory) === os.tmpdir() && path.basename(fixtureDirectory).startsWith('mealmatch-plan-schema-')) fs.rmSync(fixtureDirectory, { recursive: true, force: true });
});
describe('Planning schema compatibility', () => {
  it.each([false, true])('creates identical durable planning tables (legacy database: %s)', async legacy => {
    fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mealmatch-plan-schema-'));
    const databasePath = path.join(fixtureDirectory, 'fixture.db');
    process.env.DATABASE_PATH = databasePath;
    if (legacy) {
      const SQL = await initSqlJs(); const previous = new SQL.Database();
      previous.run(`CREATE TABLE hosts(id TEXT PRIMARY KEY, email TEXT, password_hash TEXT);
        CREATE TABLE meals(id TEXT PRIMARY KEY, host_id TEXT, type TEXT, archived INTEGER);
        CREATE TABLE sessions(id TEXT PRIMARY KEY);`);
      fs.writeFileSync(databasePath, Buffer.from(previous.export())); previous.close();
    }
    vi.resetModules();
    let schema = await import('./schema');
    let database = await schema.initializeDatabase();
    for (const [table, columns] of [
      ['plan_entries', ['id', 'host_id', 'week', 'meal_id', 'kind', 'title', 'date', 'created_at']],
      ['shopping_items', ['id', 'host_id', 'week', 'entry_id', 'source_title', 'amount', 'ingredient', 'aisle', 'state', 'display_order']],
      ['dinner_staples', ['id', 'host_id', 'title']],
      ['login_sessions', ['id', 'data', 'expires']],
    ] as const) expect(database.exec(`PRAGMA table_info(${table})`)[0].values.map(row => row[1])).toEqual(columns);
    database.run("INSERT INTO plan_entries(id, host_id, week, kind, title) VALUES ('entry', 'host', '2026-10-12', 'takeout', 'Pizza')");
    database.run("INSERT INTO shopping_items(id, host_id, week, entry_id, source_title, ingredient, amount, state) VALUES ('item', 'host', '2026-10-12', 'entry', 'Pizza', 'Milk', '1 carton', 'have')");
    schema.saveDatabase();
    vi.resetModules(); schema = await import('./schema'); database = await schema.initializeDatabase();
    expect(database.exec('SELECT title FROM plan_entries')[0].values).toEqual([['Pizza']]);
    expect(database.exec('SELECT ingredient, amount, state FROM shopping_items')[0].values).toEqual([['Milk', '1 carton', 'have']]);
  });
});
