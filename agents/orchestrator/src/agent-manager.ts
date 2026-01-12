import { execa, ExecaChildProcess } from 'execa';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { config, getRepoOwnerAndName } from './config.js';
import { registerAgent, updateAgentStatus, updateIssueStatus } from './state.js';
import type { GitHubIssue } from './github.js';

export interface AgentResult {
  success: boolean;
  output: string;
  agentId: string;
}

const runningProcesses = new Map<string, ExecaChildProcess>();

/**
 * Load a prompt template from the prompts directory
 */
function loadPrompt(promptName: string): string {
  const promptPath = `${config.paths.promptsDir}/${promptName}.md`.replace(/^\/([A-Z]):/, '$1:');
  return readFileSync(promptPath, 'utf-8');
}

/**
 * Build the full prompt for a feature implementation task
 */
function buildFeaturePrompt(issue: GitHubIssue, branchName: string): string {
  const template = loadPrompt('feature-builder');
  const { owner, repo } = getRepoOwnerAndName();

  return template
    .replace('{{ISSUE_NUMBER}}', String(issue.number))
    .replace('{{ISSUE_TITLE}}', issue.title)
    .replace('{{ISSUE_BODY}}', issue.body)
    .replace('{{BRANCH_NAME}}', branchName)
    .replace('{{REPO}}', `${owner}/${repo}`);
}

/**
 * Spawn a Claude Code instance to work on a feature (visible in new terminal)
 */
export async function spawnFeatureAgent(
  issue: GitHubIssue,
  branchName: string
): Promise<AgentResult> {
  const agentId = randomUUID();
  const prompt = buildFeaturePrompt(issue, branchName);

  console.log(`[Agent ${agentId.slice(0, 8)}] Starting feature agent for issue #${issue.number}`);
  console.log(`[Agent ${agentId.slice(0, 8)}] Opening new terminal window...`);

  try {
    // Write prompt to a clearly named file
    const promptDir = `${config.paths.dataDir}`.replace(/^\/([A-Z]):/, '$1:');
    mkdirSync(promptDir, { recursive: true });
    const promptFile = `${promptDir}\\prompt-issue-${issue.number}.txt`.replace(/\//g, '\\');
    writeFileSync(promptFile, prompt);

    // Get the working directory (the main project, not orchestrator)
    const workingDir = process.cwd().replace(/[\\/]agents[\\/]orchestrator$/, '').replace(/\//g, '\\');

    // Create batch file for the Claude terminal
    const batchFile = `${promptDir}\\run-issue-${issue.number}.bat`.replace(/\//g, '\\');
    const batchContent = `@echo off
cd /d "${workingDir}"
echo.
echo ========================================
echo   Agent: Issue #${issue.number}
echo   ${issue.title}
echo ========================================
echo.
echo Checking out branch ${branchName}...
git checkout ${branchName} 2>nul || git checkout -b ${branchName}
echo.
echo Ready for prompt. Paste from Notepad (Ctrl+V) then press Enter.
echo.
claude --dangerously-skip-permissions
echo.
echo ========================================
echo   Agent finished
echo ========================================
pause
`;
    writeFileSync(batchFile, batchContent);

    // Open Notepad with the prompt file
    execa('cmd', ['/c', 'start', `"Prompt: Issue #${issue.number}"`, 'notepad', promptFile], {
      detached: true,
      shell: true,
    });

    // Open terminal with Claude Code ready for paste
    const windowTitle = `Agent: Issue #${issue.number}`;
    const subprocess = execa('cmd', [
      '/c',
      'start',
      `"${windowTitle}"`,
      batchFile,
    ], {
      cwd: workingDir,
      detached: true,
      shell: true,
    });

    if (subprocess.pid) {
      runningProcesses.set(agentId, subprocess);
      await registerAgent(agentId, issue.number, 'feature-builder', subprocess.pid);
    }

    console.log(`[Agent ${agentId.slice(0, 8)}] Opened Notepad with prompt + Claude terminal for issue #${issue.number}`);
    console.log(`[Agent ${agentId.slice(0, 8)}] Copy prompt from Notepad (Ctrl+A, Ctrl+C) and paste into Claude (Ctrl+V)`);

    return { success: true, output: 'Agent windows opened', agentId };
  } catch (error) {
    runningProcesses.delete(agentId);

    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateAgentStatus(agentId, 'failed', errorMessage);
    await updateIssueStatus(issue.number, 'failed');

    console.error(`[Agent ${agentId.slice(0, 8)}] Error: ${errorMessage}`);

    return { success: false, output: errorMessage, agentId };
  }
}

/**
 * Kill a running agent process
 */
export async function killAgent(agentId: string): Promise<boolean> {
  const process = runningProcesses.get(agentId);
  if (process) {
    process.kill('SIGTERM');
    runningProcesses.delete(agentId);
    await updateAgentStatus(agentId, 'failed', 'Killed by orchestrator');
    return true;
  }
  return false;
}

/**
 * Get count of currently running agents
 */
export function getRunningAgentCount(): number {
  return runningProcesses.size;
}

/**
 * Cleanup all running processes on shutdown
 */
export async function cleanupAgents(): Promise<void> {
  for (const [agentId, process] of runningProcesses) {
    console.log(`[Cleanup] Killing agent ${agentId.slice(0, 8)}`);
    process.kill('SIGTERM');
    await updateAgentStatus(agentId, 'failed', 'Orchestrator shutdown');
  }
  runningProcesses.clear();
}
