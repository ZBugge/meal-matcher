import { unlinkSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { config, validateConfig } from './config.js';
import {
  fetchReadyIssues,
  fetchPRReadyIssues,
  fetchIssue,
  createBranch,
  createPullRequest,
  addIssueComment,
  removeLabel,
  addLabel,
  getPullRequestForBranch,
  GitHubIssue,
} from './github.js';
import {
  claimIssue,
  getClaimedIssueNumbers,
  updateIssueStatus,
  closeDb,
  getInProgressIssues,
  resetIssue,
} from './state.js';
import {
  spawnFeatureAgent,
  spawnReviewerAgent,
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
  const dbPath = `${config.paths.dataDir}/agents.db`.replace(/^\/([A-Z]):/, '$1:');

  // Get tracked issues before deleting DB so we can reset their labels
  let trackedIssues: { issueNumber: number }[] = [];
  try {
    trackedIssues = await getInProgressIssues();
  } catch {
    // DB might not exist
  }

  // Reset GitHub labels for tracked issues
  if (trackedIssues.length > 0) {
    console.log('Resetting GitHub labels...');
    for (const issue of trackedIssues) {
      try {
        await removeLabel(issue.issueNumber, 'in-progress');
        await removeLabel(issue.issueNumber, 'agent-failed');
        await addLabel(issue.issueNumber, config.github.issueLabel);
        console.log(`  ✓ Reset labels for #${issue.issueNumber}`);
      } catch (err) {
        console.log(`  ⚠ Could not reset labels for #${issue.issueNumber}: ${err}`);
      }
    }
  }

  // Close the database connection before deleting
  closeDb();

  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
    console.log('\n✓ Database reset successfully');
    console.log(`  Deleted: ${dbPath}`);
  } else {
    console.log('\n✓ No database to reset (already clean)');
  }

  console.log('\nAll issues will be picked up fresh on next run.');
}

async function showStatus(): Promise<void> {
  console.log('📊 Agent Orchestrator Status\n');

  const issues = await getInProgressIssues();

  if (issues.length === 0) {
    console.log('No issues currently tracked.\n');
    console.log('Issues with the "ready" label will be picked up on next run.');
    return;
  }

  console.log(`Tracked Issues (${issues.length}):\n`);

  for (const issue of issues) {
    const branchName = issue.branchName || `feature/issue-${issue.issueNumber}`;
    const branchStatus = getBranchStatus(branchName);

    console.log(`  #${issue.issueNumber}: ${issue.title}`);
    console.log(`    Status: ${issue.status}`);
    console.log(`    Branch: ${branchName}`);

    if (branchStatus.exists) {
      if (branchStatus.unpushedCommits > 0) {
        console.log(`    ⚠️  ${branchStatus.unpushedCommits} unpushed commit(s)`);
      }
      if (branchStatus.hasLocalChanges) {
        console.log(`    ⚠️  Has uncommitted changes`);
      }
      if (branchStatus.unpushedCommits === 0 && !branchStatus.hasLocalChanges) {
        console.log(`    ✓ Branch is clean`);
      }
    } else {
      console.log(`    Branch not found locally`);
    }
    console.log('');
  }

  console.log('Commands:');
  console.log('  npm run retry <issue#>  - Reset and retry a specific issue');
  console.log('  npm run reset           - Clear all tracked issues');
}

