import initSqlJs, { Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from './config.js';

/**
 * Simplified state tracking.
 *
 * GitHub labels are the source of truth for issue status.
 * This DB only tracks which issues are "active" (currently being processed)
 * to prevent duplicate pickup in the same poll cycle.
 */

export type AgentType = 'grooming' | 'building';

export interface ActiveIssue {
  issueNumber: number;
  agentType: AgentType;
  agentId: string | null;
  branchName: string | null;
  startedAt: string;
}

let db: Database | null = null;
let dbPath: string = '';

function getDbPath(): string {
  if (!dbPath) {
    dbPath = `${config.paths.dataDir}/agents.db`.replace(/^\/([A-Z]):/, '$1:');
  }
  return dbPath;
}

async function getDb(): Promise<Database> {
  if (!db) {
    const SQL = await initSqlJs();
    const path = getDbPath();
    mkdirSync(dirname(path), { recursive: true });

    if (existsSync(path)) {
      const data = readFileSync(path);
      db = new SQL.Database(data);
    } else {
      db = new SQL.Database();
    }

    initSchema();
  }
  return db;
}

function initSchema(): void {
  const database = db!;

  // Simple table: just track which issues are actively being processed
  database.run(`
    CREATE TABLE IF NOT EXISTS active_issues (
      issue_number INTEGER PRIMARY KEY,
      agent_type TEXT NOT NULL,
      agent_id TEXT,
      branch_name TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  saveDb();
}

function saveDb(): void {
  if (db) {
    const data = db.export();
    writeFileSync(getDbPath(), Buffer.from(data));
  }
}

/**
 * Mark an issue as actively being processed
 */
export async function markIssueActive(
  issueNumber: number,
  agentType: AgentType,
  agentId?: string,
  branchName?: string
): Promise<boolean> {
  const database = await getDb();

  // Check if already active
  const stmt = database.prepare('SELECT issue_number FROM active_issues WHERE issue_number = ?');
  stmt.bind([issueNumber]);
  const exists = stmt.step();
  stmt.free();

  if (exists) {
    return false; // Already being processed
  }

  const now = new Date().toISOString();
  database.run(
    `INSERT INTO active_issues (issue_number, agent_type, agent_id, branch_name, started_at) VALUES (?, ?, ?, ?, ?)`,
    [issueNumber, agentType, agentId || null, branchName || null, now]
  );

  saveDb();
  return true;
}

/**
 * Update agent ID for an active issue
 */
export async function updateActiveIssueAgent(
  issueNumber: number,
  agentId: string
): Promise<void> {
  const database = await getDb();
  database.run(
    `UPDATE active_issues SET agent_id = ? WHERE issue_number = ?`,
    [agentId, issueNumber]
  );
  saveDb();
}

/**
 * Check if an issue is currently being processed
 */
export async function isIssueActive(issueNumber: number): Promise<boolean> {
  const database = await getDb();
  const stmt = database.prepare('SELECT issue_number FROM active_issues WHERE issue_number = ?');
  stmt.bind([issueNumber]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

/**
 * Get all active issues of a specific type
 */
export async function getActiveIssues(agentType?: AgentType): Promise<ActiveIssue[]> {
  const database = await getDb();
  const results: ActiveIssue[] = [];

  const query = agentType
    ? 'SELECT * FROM active_issues WHERE agent_type = ?'
    : 'SELECT * FROM active_issues';

  const stmt = database.prepare(query);
  if (agentType) {
    stmt.bind([agentType]);
  }

  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    results.push({
      issueNumber: row.issue_number as number,
      agentType: row.agent_type as AgentType,
      agentId: row.agent_id as string | null,
      branchName: row.branch_name as string | null,
      startedAt: row.started_at as string,
    });
  }
  stmt.free();

  return results;
}

/**
 * Get set of active issue numbers (for quick lookup)
 */
export async function getActiveIssueNumbers(agentType?: AgentType): Promise<Set<number>> {
  const issues = await getActiveIssues(agentType);
  return new Set(issues.map(i => i.issueNumber));
}

/**
 * Clear an issue from active tracking (done processing)
 */
export async function clearIssue(issueNumber: number): Promise<void> {
  const database = await getDb();
  database.run('DELETE FROM active_issues WHERE issue_number = ?', [issueNumber]);
  saveDb();
}

/**
 * Clear all active issues
 */
export async function clearAllIssues(): Promise<void> {
  const database = await getDb();
  database.run('DELETE FROM active_issues');
  saveDb();
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}
