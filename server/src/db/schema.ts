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
  } else {
    db = new SQL.Database();
    createTables(db);
    saveDatabase();
  }

  return db;
}

function createTables(database: Database): void {
  database.run(`
    -- Host accounts
    CREATE TABLE IF NOT EXISTS hosts (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Swipe sessions
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL REFERENCES hosts(id),
      invite_code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'open',
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
