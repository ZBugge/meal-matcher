import { existsSync, readdirSync, rmSync } from 'fs';
import { config, validateConfig } from './config.js';
import {
  fetchReadyIssues,
  fetchGroomingIssues,
  fetchPRReadyIssues,
  createBranch,
  addIssueComment,
  removeLabel,
  addLabel,
  findGroomedPlan,
  getIssueLabels,
  getPullRequestForBranch,
} from './github.js';
import {
  markIssueActive,
  getActiveIssueNumbers,
  getActiveIssues,
  clearIssue,
  clearAllIssues,
  closeDb,
} from './state.js';
import {
  spawnFeatureAgent,
  spawnGroomingAgent,
  spawnReviewerAgent,
  getRunningAgentCount,
  cleanupAgents,
} from './agent-manager.js';

/**
 * GitHub labels are the source of truth for issue status.
 * The DB only tracks which issues are "active" (currently being processed)
 * to prevent duplicate pickup in the same poll cycle.
 */

let isShuttingDown = false;

async function resetState(): Promise<void> {
  // Clear the database
  await clearAllIssues();
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

  console.log('\nActive issue tracking cleared.');
  console.log('GitHub labels are the source of truth - check labels on your issues.');
}

async function showStatus(): Promise<void> {
  console.log('📊 Agent Orchestrator Status\n');

  // Show active issues (being processed right now)
  const activeIssues = await getActiveIssues();

  if (activeIssues.length > 0) {
    console.log('🔄 ACTIVE (currently being processed):\n');
    for (const issue of activeIssues) {
      console.log(`  #${issue.issueNumber}`);
      console.log(`    Type: ${issue.agentType}`);
      if (issue.branchName) {
        console.log(`    Branch: ${issue.branchName}`);
      }
      console.log(`    Started: ${issue.startedAt}`);
      console.log('');
    }
  } else {
    console.log('No issues currently being processed.\n');
  }

  console.log('GitHub labels are the source of truth for issue status.');
  console.log('Check your repo for issues with these labels:');
  console.log(`  • "${config.github.groomingLabel}" - Ready for grooming`);
  console.log(`  • "grooming" - Being groomed`);
  console.log(`  • "${config.github.awaitingApprovalLabel}" - Plan ready, needs approval`);
  console.log(`  • "${config.github.readyLabel}" - Approved, ready to build`);
  console.log(`  • "${config.github.inProgressLabel}" - Being built`);
  console.log(`  • "${config.github.prReadyLabel}" - PR created`);
  console.log('');
  console.log('Commands:');
  console.log('  npm run reset  - Clear active tracking (does not change GitHub labels)');
}

/**
 * Sync active issues with GitHub labels.
 * If an issue no longer has the expected label, release the hold.
 */
async function syncActiveIssues(): Promise<void> {
  const activeIssues = await getActiveIssues();

  for (const issue of activeIssues) {
    const labels = await getIssueLabels(issue.issueNumber);

    // Grooming issues should have "grooming" label while active
    if (issue.agentType === 'grooming' && !labels.includes('grooming')) {
      console.log(`[Orchestrator] Grooming done for #${issue.issueNumber}, releasing hold`);
      await clearIssue(issue.issueNumber);
    }

    // Building issues should have "in-progress" label while active
    if (issue.agentType === 'building' && !labels.includes(config.github.inProgressLabel)) {
      console.log(`[Orchestrator] Building done for #${issue.issueNumber}, releasing hold`);
      await clearIssue(issue.issueNumber);
    }

    // Reviewing issues should have "reviewing" label while active
    if (issue.agentType === 'reviewing' && !labels.includes(config.github.reviewingLabel)) {
      console.log(`[Orchestrator] Review done for #${issue.issueNumber}, releasing hold`);
      await clearIssue(issue.issueNumber);
    }
  }
}

/**
 * Process issues that need grooming (Phase 1)
 * Only one grooming session at a time
 */
