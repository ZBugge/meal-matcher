import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

let db: Database | null = null;

const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../data/database.db');

export async function initializeDatabase(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  // Ensure data directory exists
  const dataDir = path.dirname(DATABASE_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Load existing database or create new one
  if (fs.existsSync(DATABASE_PATH)) {
    const buffer = fs.readFileSync(DATABASE_PATH);
    db = new SQL.Database(buffer);
    runMigrations(db);
  } else {
    db = new SQL.Database();
    createTables(db);
    saveDatabase();
  }

  return db;
}

function runMigrations(database: Database): void {
  if (!columnExists(database, 'meals', 'temporary')) {
    database.run('ALTER TABLE meals ADD COLUMN temporary INTEGER DEFAULT 0');
  }

  if (!columnExists(database, 'meals', 'creator_token')) {
    database.run('ALTER TABLE meals ADD COLUMN creator_token TEXT');
  }

  if (!columnExists(database, 'sessions', 'mode')) {
    database.run("ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'home'");
  }

  if (!columnExists(database, 'hosts', 'takeout_onboarding_dismissed')) {
    database.run('ALTER TABLE hosts ADD COLUMN takeout_onboarding_dismissed INTEGER NOT NULL DEFAULT 0');
  }

  database.run("UPDATE meals SET type = 'meal' WHERE type IS NULL OR TRIM(type) = ''");
  database.run(`
    UPDATE hosts
    SET takeout_onboarding_dismissed = 1
    WHERE EXISTS (
      SELECT 1
      FROM meals
      WHERE meals.host_id = hosts.id AND meals.type = 'category'
    )
  `);
  database.run(`
    CREATE INDEX IF NOT EXISTS idx_meals_host_type_archived
    ON meals(host_id, type, archived)
  `);

  saveDatabase();
}

function columnExists(database: Database, table: string, column: string): boolean {
  const result = database.exec(`PRAGMA table_info(${table})`);
  if (result.length === 0) return false;

  const nameIndex = result[0].columns.indexOf('name');
  return result[0].values.some((row) => row[nameIndex] === column);
}

function createTables(database: Database): void {
  database.run(`
    -- Host accounts
    CREATE TABLE IF NOT EXISTS hosts (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      takeout_onboarding_dismissed INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Meals owned by hosts
    CREATE TABLE IF NOT EXISTS meals (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL REFERENCES hosts(id),
      title TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'meal',
      archived INTEGER DEFAULT 0,
      pick_count INTEGER DEFAULT 0,
      temporary INTEGER DEFAULT 0,
      creator_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Swipe sessions
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL REFERENCES hosts(id),
      invite_code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'open',
      mode TEXT NOT NULL DEFAULT 'home',
      selected_meal_id TEXT REFERENCES meals(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME
    );

    -- Junction table: which meals are in which session
    CREATE TABLE IF NOT EXISTS session_meals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      meal_id TEXT NOT NULL REFERENCES meals(id),
      display_order INTEGER
    );

    -- Participants in a session
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      display_name TEXT NOT NULL,
      host_id TEXT REFERENCES hosts(id),
      submitted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Individual swipes
    CREATE TABLE IF NOT EXISTS swipes (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL REFERENCES participants(id),
      session_meal_id TEXT NOT NULL REFERENCES session_meals(id),
      vote INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(participant_id, session_meal_id)
    );

    -- Session history (what was selected)
    CREATE TABLE IF NOT EXISTS session_history (
      id TEXT PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL REFERENCES sessions(id),
      selected_meal_id TEXT NOT NULL REFERENCES meals(id),
      selected_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_meals_host_id ON meals(host_id);
    CREATE INDEX IF NOT EXISTS idx_meals_host_type_archived ON meals(host_id, type, archived);
    CREATE INDEX IF NOT EXISTS idx_sessions_host_id ON sessions(host_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_invite_code ON sessions(invite_code);
    CREATE INDEX IF NOT EXISTS idx_session_meals_session_id ON session_meals(session_id);
    CREATE INDEX IF NOT EXISTS idx_participants_session_id ON participants(session_id);
    CREATE INDEX IF NOT EXISTS idx_swipes_participant_id ON swipes(participant_id);
  `);
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export function saveDatabase(): void {
  if (!db) return;

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DATABASE_PATH, buffer);
}

// Helper to run queries and save automatically
export function runQuery(sql: string, params: unknown[] = []): void {
  const database = getDatabase();
  database.run(sql, params);
  saveDatabase();
}

export function getOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const database = getDatabase();
  const stmt = database.prepare(sql);
  stmt.bind(params);

  if (stmt.step()) {
    const row = stmt.getAsObject() as T;
    stmt.free();
    return row;
  }

  stmt.free();
  return undefined;
}

export function getAll<T>(sql: string, params: unknown[] = []): T[] {
  const database = getDatabase();
  const stmt = database.prepare(sql);
  stmt.bind(params);

  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }

  stmt.free();
  return results;
}
