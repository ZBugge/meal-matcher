import 'dotenv/config';

export const config = {
  github: {
    token: process.env.GITHUB_TOKEN || '',
    repo: process.env.GITHUB_REPO || '',
    issueLabel: process.env.ISSUE_LABEL || 'ready',
  },
  orchestrator: {
    pollIntervalMs: 60_000, // 1 minute
    maxParallelAgents: 3,
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