async function processGroomingIssues(): Promise<void> {
  // Check if grooming is already in progress
  const activeGrooming = await getActiveIssueNumbers('grooming');
  if (activeGrooming.size > 0) {
    console.log('[Orchestrator] Grooming already in progress, skipping');
    return;
  }

  // Fetch issues that need grooming from GitHub (source of truth)
  const issues = await fetchGroomingIssues();

  if (issues.length === 0) {
    console.log('[Orchestrator] No issues need grooming');
    return;
  }

  // Sort by issue number (oldest first) and take the first one
  const issue = issues.sort((a, b) => a.number - b.number)[0];

  // Mark as active to prevent duplicate pickup
  const marked = await markIssueActive(issue.number, 'grooming');
  if (!marked) {
    console.log(`[Orchestrator] Issue #${issue.number} already active, skipping`);
    return;
  }

  try {
    console.log(`[Orchestrator] Starting grooming for issue #${issue.number}: ${issue.title}`);

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
      await clearIssue(issue.number);
    }
  } catch (error) {
    console.error(`[Orchestrator] Error grooming issue #${issue.number}:`, error);
    await clearIssue(issue.number);
  }
}

/**
 * Process issues that are ready for building (Phase 2)
 * Can run multiple in parallel
 */
async function processReadyIssues(): Promise<void> {
  // Check capacity
  const runningCount = getRunningAgentCount();
  if (runningCount >= config.orchestrator.maxParallelAgents) {
    console.log(`[Orchestrator] At max capacity (${runningCount} agents running)`);
    return;
  }

  // Fetch ready issues from GitHub (source of truth)
  const issues = await fetchReadyIssues();
  const activeBuilding = await getActiveIssueNumbers('building');

  // Filter out already active issues
  const availableIssues = issues
    .filter(issue => !activeBuilding.has(issue.number))
    .sort((a, b) => a.number - b.number);

  if (availableIssues.length === 0) {
    console.log('[Orchestrator] No ready issues to build');
    return;
  }

  console.log(`[Orchestrator] Found ${availableIssues.length} ready issues for building`);

  // Process issues up to capacity
  const availableSlots = config.orchestrator.maxParallelAgents - runningCount;
  const issuesToProcess = availableIssues.slice(0, availableSlots);

  for (const issue of issuesToProcess) {
    if (isShuttingDown) break;

    // Mark as active
    const marked = await markIssueActive(issue.number, 'building');
    if (!marked) {
      console.log(`[Orchestrator] Issue #${issue.number} already active, skipping`);
      continue;
    }

    try {
      console.log(`[Orchestrator] Starting build for issue #${issue.number}: ${issue.title}`);

      // Find the groomed plan from comments
      const groomedPlan = await findGroomedPlan(issue.number);
      if (!groomedPlan) {
        console.log(`[Orchestrator] No groomed plan found for #${issue.number}, skipping`);
        console.log(`[Orchestrator] Add "${config.github.groomingLabel}" label to groom first`);
        await clearIssue(issue.number);
        continue;
      }

      // Create a branch for this issue
      const branchName = await createBranch(issue.number);
      console.log(`[Orchestrator] Created branch: ${branchName}`);

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
        await clearIssue(issue.number);
      }
    } catch (error) {
      console.error(`[Orchestrator] Error building issue #${issue.number}:`, error);
      await clearIssue(issue.number);
    }
  }
}

/**
 * Process PRs that are ready for review (Phase 3)
 * Can run multiple in parallel
 */
