# Agent Orchestrator

A Node.js service that automatically implements GitHub issues by spawning Claude Code instances.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator (this service)               │
│                                                              │
│  1. Polls GitHub for issues labeled "ready"                  │
│  2. Creates a feature branch for each issue                  │
│  3. Spawns Claude Code to implement the feature              │
│  4. Creates a PR when the agent completes                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ Claude  │   │ Claude  │   │ Claude  │
   │  Code   │   │  Code   │   │  Code   │
   │ Agent 1 │   │ Agent 2 │   │ Agent 3 │
   └─────────┘   └─────────┘   └─────────┘
```

## Prerequisites

- Node.js 18+
- Claude Code CLI installed and authenticated (`npm install -g @anthropic-ai/claude-code`)
- GitHub Personal Access Token with `repo` scope

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` with your settings:**
   ```env
   # GitHub Personal Access Token with 'repo' scope
   GITHUB_TOKEN=ghp_your_token_here

   # Repository in format: owner/repo
   GITHUB_REPO=your-username/your-repo

   # Label that triggers agent work (default: ready)
   ISSUE_LABEL=ready
   ```

## Usage

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

**Check status of tracked issues:**
```bash
npm run status
```

Shows all issues currently being tracked, their state, and whether they have unpushed commits or local changes.

**Retry a specific issue:**
```bash
npm run retry 2
```

Resets a specific issue and spawns a fresh agent. This will:
1. Check for unpushed commits (gives you 5 seconds to cancel if found)
2. Reset the branch to master (discards any local work)
3. Reset GitHub labels (removes `in-progress`, adds `ready`)
4. Spawn a new agent in a visible terminal window

**Reset all state:**
```bash
npm run reset
```

Clears all tracked issues and resets their GitHub labels. Use when:
- Starting fresh after testing
- An agent failed and you want to retry all issues
- You want to re-process issues that were already claimed

## Handling Interruptions

If an agent gets interrupted (computer restart, out of tokens, crash):

1. Run `npm run status` to see what's tracked
2. Check if there are unpushed commits you want to keep
3. Run `npm run retry <issue#>` to start fresh with a new agent

The retry command will warn you if there's unpushed work and give you 5 seconds to cancel before discarding it. New agents start from scratch since they don't have context of what the previous agent was working on.

## Workflow

1. **Create a GitHub issue** describing a feature or bug fix
2. **Add the `ready` label** to the issue
3. **The orchestrator will:**
   - Remove the `ready` label
   - Add `in-progress` label
   - Create branch `feature/issue-{number}`
   - Comment on the issue that work has started
   - Spawn a Claude Code agent to implement the feature
4. **When the agent completes:**
   - A PR is created linking to the issue
   - The `pr-ready` label is added
   - A comment is posted with the PR link
5. **If the agent fails:**
   - The `agent-failed` label is added
   - Error details are posted as a comment
   - Re-add the `ready` label to retry

## Configuration

Edit `src/config.ts` to customize:

| Setting | Default | Description |
|---------|---------|-------------|
| `pollIntervalMs` | 60000 | How often to check for new issues (ms) |
| `maxParallelAgents` | 3 | Maximum concurrent Claude Code instances |

## Project Structure

```
orchestrator/
├── src/
│   ├── index.ts           # Main loop and orchestration logic
│   ├── config.ts          # Environment and settings
│   ├── github.ts          # GitHub API wrapper (Octokit)
│   ├── state.ts           # SQLite state tracking
│   ├── agent-manager.ts   # Claude Code process spawning
│   └── types/sql.js.d.ts  # Type declarations
├── package.json
├── tsconfig.json
└── .env.example
```

## State Tracking

The orchestrator uses SQLite (`../data/agents.db`) to track:

- **Issues:** Which issues are claimed, in-progress, or completed
- **Agents:** Running agent processes, their status, and output

This allows the orchestrator to:
- Avoid duplicate work on the same issue
- Resume tracking after restarts
- Retry failed issues

## Agent Prompts

Agent behavior is defined in `../prompts/feature-builder.md`. The prompt template receives:

- `{{ISSUE_NUMBER}}` - GitHub issue number
- `{{ISSUE_TITLE}}` - Issue title
- `{{ISSUE_BODY}}` - Full issue description
- `{{BRANCH_NAME}}` - Git branch to work on
- `{{REPO}}` - Repository in `owner/repo` format

## Troubleshooting

**"Configuration error: GITHUB_TOKEN environment variable is required"**
- Make sure you created `.env` from `.env.example`
- Verify your GitHub token is set correctly

**Agent keeps failing**
- Check the error comment on the GitHub issue
- Ensure Claude Code CLI is installed and working: `claude --version`
- Try running Claude Code manually to verify authentication

**Issues not being picked up**
- Verify the issue has the correct label (default: `ready`)
- Check that the issue is open (not closed)
- Ensure the GitHub token has access to the repository

## Adding New Agent Types

To add new agents (e.g., test writer, PR reviewer):

1. Create a new prompt in `../prompts/` (e.g., `test-writer.md`)
2. Add a new spawn function in `agent-manager.ts`
3. Integrate into the orchestration loop in `index.ts`
