import { execa, ExecaChildProcess } from 'execa';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { config, getRepoOwnerAndName } from './config.js';
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
 * Build the full prompt for a grooming task
 */
function buildGroomingPrompt(issue: GitHubIssue): string {
  const template = loadPrompt('grooming');
  const { owner, repo } = getRepoOwnerAndName();

  return template
    .replace(/\{\{ISSUE_NUMBER\}\}/g, String(issue.number))
    .replace(/\{\{ISSUE_TITLE\}\}/g, issue.title)
    .replace(/\{\{ISSUE_BODY\}\}/g, issue.body)
    .replace(/\{\{REPO\}\}/g, `${owner}/${repo}`);
}

/**
 * Build the full prompt for a feature implementation task
 */
function buildFeaturePrompt(issue: GitHubIssue, branchName: string, groomedPlan: string): string {
  const template = loadPrompt('feature-builder');
  const { owner, repo } = getRepoOwnerAndName();

  return template
    .replace(/\{\{ISSUE_NUMBER\}\}/g, String(issue.number))
    .replace(/\{\{ISSUE_TITLE\}\}/g, issue.title)
    .replace(/\{\{ISSUE_BODY\}\}/g, issue.body)
    .replace(/\{\{BRANCH_NAME\}\}/g, branchName)
    .replace(/\{\{REPO\}\}/g, `${owner}/${repo}`)
    .replace(/\{\{GROOMED_PLAN\}\}/g, groomedPlan);
}

/**
 * Spawn a Claude Code instance for grooming (visible in new terminal)
 */
export async function spawnGroomingAgent(issue: GitHubIssue): Promise<AgentResult> {
  const agentId = randomUUID();
  const prompt = buildGroomingPrompt(issue);

  console.log(`[Agent ${agentId.slice(0, 8)}] Starting grooming agent for issue #${issue.number}`);
  console.log(`[Agent ${agentId.slice(0, 8)}] Opening new terminal window...`);

  try {
    // Write prompt to a clearly named file
    const promptDir = `${config.paths.dataDir}`.replace(/^\/([A-Z]):/, '$1:');
    mkdirSync(promptDir, { recursive: true });
    const promptFile = `${promptDir}\\groom-issue-${issue.number}.txt`.replace(/\//g, '\\');
    writeFileSync(promptFile, prompt);

    // Get the working directory (the main project, not orchestrator)
    const workingDir = process.cwd().replace(/[\\/]agents[\\/]orchestrator$/, '').replace(/\//g, '\\');

    // Create batch file for the Claude terminal (interactive - user pastes prompt)
    const batchFile = `${promptDir}\\groom-issue-${issue.number}.bat`.replace(/\//g, '\\');
    const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
    const batchContent = `@echo off
cd /d "${workingDir}"
set GH_TOKEN=${ghToken}
echo.
echo ========================================
echo   GROOMING: Issue #${issue.number}
echo   ${issue.title}
echo ========================================
echo.
echo This is a GROOMING session. Ask questions to clarify the issue.
echo When done, post the plan as a comment and update the label.
echo.
echo Ready for prompt. Paste from Notepad (Ctrl+V) then press Enter.
echo.
claude --dangerously-skip-permissions --model ${config.orchestrator.groomingModel}
echo.
echo ========================================
echo   Grooming finished
echo ========================================
pause
`;
    writeFileSync(batchFile, batchContent);

    // Open Notepad with the prompt file
    execa('cmd', ['/c', 'start', `"Groom Prompt: Issue #${issue.number}"`, 'notepad', promptFile], {
      detached: true,
      shell: true,
    });

    // Open terminal with Claude Code ready for paste
    const windowTitle = `Groom: Issue #${issue.number}`;
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
    }

    console.log(`[Agent ${agentId.slice(0, 8)}] Opened Notepad with grooming prompt + Claude terminal`);
    console.log(`[Agent ${agentId.slice(0, 8)}] Copy prompt from Notepad (Ctrl+A, Ctrl+C) and paste into Claude (Ctrl+V)`);

    return { success: true, output: 'Grooming agent windows opened', agentId };
  } catch (error) {
    runningProcesses.delete(agentId);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Agent ${agentId.slice(0, 8)}] Error: ${errorMessage}`);
    return { success: false, output: errorMessage, agentId };
  }
}

/**
 * Spawn a Claude Code instance to work on a feature (visible in new terminal)
 */
export async function spawnFeatureAgent(
  issue: GitHubIssue,
  branchName: string,
  groomedPlan: string
): Promise<AgentResult> {
  const agentId = randomUUID();
  const prompt = buildFeaturePrompt(issue, branchName, groomedPlan);

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

    // Create batch file for the Claude terminal - runs autonomously
    const batchFile = `${promptDir}\\run-issue-${issue.number}.bat`.replace(/\//g, '\\');
    const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
    const batchContent = `@echo off
cd /d "${workingDir}"
set GH_TOKEN=${ghToken}
echo.
echo ========================================
echo   BUILDING: Issue #${issue.number}
echo   ${issue.title}
echo ========================================
echo.
echo Checking out branch ${branchName}...
git checkout ${branchName} 2>nul || git checkout -b ${branchName}
echo.
echo Starting autonomous feature builder agent...
echo.
type "${promptFile}" | claude --dangerously-skip-permissions --model ${config.orchestrator.buildingModel}
echo.
echo ========================================
echo   Build finished
echo ========================================
pause
`;
    writeFileSync(batchFile, batchContent);

    // Open terminal with Claude Code running autonomously
    const windowTitle = `Build: Issue #${issue.number}`;
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
    }

    console.log(`[Agent ${agentId.slice(0, 8)}] Started autonomous feature builder for issue #${issue.number}`);

    return { success: true, output: 'Agent windows opened', agentId };
  } catch (error) {
    runningProcesses.delete(agentId);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Agent ${agentId.slice(0, 8)}] Error: ${errorMessage}`);
    return { success: false, output: errorMessage, agentId };
  }
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
  }
  runningProcesses.clear();
}
