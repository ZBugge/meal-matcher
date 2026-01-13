import { Octokit } from '@octokit/rest';
import { config, getRepoOwnerAndName } from './config.js';

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  labels: string[];
  url: string;
}

export interface PullRequest {
  number: number;
  url: string;
  diff?: string;
}

let octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!octokit) {
    octokit = new Octokit({ auth: config.github.token });
  }
  return octokit;
}

/**
 * Fetch all open issues with the configured label
 */
export async function fetchReadyIssues(): Promise<GitHubIssue[]> {
  const { owner, repo } = getRepoOwnerAndName();
  const client = getOctokit();

  const response = await client.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    labels: config.github.issueLabel,
    per_page: 100,
  });

  return response.data
    .filter((issue) => !issue.pull_request) // Exclude PRs
    .map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
      url: issue.html_url,
    }));
}

/**
 * Fetch all open issues with pr-ready label
 */
export async function fetchPRReadyIssues(): Promise<GitHubIssue[]> {
  const { owner, repo } = getRepoOwnerAndName();
  const client = getOctokit();

  const response = await client.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    labels: 'pr-ready',
    per_page: 100,
  });

  return response.data
    .filter((issue) => !issue.pull_request) // Exclude PRs
    .map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
      url: issue.html_url,
    }));
}

/**
 * Fetch a single issue by number
 */
export async function fetchIssue(issueNumber: number): Promise<GitHubIssue | null> {
  const { owner, repo } = getRepoOwnerAndName();
  const client = getOctokit();

  try {
    const { data: issue } = await client.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
      url: issue.html_url,
    };
  } catch {
    return null;
  }
}

/**
 * Create a new branch for working on an issue
 */
export async function createBranch(issueNumber: number, baseBranch = 'master'): Promise<string> {
  const { owner, repo } = getRepoOwnerAndName();
  const client = getOctokit();

  // Get the SHA of the base branch
  const { data: ref } = await client.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });

  const branchName = `feature/issue-${issueNumber}`;

  // Create the new branch
  await client.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  });

  return branchName;
}

/**
 * Create a pull request for a completed feature
 */
export async function createPullRequest(
  issueNumber: number,
  branchName: string,
  title: string,
  body: string
): Promise<PullRequest> {
  const { owner, repo } = getRepoOwnerAndName();
  const client = getOctokit();

  const { data: pr } = await client.pulls.create({
    owner,
    repo,
    title,
    body: `${body}\n\nCloses #${issueNumber}`,
    head: branchName,
    base: 'master',
  });

  return {
    number: pr.number,
    url: pr.html_url,
  };
}

/**
 * Add a comment to an issue
 */
export async function addIssueComment(issueNumber: number, body: string): Promise<void> {
  const { owner, repo } = getRepoOwnerAndName();
  const client = getOctokit();

  await client.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}

/**
 * Remove a label from an issue
 */
export async function removeLabel(issueNumber: number, label: string): Promise<void> {
  const { owner, repo } = getRepoOwnerAndName();
  const client = getOctokit();

  try {
    await client.issues.removeLabel({
      owner,
      repo,
      issue_number: issueNumber,
      name: label,
    });
  } catch {
    // Label might not exist, ignore
  }
}

/**
 * Add a label to an issue
 */
export async function addLabel(issueNumber: number, label: string): Promise<void> {
  const { owner, repo } = getRepoOwnerAndName();
  const client = getOctokit();

  await client.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [label],
  });
}

/**
 * Get pull request details for a branch
 */
export async function getPullRequestForBranch(branchName: string): Promise<PullRequest | null> {
  const { owner, repo } = getRepoOwnerAndName();
  const client = getOctokit();

  try {
    const { data: prs } = await client.pulls.list({
      owner,
      repo,
      head: `${owner}:${branchName}`,
      state: 'open',
    });

    if (prs.length === 0) {
      return null;
    }

    const pr = prs[0];

    // Fetch the diff
    const { data: diff } = await client.pulls.get({
      owner,
      repo,
      pull_number: pr.number,
      mediaType: {
        format: 'diff',
      },
    });

    return {
      number: pr.number,
      url: pr.html_url,
      diff: diff as unknown as string,
    };
  } catch {
    return null;
  }
}

/**
 * Merge a pull request
 */
export async function mergePullRequest(prNumber: number): Promise<void> {
  const { owner, repo } = getRepoOwnerAndName();
  const client = getOctokit();

  await client.pulls.merge({
    owner,
    repo,
    pull_number: prNumber,
    merge_method: 'squash',
  });
}
