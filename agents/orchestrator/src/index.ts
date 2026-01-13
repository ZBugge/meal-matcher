import { existsSync, readdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { config, validateConfig } from './config.js';
import {
  fetchReadyIssues,
  fetchGroomingIssues,
  fetchIssue,
  createBranch,
  createPullRequest,
  addIssueComment,
  removeLabel,
  addLabel,
  findGroomedPlan,
  GitHubIssue,
} from './github.js';
import {
  claimIssue,
  claimIssueForGrooming,
  getClaimedIssueNumbers,
  getGroomingIssueNumbers,
  isGroomingInProgress,
  updateIssueStatus,
  closeDb,
  getAllTrackedIssues,
  resetIssue,
} from './state.js';
import {
  spawnFeatureAgent,
  spawnGroomingAgent,
  getRunningAgentCount,
  cleanupAgents,
} from './agent-manager.js';

function getWorkingDir(): string {
  return process.cwd().replace(/[\\/]agents[\\/]orchestrator$/, '');
}

function runGit(args: string, cwd?: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: cwd || getWorkingDir(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return '';
  }
}

function getBranchStatus(branchName: string): { exists: boolean; unpushedCommits: number; hasLocalChanges: boolean } {
  const workingDir = getWorkingDir();

  // Check if branch exists locally
  const branches = runGit('branch --list', workingDir);
  const exists = branches.split('\n').some(b => b.trim().replace('* ', '') === branchName);

  if (!exists) {
    return { exists: false, unpushedCommits: 0, hasLocalChanges: false };
  }

  // Check for unpushed commits
  const unpushed = runGit(`log origin/master..${branchName} --oneline`, workingDir);
  const unpushedCommits = unpushed ? unpushed.split('\n').filter(l => l.trim()).length : 0;

  // Check for uncommitted changes on that branch
  const currentBranch = runGit('branch --show-current', workingDir);
  let hasLocalChanges = false;
  if (currentBranch === branchName) {
    const status = runGit('status --porcelain', workingDir);
    hasLocalChanges = status.length > 0;
  }

  return { exists, unpushedCommits, hasLocalChanges };
}

async function resetState(): Promise<void> {
  // Get tracked issues before deleting DB so we can reset their labels
  let trackedIssues: { issueNumber: number; status: string }[] = [];
  try {
    trackedIssues = await getAllTrackedIssues();
  } catch {
    // DB might not exist
  }

  // Reset GitHub labels for tracked issues
  if (trackedIssues.length > 0) {
    console.log('Resetting GitHub labels...');
    for (const issue of trackedIssues) {
      try {
        // Remove all possible workflow labels
        await removeLabel(issue.issueNumber, config.github.groomingLabel);
        await removeLabel(issue.issueNumber, 'grooming');
        await removeLabel(issue.issueNumber, config.github.awaitingApprovalLabel);
        await removeLabel(issue.issueNumber, config.github.inProgressLabel);
        await removeLabel(issue.issueNumber, config.github.prReadyLabel);
        await removeLabel(issue.issueNumber, config.github.failedLabel);
        // Add back the grooming label so they can be picked up fresh
        await addLabel(issue.issueNumber, config.github.groomingLabel);
        console.log(`  ✓ Reset labels for #${issue.issueNumber}`);
      } catch (err) {
        console.log(`  ⚠ Could not reset labels for #${issue.issueNumber}: ${err}`);
      }
    }
  }

  // Close the database connection before deleting
  closeDb();

  // Clean up all files in the data directory
  const dataDir = config.paths.dataDir.replace(/^\/([A-Z]):/, '$1:');
  if (existsSync(dataDir)) {
    const files = readdirSync(dataDir);
    for (const file of files) {
      const filePath = `${dataDir}/${file}`;
      rmSync(filePath, { force: true });
    }
    console.log(`\n✓ Cleaned up ${files.length} file(s) in data directory`);
  } else {
    console.log('\n✓ No data to reset (already clean)');
  }

  console.log('\nAll issues will be picked up fresh on next run.');
}

async function showStatus(): Promise<void> {
  console.log('📊 Agent Orchestrator Status\n');

  const issues = await getAllTrackedIssues();

  if (issues.length === 0) {
    console.log('No issues currently tracked.\n');
    console.log('Workflow:');
    console.log(`  1. Issues with "${config.github.groomingLabel}" label → Grooming phase (interactive)`);
    console.log(`  2. After grooming, change label to "${config.github.readyLabel}" → Building phase (parallel)`);
    return;
  }

  // Group by status
  const grooming = issues.filter(i => i.status === 'grooming');
  const awaitingApproval = issues.filter(i => i.status === 'awaiting_approval');
  const inProgress = issues.filter(i => i.status === 'in_progress');
  const prCreated = issues.filter(i => i.status === 'pr_created');

  console.log(`Tracked Issues (${issues.length}):\n`);

  if (grooming.length > 0) {
    console.log('🔍 GROOMING (interactive):');
    for (const issue of grooming) {
      console.log(`  #${issue.issueNumber}: ${issue.title}`);
    }
    console.log('');
  }

  if (awaitingApproval.length > 0) {
    console.log('⏳ AWAITING APPROVAL:');
    for (const issue of awaitingApproval) {
      console.log(`  #${issue.issueNumber}: ${issue.title}`);
      console.log(`    → Change label to "${config.github.readyLabel}" to start building`);
    }
    console.log('');
  }

  if (inProgress.length > 0) {
    console.log('🔨 BUILDING (in progress):');
    for (const issue of inProgress) {
      const branchName = issue.branchName || `feature/issue-${issue.issueNumber}`;
      const branchStatus = getBranchStatus(branchName);

      console.log(`  #${issue.issueNumber}: ${issue.title}`);
      console.log(`    Branch: ${branchName}`);

      if (branchStatus.exists) {
        if (branchStatus.unpushedCommits > 0) {
          console.log(`    ⚠️  ${branchStatus.unpushedCommits} unpushed commit(s)`);
        }
        if (branchStatus.hasLocalChanges) {
          console.log(`    ⚠️  Has uncommitted changes`);
        }
      }
    }
    console.log('');
  }

  if (prCreated.length > 0) {
    console.log('✅ PR CREATED:');
    for (const issue of prCreated) {
      console.log(`  #${issue.issueNumber}: ${issue.title}`);
      if (issue.prUrl) {
        console.log(`    PR: ${issue.prUrl}`);
      }
    }
    console.log('');
  }

  console.log('Commands:');
  console.log('  npm run retry <issue#>  - Reset and retry a specific issue');
  console.log('  npm run reset           - Clear all tracked issues');
}

async function retryIssue(issueNumber: number): Promise<void> {
  console.log(`🔄 Retrying issue #${issueNumber}\n`);

  const issues = await getAllTrackedIssues();
  const issue = issues.find(i => i.issueNumber === issueNumber);

  if (!issue) {
    console.log(`Issue #${issueNumber} is not currently tracked.`);
    console.log('Use "npm run status" to see tracked issues.');
    return;
  }

  const workingDir = getWorkingDir();

  // If this was a building issue, handle branch cleanup
  if (issue.branchName) {
    const branchStatus = getBranchStatus(issue.branchName);

    // Warn about unpushed work
    if (branchStatus.unpushedCommits > 0 || branchStatus.hasLocalChanges) {
      console.log('⚠️  Warning: This branch has unpushed work:\n');

      if (branchStatus.unpushedCommits > 0) {
        console.log(`   ${branchStatus.unpushedCommits} unpushed commit(s)`);
        const commits = runGit(`log origin/master..${issue.branchName} --oneline`, workingDir);
        commits.split('\n').forEach(c => console.log(`     - ${c}`));
      }
      if (branchStatus.hasLocalChanges) {
        console.log('   Uncommitted changes present');
      }

      console.log('\n   This work will be DISCARDED. The branch will be reset to master.');
      console.log('   Press Ctrl+C within 5 seconds to cancel...\n');

      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Reset the branch
    console.log(`Resetting branch ${issue.branchName}...`);

    // Switch to master first
    const currentBranch = runGit('branch --show-current', workingDir);
    if (currentBranch === issue.branchName) {
      runGit('checkout master', workingDir);
    }

    // Delete the branch
    if (branchStatus.exists) {
      runGit(`branch -D ${issue.branchName}`, workingDir);
    }

    console.log('✓ Branch cleaned up\n');
  }

  // Reset the issue in the database
  await resetIssue(issueNumber);
  console.log('✓ Issue state reset\n');

  // Reset GitHub labels back to needs-grooming
  console.log('Resetting GitHub labels...');
  try {
    await removeLabel(issueNumber, 'grooming');
    await removeLabel(issueNumber, config.github.awaitingApprovalLabel);
    await removeLabel(issueNumber, config.github.inProgressLabel);
    await removeLabel(issueNumber, config.github.prReadyLabel);
    await removeLabel(issueNumber, config.github.failedLabel);
    await addLabel(issueNumber, config.github.groomingLabel);
    console.log('✓ GitHub labels reset (back to needs-grooming)\n');
  } catch {
    console.log('⚠ Could not reset GitHub labels\n');
  }

  console.log(`Issue #${issueNumber} has been reset.`);
  console.log('It will be picked up for grooming on next orchestrator run.');
}

let isShuttingDown = false;

/**
 * Process issues that need grooming (Phase 1)
 * Only one grooming session at a time
 */
async function processGroomingIssues(): Promise<void> {
  // Check if grooming is already in progress
  if (await isGroomingInProgress()) {
    console.log('[Orchestrator] Grooming already in progress, skipping');
    return;
  }

  // Fetch issues that need grooming
  const issues = await fetchGroomingIssues();
  const groomingNumbers = await getGroomingIssueNumbers();

  // Filter to unclaimed issues and sort by issue number (oldest first)
  const unclaimedIssues = issues
    .filter((issue) => !groomingNumbers.has(issue.number))
    .sort((a, b) => a.number - b.number);

  if (unclaimedIssues.length === 0) {
    console.log('[Orchestrator] No issues need grooming');
    return;
  }

  // Process only the first issue (single grooming at a time)
  const issue = unclaimedIssues[0];

  try {
    console.log(`[Orchestrator] Starting grooming for issue #${issue.number}: ${issue.title}`);

    // Claim the issue for grooming
    const claimed = await claimIssueForGrooming(issue.number, issue.id, issue.title);
    if (!claimed) {
      console.log(`[Orchestrator] Issue #${issue.number} already being groomed, skipping`);
      return;
    }

    // Update GitHub labels
    await removeLabel(issue.number, config.github.groomingLabel);
    await addLabel(issue.number, 'grooming');
    await addIssueComment(
      issue.number,
      `🔍 Starting grooming session for this issue.\n\nThe agent will ask clarifying questions to understand the requirements.`
    );

    // Spawn the grooming agent
    const result = await spawnGroomingAgent(issue);

    if (!result.success) {
      await handleAgentFailure(issue.number, result.output);
    }
  } catch (error) {
    console.error(`[Orchestrator] Error grooming issue #${issue.number}:`, error);
  }
}

/**
 * Process issues that are ready for building (Phase 2)
 * Can run multiple in parallel
 */
async function processReadyIssues(): Promise<void> {
  // Check if we have capacity for more agents
  const runningCount = getRunningAgentCount();
  if (runningCount >= config.orchestrator.maxParallelAgents) {
    console.log(`[Orchestrator] At max capacity (${runningCount} agents running)`);
    return;
  }

  // Fetch ready issues from GitHub
  const issues = await fetchReadyIssues();
  const claimedNumbers = await getClaimedIssueNumbers();

  // Filter to unclaimed issues and sort by issue number (oldest first)
  const unclaimedIssues = issues
    .filter((issue) => !claimedNumbers.has(issue.number))
    .sort((a, b) => a.number - b.number);

  if (unclaimedIssues.length === 0) {
    console.log('[Orchestrator] No ready issues to build');
    return;
  }

  console.log(`[Orchestrator] Found ${unclaimedIssues.length} ready issues for building`);

  // Process issues up to capacity
  const availableSlots = config.orchestrator.maxParallelAgents - runningCount;
  const issuesToProcess = unclaimedIssues.slice(0, availableSlots);

  for (const issue of issuesToProcess) {
    if (isShuttingDown) break;

    try {
      console.log(`[Orchestrator] Starting build for issue #${issue.number}: ${issue.title}`);

      // Find the groomed plan from comments
      const groomedPlan = await findGroomedPlan(issue.number);
      if (!groomedPlan) {
        console.log(`[Orchestrator] No groomed plan found for #${issue.number}, skipping`);
        console.log(`[Orchestrator] Add "${config.github.groomingLabel}" label to groom first`);
        continue;
      }

      // Create a branch for this issue
      const branchName = await createBranch(issue.number);
      console.log(`[Orchestrator] Created branch: ${branchName}`);

      // Claim the issue in our state
      const claimed = await claimIssue(issue.number, issue.id, issue.title, branchName);
      if (!claimed) {
        console.log(`[Orchestrator] Issue #${issue.number} already claimed, skipping`);
        continue;
      }

      // Update GitHub labels
      await removeLabel(issue.number, config.github.readyLabel);
      await addLabel(issue.number, config.github.inProgressLabel);
      await addIssueComment(
        issue.number,
        `🔨 Building has started!\n\nBranch: \`${branchName}\`\n\nThe agent is implementing the approved plan.`
      );

      // Spawn the feature agent with the groomed plan
      const result = await spawnFeatureAgent(issue, branchName, groomedPlan);

      if (!result.success) {
        await handleAgentFailure(issue.number, result.output);
      }
    } catch (error) {
      console.error(`[Orchestrator] Error building issue #${issue.number}:`, error);
    }
  }
}

async function handleAgentSuccess(
  issueNumber: number,
  branchName: string,
  title: string
): Promise<void> {
  try {
    console.log(`[Orchestrator] Creating PR for issue #${issueNumber}`);

    // Create pull request
    const pr = await createPullRequest(
      issueNumber,
      branchName,
      `feat: ${title}`,
      `Implements the feature requested in #${issueNumber}.\n\n🤖 This PR was created automatically by an agent.`
    );

    await updateIssueStatus(issueNumber, 'pr_created', pr.number, pr.url);

    // Update GitHub
    await removeLabel(issueNumber, 'in-progress');
    await addLabel(issueNumber, 'pr-ready');
    await addIssueComment(
      issueNumber,
      `✅ Implementation complete!\n\nPull Request: ${pr.url}`
    );

    console.log(`[Orchestrator] PR created: ${pr.url}`);
  } catch (error) {
    console.error(`[Orchestrator] Error creating PR for issue #${issueNumber}:`, error);
    await handleAgentFailure(issueNumber, String(error));
  }
}

async function handleAgentFailure(issueNumber: number, error: string): Promise<void> {
  try {
    await removeLabel(issueNumber, 'grooming');
    await removeLabel(issueNumber, config.github.inProgressLabel);
    await addLabel(issueNumber, config.github.failedLabel);
    await addIssueComment(
      issueNumber,
      `❌ Agent encountered an error while working on this issue.\n\n\`\`\`\n${error.slice(0, 1000)}\n\`\`\`\n\nPlease review and re-add the \`${config.github.groomingLabel}\` label to retry from grooming.`
    );
  } catch (commentError) {
    console.error(`[Orchestrator] Error commenting on issue #${issueNumber}:`, commentError);
  }
}

async function orchestrationLoop(): Promise<void> {
  console.log('[Orchestrator] Starting orchestration loop...');
  console.log(`[Orchestrator] Polling interval: ${config.orchestrator.pollIntervalMs}ms`);
  console.log(`[Orchestrator] Max parallel agents: ${config.orchestrator.maxParallelAgents}`);
  console.log('');
  console.log('[Orchestrator] Two-phase workflow:');
  console.log(`  Phase 1: Grooming (label: "${config.github.groomingLabel}") - Interactive, one at a time`);
  console.log(`  Phase 2: Building (label: "${config.github.readyLabel}") - Parallel, autonomous`);
  console.log('');

  while (!isShuttingDown) {
    try {
      // Phase 1: Process grooming issues (one at a time)
      await processGroomingIssues();

      // Phase 2: Process ready issues (parallel)
      await processReadyIssues();
    } catch (error) {
      console.error('[Orchestrator] Error in main loop:', error);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, config.orchestrator.pollIntervalMs));
  }
}

function setupShutdownHandlers(): void {
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\n[Orchestrator] Shutting down...');
    await cleanupAgents();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle --reset command
  if (args.includes('--reset')) {
    try {
      validateConfig();
    } catch (error) {
      console.error('Configuration error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
    await resetState();
    closeDb();
    process.exit(0);
  }

  // Handle --status command
  if (args.includes('--status')) {
    try {
      validateConfig();
    } catch (error) {
      console.error('Configuration error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
    await showStatus();
    closeDb();
    process.exit(0);
  }

  // Handle --retry <issue#> command
  const retryIndex = args.indexOf('--retry');
  if (retryIndex !== -1) {
    const issueNum = parseInt(args[retryIndex + 1], 10);
    if (isNaN(issueNum)) {
      console.error('Error: --retry requires an issue number');
      console.error('Usage: npm run retry <issue#>');
      process.exit(1);
    }
    try {
      validateConfig();
    } catch (error) {
      console.error('Configuration error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
    await retryIssue(issueNum);
    closeDb();
    process.exit(0);
  }

  // Handle --help command
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Agent Orchestrator - Two-phase workflow for implementing GitHub issues with Claude Code

WORKFLOW:
  Phase 1 - Grooming (Interactive, one at a time):
    - Issues with "${config.github.groomingLabel}" label are picked up for grooming
    - Agent asks clarifying questions and creates implementation plan
    - Plan is posted as a comment, label changed to "awaiting-approval"
    - User reviews and changes label to "${config.github.readyLabel}" to approve

  Phase 2 - Building (Parallel, autonomous):
    - Issues with "${config.github.readyLabel}" label are picked up for building
    - Agent implements following the approved plan
    - Can run multiple in parallel (up to maxParallelAgents)

USAGE:
  npm run dev              Start the orchestrator (dev mode)
  npm run status           Show tracked issues and their state
  npm run retry <issue#>   Reset and retry a specific issue
  npm run reset            Clear all tracked issues
  npm start -- --help      Show this help message

ENVIRONMENT VARIABLES:
  GITHUB_TOKEN      GitHub Personal Access Token (required)
  GITHUB_REPO       Repository as owner/repo (required)
  GROOMING_LABEL    Label for issues needing grooming (default: needs-grooming)
  ISSUE_LABEL       Label for approved issues ready to build (default: ready)
`);
    process.exit(0);
  }

  console.log('🤖 Agent Orchestrator Starting...\n');

  try {
    validateConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(`Repository: ${config.github.repo}`);
  console.log(`Grooming label: ${config.github.groomingLabel}`);
  console.log(`Ready label: ${config.github.readyLabel}\n`);

  setupShutdownHandlers();
  await orchestrationLoop();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
