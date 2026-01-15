import initSqlJs, { Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from './config.js';

/**
 * Parse token usage from Claude Code log file
 * Looks for patterns like "Token usage: 12345/200000" or "Input tokens: 12345, Output tokens: 6789"
 */
export function parseTokenUsageFromLog(logContent: string): { inputTokens: number; outputTokens: number } | null {
  // Claude Code outputs token usage in format: "Token usage: INPUT/TOTAL; OUTPUT remaining"
  // or individual lines with input/output tokens

  // Try to find the final token usage summary (look for last occurrence)
  const lines = logContent.split('\n');
  let totalInput = 0;
  let totalOutput = 0;

  // Look for pattern: "Token usage: 12345/200000; 123456 remaining"
  const tokenUsageRegex = /Token usage:\s*(\d+)\/\d+;\s*(\d+)\s+remaining/gi;
  let match;
  while ((match = tokenUsageRegex.exec(logContent)) !== null) {
    totalInput = parseInt(match[1], 10);
    totalOutput = parseInt(match[1], 10); // Actually this is cumulative used tokens
  }

  // Alternative: look for explicit input/output token counts
  // Pattern: "Input tokens: 12345" and "Output tokens: 6789"
  const inputRegex = /(?:input tokens?|tokens? in):\s*(\d+)/gi;
  const outputRegex = /(?:output tokens?|tokens? out):\s*(\d+)/gi;

  let lastInputMatch;
  while ((match = inputRegex.exec(logContent)) !== null) {
    lastInputMatch = match;
  }

  let lastOutputMatch;
  while ((match = outputRegex.exec(logContent)) !== null) {
    lastOutputMatch = match;
  }

  if (lastInputMatch && lastOutputMatch) {
    return {
      inputTokens: parseInt(lastInputMatch[1], 10),
      outputTokens: parseInt(lastOutputMatch[1], 10),
    };
  }

  // If we found token usage pattern, estimate 60/40 split for input/output
  if (totalInput > 0) {
    return {
      inputTokens: Math.floor(totalInput * 0.4),
      outputTokens: Math.floor(totalInput * 0.6),
    };
  }

  return null;
}

/**
 * Simplified state tracking.
 *
 * GitHub labels are the source of truth for issue status.
 * This DB only tracks which issues are "active" (currently being processed)
 * to prevent duplicate pickup in the same poll cycle.
 */

export type AgentType = 'grooming' | 'building' | 'reviewing';

export interface ActiveIssue {
  issueNumber: number;
  agentType: AgentType;
  agentId: string | null;
  branchName: string | null;
  startedAt: string;
}

export interface TokenUsage {
  id: number;
  issueNumber: number;
  agentType: AgentType;
  inputTokens: number;
  outputTokens: number;
  completedAt: string;
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

  // Track token usage per agent session
  database.run(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_number INTEGER NOT NULL,
      agent_type TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
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
 * Get count of active agents (for capacity tracking)
 * This is the source of truth for capacity - not the process map
 */
export async function getActiveAgentCount(): Promise<number> {
  const database = await getDb();
  const stmt = database.prepare('SELECT COUNT(*) as count FROM active_issues');
  stmt.step();
  const result = stmt.getAsObject() as { count: number };
  stmt.free();
  return result.count;
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
 * Record token usage for an agent session
 */
export async function recordTokenUsage(
  issueNumber: number,
  agentType: AgentType,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const database = await getDb();
  const now = new Date().toISOString();
  database.run(
    `INSERT INTO token_usage (issue_number, agent_type, input_tokens, output_tokens, completed_at) VALUES (?, ?, ?, ?, ?)`,
    [issueNumber, agentType, inputTokens, outputTokens, now]
  );
  saveDb();
}

/**
 * Get token usage for a specific issue
 */
export async function getTokenUsageForIssue(issueNumber: number): Promise<TokenUsage[]> {
  const database = await getDb();
  const results: TokenUsage[] = [];

  const stmt = database.prepare('SELECT * FROM token_usage WHERE issue_number = ? ORDER BY completed_at DESC');
  stmt.bind([issueNumber]);

  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    results.push({
      id: row.id as number,
      issueNumber: row.issue_number as number,
      agentType: row.agent_type as AgentType,
      inputTokens: row.input_tokens as number,
      outputTokens: row.output_tokens as number,
      completedAt: row.completed_at as string,
    });
  }
  stmt.free();

  return results;
}

/**
 * Get aggregated token usage by agent type
 */
export async function getTokenUsageSummary(): Promise<Map<AgentType, { inputTokens: number; outputTokens: number; count: number }>> {
  const database = await getDb();
  const summary = new Map<AgentType, { inputTokens: number; outputTokens: number; count: number }>();

  const stmt = database.prepare(`
    SELECT agent_type, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, COUNT(*) as count
    FROM token_usage
    GROUP BY agent_type
  `);

  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    const agentType = row.agent_type as AgentType;
    summary.set(agentType, {
      inputTokens: row.total_input as number,
      outputTokens: row.total_output as number,
      count: row.count as number,
    });
  }
  stmt.free();

  return summary;
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
