import 'dotenv/config';

export const config = {
  github: {
    token: process.env.GITHUB_TOKEN || '',
    repo: process.env.GITHUB_REPO || '',
    // Labels for the two-phase workflow
    groomingLabel: process.env.GROOMING_LABEL || 'needs-grooming',
    awaitingApprovalLabel: 'awaiting-approval',
    readyLabel: process.env.ISSUE_LABEL || 'ready',
    inProgressLabel: 'in-progress',
    prReadyLabel: 'pr-ready',
    failedLabel: 'agent-failed',
  },
  orchestrator: {
    pollIntervalMs: 60_000, // 1 minute
    maxParallelAgents: 1,
    groomingModel: 'opus', // Best model for planning
    buildingModel: 'sonnet', // Good balance for implementation
  },
  paths: {
    dataDir: new URL('../../data', import.meta.url).pathname,
    promptsDir: new URL('../../prompts', import.meta.url).pathname,
  },
};

export function validateConfig(): void {
  if (!config.github.token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }
  if (!config.github.repo) {
    throw new Error('GITHUB_REPO environment variable is required (format: owner/repo)');
  }
}

export function getRepoOwnerAndName(): { owner: string; repo: string } {
  const [owner, repo] = config.github.repo.split('/');
  if (!owner || !repo) {
    throw new Error('GITHUB_REPO must be in format: owner/repo');
  }
  return { owner, repo };
}
