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
 * Build the full prompt for a PR review task
 */
function buildReviewPrompt(issue: GitHubIssue, branchName: string, groomedPlan: string, prNumber: number): string {
  const template = loadPrompt('pr-reviewer');
  const { owner, repo } = getRepoOwnerAndName();

  return template
    .replace(/\{\{ISSUE_NUMBER\}\}/g, String(issue.number))
    .replace(/\{\{ISSUE_TITLE\}\}/g, issue.title)
    .replace(/\{\{ISSUE_BODY\}\}/g, issue.body)
    .replace(/\{\{BRANCH_NAME\}\}/g, branchName)
    .replace(/\{\{REPO\}\}/g, `${owner}/${repo}`)
    .replace(/\{\{GROOMED_PLAN\}\}/g, groomedPlan)
    .replace(/\{\{PR_NUMBER\}\}/g, String(prNumber));
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
      // Clean up when the cmd /c start process exits (happens immediately after spawning window)
      subprocess.on('exit', () => {
        runningProcesses.delete(agentId);
      });
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
    const logFile = `${promptDir}\\build-issue-${issue.number}.log`.replace(/\//g, '\\');
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
echo [%TIME%] Working directory: %CD%
echo [%TIME%] Branch: ${branchName}
echo [%TIME%] Model: ${config.orchestrator.buildingModel}
echo [%TIME%] Prompt file: ${promptFile}
echo [%TIME%] Log file: ${logFile}
echo.
echo [%TIME%] Checking out branch...
git checkout ${branchName} 2>nul || git checkout -b ${branchName}
if errorlevel 1 (
    echo [%TIME%] ERROR: Failed to checkout branch
    pause
    exit /b 1
)
echo [%TIME%] On branch:
git branch --show-current
echo.
echo ----------------------------------------
echo [%TIME%] Starting Claude Code agent...
echo ----------------------------------------
echo.
type "${promptFile}" | claude --dangerously-skip-permissions --print --model ${config.orchestrator.buildingModel} > "${logFile}" 2>&1
set CLAUDE_EXIT=%errorlevel%
echo.
echo ----------------------------------------
echo [%TIME%] Claude Code finished with exit code: %CLAUDE_EXIT%
echo ----------------------------------------
echo.
if %CLAUDE_EXIT% EQU 0 (
    echo [%TIME%] SUCCESS - Agent completed successfully
) else (
    echo [%TIME%] WARNING - Agent exited with non-zero code
)
echo.
echo [%TIME%] Final git status:
git status --short
echo.
echo [%TIME%] Output saved to: ${logFile}
echo.
echo ========================================
echo   Build finished at %TIME%
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
      // Clean up when the cmd /c start process exits (happens immediately after spawning window)
      subprocess.on('exit', () => {
        runningProcesses.delete(agentId);
      });
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
 * Spawn a Claude Code instance to review a PR (visible in new terminal)
 */
export async function spawnReviewerAgent(
  issue: GitHubIssue,
  branchName: string,
  groomedPlan: string,
  prNumber: number
): Promise<AgentResult> {
  const agentId = randomUUID();
  const prompt = buildReviewPrompt(issue, branchName, groomedPlan, prNumber);

  console.log(`[Agent ${agentId.slice(0, 8)}] Starting reviewer agent for issue #${issue.number}, PR #${prNumber}`);
  console.log(`[Agent ${agentId.slice(0, 8)}] Opening new terminal window...`);

  try {
    // Write prompt to a clearly named file
    const promptDir = `${config.paths.dataDir}`.replace(/^\/([A-Z]):/, '$1:');
    mkdirSync(promptDir, { recursive: true });
    const promptFile = `${promptDir}\\review-issue-${issue.number}.txt`.replace(/\//g, '\\');
    writeFileSync(promptFile, prompt);

    // Get the working directory (the main project, not orchestrator)
    const workingDir = process.cwd().replace(/[\\/]agents[\\/]orchestrator$/, '').replace(/\//g, '\\');

    // Create batch file for the Claude terminal - runs autonomously
    const batchFile = `${promptDir}\\review-issue-${issue.number}.bat`.replace(/\//g, '\\');
    const logFile = `${promptDir}\\review-issue-${issue.number}.log`.replace(/\//g, '\\');
    const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
    const batchContent = `@echo off
cd /d "${workingDir}"
set GH_TOKEN=${ghToken}
echo.
echo ========================================
echo   REVIEWING: Issue #${issue.number}, PR #${prNumber}
echo   ${issue.title}
echo ========================================
echo.
echo [%TIME%] Working directory: %CD%
echo [%TIME%] Branch: ${branchName}
echo [%TIME%] Model: ${config.orchestrator.buildingModel}
echo [%TIME%] Prompt file: ${promptFile}
echo [%TIME%] Log file: ${logFile}
echo.
echo [%TIME%] Checking out branch...
git checkout ${branchName} 2>nul
if errorlevel 1 (
    echo [%TIME%] ERROR: Failed to checkout branch
    pause
    exit /b 1
)
echo [%TIME%] On branch:
git branch --show-current
echo.
echo ----------------------------------------
echo [%TIME%] Starting Claude Code reviewer...
echo ----------------------------------------
echo.
type "${promptFile}" | claude --dangerously-skip-permissions --print --model ${config.orchestrator.buildingModel} > "${logFile}" 2>&1
set CLAUDE_EXIT=%errorlevel%
echo.
echo ----------------------------------------
echo [%TIME%] Claude Code finished with exit code: %CLAUDE_EXIT%
echo ----------------------------------------
echo.
if %CLAUDE_EXIT% EQU 0 (
    echo [%TIME%] SUCCESS - Review completed
) else (
    echo [%TIME%] WARNING - Review exited with non-zero code
)
echo.
echo [%TIME%] Final git status:
git status --short
echo.
echo [%TIME%] Output saved to: ${logFile}
echo.
echo ========================================
echo   Review finished at %TIME%
echo ========================================
pause
`;
    writeFileSync(batchFile, batchContent);

    // Open terminal with Claude Code running autonomously
    const windowTitle = `Review: Issue #${issue.number}, PR #${prNumber}`;
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
      // Clean up when the cmd /c start process exits (happens immediately after spawning window)
      subprocess.on('exit', () => {
        runningProcesses.delete(agentId);
      });
    }

    console.log(`[Agent ${agentId.slice(0, 8)}] Started autonomous PR reviewer for issue #${issue.number}`);

    return { success: true, output: 'Reviewer agent window opened', agentId };
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
 * Get log file path for an agent
 */
export function getAgentLogPath(issueNumber: number, agentType: 'building' | 'reviewing'): string {
  const promptDir = `${config.paths.dataDir}`.replace(/^\/([A-Z]):/, '$1:');
  const prefix = agentType === 'building' ? 'build' : 'review';
  return `${promptDir}\\${prefix}-issue-${issueNumber}.log`.replace(/\//g, '\\');
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