async function processPRReadyIssues(): Promise<void> {
  // Check capacity
  const runningCount = getRunningAgentCount();
  if (runningCount >= config.orchestrator.maxParallelAgents) {
    console.log(`[Orchestrator] At max capacity (${runningCount} agents running)`);
    return;
  }

  // Fetch pr-ready issues from GitHub (source of truth)
  const issues = await fetchPRReadyIssues();
  const activeReviewing = await getActiveIssueNumbers('reviewing');

  // Filter out already active issues
  const availableIssues = issues
    .filter(issue => !activeReviewing.has(issue.number))
    .sort((a, b) => a.number - b.number);

  if (availableIssues.length === 0) {
    console.log('[Orchestrator] No PRs ready for review');
    return;
  }

  console.log(`[Orchestrator] Found ${availableIssues.length} PRs ready for review`);

  // Process issues up to capacity
  const availableSlots = config.orchestrator.maxParallelAgents - runningCount;
  const issuesToProcess = availableIssues.slice(0, availableSlots);

  for (const issue of issuesToProcess) {
    if (isShuttingDown) break;

    // Mark as active
    const marked = await markIssueActive(issue.number, 'reviewing');
    if (!marked) {
      console.log(`[Orchestrator] Issue #${issue.number} already active, skipping`);
      continue;
    }

    try {
      console.log(`[Orchestrator] Starting review for issue #${issue.number}: ${issue.title}`);

      // Find the groomed plan from comments
      const groomedPlan = await findGroomedPlan(issue.number);
      if (!groomedPlan) {
        console.log(`[Orchestrator] No groomed plan found for #${issue.number}, skipping`);
        await clearIssue(issue.number);
        continue;
      }

      // Get the branch name and PR
      const branchName = `feature/issue-${issue.number}`;
      const pr = await getPullRequestForBranch(branchName);
      if (!pr) {
        console.log(`[Orchestrator] No PR found for branch ${branchName}, skipping`);
        await clearIssue(issue.number);
        continue;
      }

      // Update GitHub labels
      await removeLabel(issue.number, config.github.prReadyLabel);
      await addLabel(issue.number, config.github.reviewingLabel);
      await addIssueComment(
        issue.number,
        `🔍 PR review started!\n\nPR: #${pr.number}\nBranch: \`${branchName}\`\n\nThe agent will review for spec compliance and test coverage.`
      );

      // Spawn the reviewer agent
      const result = await spawnReviewerAgent(issue, branchName, groomedPlan, pr.number);

      if (!result.success) {
        await handleAgentFailure(issue.number, result.output);
        await clearIssue(issue.number);
      }
    } catch (error) {
      console.error(`[Orchestrator] Error reviewing issue #${issue.number}:`, error);
      await clearIssue(issue.number);
    }
  }
}

async function handleAgentFailure(issueNumber: number, error: string): Promise<void> {
  try {
    await removeLabel(issueNumber, 'grooming');
    await removeLabel(issueNumber, config.github.inProgressLabel);
    await removeLabel(issueNumber, config.github.reviewingLabel);
    await addLabel(issueNumber, config.github.failedLabel);
    await addIssueComment(
      issueNumber,
      `❌ Agent encountered an error.\n\n\`\`\`\n${error.slice(0, 1000)}\n\`\`\`\n\nTo retry, add the \`${config.github.groomingLabel}\` label.`
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
  console.log('[Orchestrator] GitHub labels are the source of truth:');
  console.log(`  Phase 1 (Grooming): "${config.github.groomingLabel}" → "grooming" → "${config.github.awaitingApprovalLabel}"`);
  console.log(`  Phase 2 (Building): "${config.github.readyLabel}" → "${config.github.inProgressLabel}" → "${config.github.prReadyLabel}"`);
  console.log(`  Phase 3 (Reviewing): "${config.github.prReadyLabel}" → "${config.github.reviewingLabel}" → "${config.github.mergedLabel}"`);
  console.log('');

  while (!isShuttingDown) {
    try {
      // Sync: Release holds for completed agents
      await syncActiveIssues();

      // Phase 1: Process grooming issues (one at a time)
      await processGroomingIssues();

      // Phase 2: Process ready issues (parallel)
      await processReadyIssues();

      // Phase 3: Process PR ready issues (parallel)
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

  // Handle --help command
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Agent Orchestrator - Two-phase workflow for implementing GitHub issues

GITHUB LABELS ARE THE SOURCE OF TRUTH

The orchestrator reads GitHub labels to determine what to do:
  • "${config.github.groomingLabel}" → Start grooming (interactive, one at a time)
  • "${config.github.readyLabel}" → Start building (parallel, autonomous)

WORKFLOW:
  Phase 1 - Grooming:
    ${config.github.groomingLabel} → grooming → ${config.github.awaitingApprovalLabel}
    Agent asks questions, posts plan as comment

  Phase 2 - Building:
    ${config.github.readyLabel} → ${config.github.inProgressLabel} → ${config.github.prReadyLabel}
    Agent implements the approved plan

TO APPROVE A PLAN:
  Change label from "${config.github.awaitingApprovalLabel}" to "${config.github.readyLabel}"
  Or tell the agent "mark it ready" during grooming

COMMANDS:
  npm run dev      Start the orchestrator
  npm run status   Show active issues
  npm run reset    Clear active tracking

ENVIRONMENT:
  GITHUB_TOKEN      GitHub token (required)
  GITHUB_REPO       Repository as owner/repo (required)
  GROOMING_LABEL    Label for grooming (default: needs-grooming)
  ISSUE_LABEL       Label for building (default: ready)
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
