import initSqlJs, { Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from './config.js';

export type AgentStatus = 'running' | 'completed' | 'failed' | 'timeout';
export type IssueStatus = 'pending' | 'in_progress' | 'pr_created' | 'completed' | 'failed';

export interface TrackedIssue {
  issueNumber: number;
  issueId: number;
  title: string;
  status: IssueStatus;
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrackedAgent {
  agentId: string;
  issueNumber: number;
  agentType: string;
  status: AgentStatus;
  pid: number | null;
  startedAt: string;
  completedAt: string | null;
  output: string | null;
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

  database.run(`
    CREATE TABLE IF NOT EXISTS issues (
      issue_number INTEGER PRIMARY KEY,
      issue_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      branch_name TEXT,
      pr_number INTEGER,
      pr_url TEXT,
      agent_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS agents (
      agent_id TEXT PRIMARY KEY,
      issue_number INTEGER NOT NULL,
      agent_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      pid INTEGER,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      output TEXT
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
 * Claim an issue for processing
 */
export async function claimIssue(
  issueNumber: number,
  issueId: number,
  title: string,
  branchName: string
): Promise<boolean> {
  const database = await getDb();

  // Check if already claimed
  const stmt = database.prepare('SELECT status FROM issues WHERE issue_number = ?');
  stmt.bind([issueNumber]);

  let existing: { status: string } | undefined;
  if (stmt.step()) {
    existing = stmt.getAsObject() as { status: string };
  }
  stmt.free();

  if (existing && existing.status !== 'failed') {
    return false; // Already claimed
  }

  const now = new Date().toISOString();

  if (existing) {
    // Re-claim a failed issue
    database.run(
      `UPDATE issues SET status = 'in_progress', branch_name = ?, updated_at = ? WHERE issue_number = ?`,
      [branchName, now, issueNumber]
    );
  } else {
    // New claim
    database.run(
      `INSERT INTO issues (issue_number, issue_id, title, status, branch_name, created_at, updated_at) VALUES (?, ?, ?, 'in_progress', ?, ?, ?)`,
      [issueNumber, issueId, title, branchName, now, now]
    );
  }

  saveDb();
  return true;
}

/**
 * Register a new agent for an issue
 */
export async function registerAgent(
  agentId: string,
  issueNumber: number,
  agentType: string,
  pid: number
): Promise<void> {
  const database = await getDb();
  const now = new Date().toISOString();

  database.run(
    `INSERT INTO agents (agent_id, issue_number, agent_type, pid, started_at) VALUES (?, ?, ?, ?, ?)`,
    [agentId, issueNumber, agentType, pid, now]
  );

  database.run(
    `UPDATE issues SET agent_id = ?, updated_at = ? WHERE issue_number = ?`,
    [agentId, now, issueNumber]
  );

  saveDb();
}

/**
 * Update agent status
 */
export async function updateAgentStatus(
  agentId: string,
  status: AgentStatus,
  output?: string
): Promise<void> {
  const database = await getDb();
  const now = new Date().toISOString();

  database.run(
    `UPDATE agents SET status = ?, completed_at = ?, output = ? WHERE agent_id = ?`,
    [status, now, output || null, agentId]
  );

  saveDb();
}

/**
 * Update issue status
 */
export async function updateIssueStatus(
  issueNumber: number,
  status: IssueStatus,
  prNumber?: number,
  prUrl?: string
): Promise<void> {
  const database = await getDb();
  const now = new Date().toISOString();

  database.run(
    `UPDATE issues SET status = ?, pr_number = ?, pr_url = ?, updated_at = ? WHERE issue_number = ?`,
    [status, prNumber || null, prUrl || null, now, issueNumber]
  );

  saveDb();
}

/**
 * Get all running agents
 */
export async function getRunningAgents(): Promise<TrackedAgent[]> {
  const database = await getDb();
  const results: TrackedAgent[] = [];

  const stmt = database.prepare(`SELECT * FROM agents WHERE status = 'running'`);
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    results.push({
      agentId: row.agent_id as string,
      issueNumber: row.issue_number as number,
      agentType: row.agent_type as string,
      status: row.status as AgentStatus,
      pid: row.pid as number | null,
      startedAt: row.started_at as string,
      completedAt: row.completed_at as string | null,
      output: row.output as string | null,
    });
  }
  stmt.free();

  return results;
}

/**
 * Get issues that are in progress
 */
export async function getInProgressIssues(): Promise<TrackedIssue[]> {
  const database = await getDb();
  const results: TrackedIssue[] = [];

  const stmt = database.prepare(`SELECT * FROM issues WHERE status = 'in_progress'`);
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    results.push({
      issueNumber: row.issue_number as number,
      issueId: row.issue_id as number,
      title: row.title as string,
      status: row.status as IssueStatus,
      branchName: row.branch_name as string | null,
      prNumber: row.pr_number as number | null,
      prUrl: row.pr_url as string | null,
      agentId: row.agent_id as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    });
  }
  stmt.free();

  return results;
}

/**
 * Get all claimed issue numbers
 */
export async function getClaimedIssueNumbers(): Promise<Set<number>> {
  const database = await getDb();
  const numbers = new Set<number>();

  const stmt = database.prepare(
    `SELECT issue_number FROM issues WHERE status NOT IN ('completed', 'failed')`
  );
  while (stmt.step()) {
    const row = stmt.getAsObject() as { issue_number: number };
    numbers.add(row.issue_number);
  }
  stmt.free();

  return numbers;
}

/**
 * Reset a specific issue (delete from tracking)
 */
export async function resetIssue(issueNumber: number): Promise<void> {
  const database = await getDb();

  // Delete associated agents
  database.run(`DELETE FROM agents WHERE issue_number = ?`, [issueNumber]);

  // Delete the issue
  database.run(`DELETE FROM issues WHERE issue_number = ?`, [issueNumber]);

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
