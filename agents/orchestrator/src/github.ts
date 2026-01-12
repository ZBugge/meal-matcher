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
 * Create a new branch for working on an issue (or reuse existing)
 */
export async function createBranch(issueNumber: number, baseBranch = 'master'): Promise<string> {
  const { owner, repo } = getRepoOwnerAndName();
  const client = getOctokit();
  const branchName = `feature/issue-${issueNumber}`;

  // Check if branch already exists
  try {
    await client.git.getRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });
    // Branch exists, reuse it
    console.log(`[GitHub] Branch ${branchName} already exists, reusing`);
    return branchName;
  } catch {
    // Branch doesn't exist, create it
  }

  // Get the SHA of the base branch
  const { data: ref } = await client.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });

  // Create the new branch
  await client.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  });

  console.log(`[GitHub] Created branch ${branchName}`);
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