async function retryIssue(issueNumber: number): Promise<void> {
  console.log(`🔄 Retrying issue #${issueNumber}\n`);

  const issues = await getInProgressIssues();
  const issue = issues.find(i => i.issueNumber === issueNumber);

  if (!issue) {
    console.log(`Issue #${issueNumber} is not currently tracked.`);
    console.log('Use "npm run status" to see tracked issues.');
    return;
  }

  const branchName = issue.branchName || `feature/issue-${issueNumber}`;
  const branchStatus = getBranchStatus(branchName);
  const workingDir = getWorkingDir();

  // Warn about unpushed work
  if (branchStatus.unpushedCommits > 0 || branchStatus.hasLocalChanges) {
    console.log('⚠️  Warning: This branch has unpushed work:\n');

    if (branchStatus.unpushedCommits > 0) {
      console.log(`   ${branchStatus.unpushedCommits} unpushed commit(s)`);
      const commits = runGit(`log origin/master..${branchName} --oneline`, workingDir);
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
  console.log(`Resetting branch ${branchName}...`);

  // Switch to master first
  const currentBranch = runGit('branch --show-current', workingDir);
  if (currentBranch === branchName) {
    runGit('checkout master', workingDir);
  }

  // Delete and recreate the branch
  if (branchStatus.exists) {
    runGit(`branch -D ${branchName}`, workingDir);
  }
  runGit(`checkout -b ${branchName}`, workingDir);

  console.log('✓ Branch reset to master\n');

  // Reset the issue in the database
  await resetIssue(issueNumber);
  console.log('✓ Issue state reset\n');

  // Reset GitHub labels
  console.log('Resetting GitHub labels...');
  try {
    await removeLabel(issueNumber, 'in-progress');
    await removeLabel(issueNumber, 'agent-failed');
    console.log('✓ GitHub labels reset\n');
  } catch {
    console.log('⚠ Could not reset GitHub labels\n');
  }

  // Fetch the issue from GitHub to get full details
  console.log('Fetching issue details from GitHub...');
  let githubIssue = await fetchIssue(issueNumber);

  if (!githubIssue) {
    // Create a minimal issue object from what we have
    githubIssue = {
      id: issue.issueId,
      number: issueNumber,
      title: issue.title,
      body: '',
      labels: [],
      url: `https://github.com/${config.github.repo}/issues/${issueNumber}`,
    };
    console.log('⚠ Could not fetch full issue details, using cached info.\n');
  } else {
    console.log('✓ Issue details fetched\n');
  }

  // Claim the issue and spawn agent
  await claimIssue(issueNumber, githubIssue.id, githubIssue.title, branchName);

  console.log('Spawning new agent...\n');
  await spawnFeatureAgent(githubIssue, branchName);

  console.log(`\n✓ Agent spawned for issue #${issueNumber}`);
  console.log('  Check the new terminal window to interact with the agent.');
}

let isShuttingDown = false;

async function processNewIssues(): Promise<void> {
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
    console.log('[Orchestrator] No new issues to process');
    return;
  }

  console.log(`[Orchestrator] Found ${unclaimedIssues.length} unclaimed issues`);

  // Process issues up to capacity
  const availableSlots = config.orchestrator.maxParallelAgents - runningCount;
  const issuesToProcess = unclaimedIssues.slice(0, availableSlots);

  for (const issue of issuesToProcess) {
    if (isShuttingDown) break;

    try {
      console.log(`[Orchestrator] Processing issue #${issue.number}: ${issue.title}`);

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
      await removeLabel(issue.number, config.github.issueLabel);
      await addLabel(issue.number, 'in-progress');
      await addIssueComment(
        issue.number,
        `🤖 An agent has started working on this issue.\n\nBranch: \`${branchName}\``
      );

      // Spawn the agent in a visible terminal window
      const result = await spawnFeatureAgent(issue, branchName);

      if (!result.success) {
        await handleAgentFailure(issue.number, result.output);
      }
      // If successful, agent is running in its own window
      // User will interact with it and create PR when done
    } catch (error) {
      console.error(`[Orchestrator] Error processing issue #${issue.number}:`, error);
    }
  }
}

async function processPRReadyIssues(): Promise<void> {
  // Check if we have capacity for more agents
  const runningCount = getRunningAgentCount();
  if (runningCount >= config.orchestrator.maxParallelAgents) {
    return;
  }

  // Fetch issues with pr-ready label
  const issues = await fetchPRReadyIssues();

  if (issues.length === 0) {
    return;
  }

  console.log(`[Orchestrator] Found ${issues.length} PR(s) ready for review`);

  // Process PRs up to capacity
  const availableSlots = config.orchestrator.maxParallelAgents - runningCount;
  const prsToReview = issues.slice(0, availableSlots);

  for (const issue of prsToReview) {
    if (isShuttingDown) break;

    try {
      const branchName = `feature/issue-${issue.number}`;
      const pr = await getPullRequestForBranch(branchName);

      if (!pr) {
        console.log(`[Orchestrator] No PR found for issue #${issue.number}, skipping`);
        continue;
      }

      console.log(`[Orchestrator] Starting review for PR #${pr.number} (issue #${issue.number})`);

      // Get the approved plan from issue comments
      // For now, we'll use the issue body as the plan
      const approvedPlan = issue.body;

      // Update labels
      await removeLabel(issue.number, 'pr-ready');
      await addLabel(issue.number, 'reviewing');
      await addIssueComment(
        issue.number,
        `🤖 A reviewer agent has started reviewing PR #${pr.number}.\n\nThe agent will check spec compliance and test coverage.`
      );

      // Spawn the reviewer agent
      const result = await spawnReviewerAgent(issue, branchName, pr.number, approvedPlan);

      if (!result.success) {
        await handleReviewerFailure(issue.number, pr.number, result.output);
      }
      // If successful, agent is running in its own window
    } catch (error) {
      console.error(`[Orchestrator] Error processing PR for issue #${issue.number}:`, error);
    }
  }
}

async function handleReviewerFailure(issueNumber: number, prNumber: number, error: string): Promise<void> {
  try {
    await removeLabel(issueNumber, 'reviewing');
    await addLabel(issueNumber, 'needs-fixes');
    await addIssueComment(
      issueNumber,
      `❌ Reviewer agent encountered an error.\n\n\`\`\`\n${error.slice(0, 1000)}\n\`\`\``
    );
  } catch (commentError) {
    console.error(`[Orchestrator] Error commenting on issue #${issueNumber}:`, commentError);
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
    await removeLabel(issueNumber, 'in-progress');
    await addLabel(issueNumber, 'agent-failed');
    await addIssueComment(
      issueNumber,
      `❌ Agent encountered an error while working on this issue.\n\n\`\`\`\n${error.slice(0, 1000)}\n\`\`\`\n\nPlease review and re-add the \`${config.github.issueLabel}\` label to retry.`
    );
  } catch (commentError) {
    console.error(`[Orchestrator] Error commenting on issue #${issueNumber}:`, commentError);
  }
}

async function orchestrationLoop(): Promise<void> {
  console.log('[Orchestrator] Starting orchestration loop...');
  console.log(`[Orchestrator] Polling interval: ${config.orchestrator.pollIntervalMs}ms`);
  console.log(`[Orchestrator] Max parallel agents: ${config.orchestrator.maxParallelAgents}`);

  while (!isShuttingDown) {
    try {
      // Phase 1: Process new issues (ready label)
      await processNewIssues();

      // Phase 3: Process PRs ready for review (pr-ready label)
      await processPRReadyIssues();
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
Agent Orchestrator - Automatically implement GitHub issues with Claude Code

Usage:
  npm run dev              Start the orchestrator (dev mode)
  npm run status           Show tracked issues and their state
  npm run retry <issue#>   Reset and retry a specific issue
  npm run reset            Clear all tracked issues
  npm start -- --help      Show this help message

Environment Variables:
  GITHUB_TOKEN    GitHub Personal Access Token (required)
  GITHUB_REPO     Repository as owner/repo (required)
  ISSUE_LABEL     Label to filter issues (default: ready)
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
  console.log(`Issue label: ${config.github.issueLabel}\n`);

  setupShutdownHandlers();
  await orchestrationLoop();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
