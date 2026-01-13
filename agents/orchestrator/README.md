# Agent Orchestrator

A Node.js service that implements GitHub issues using a **two-phase workflow**: interactive grooming followed by parallel autonomous building.

## Two-Phase Workflow

```
needs-grooming → grooming → awaiting-approval → ready → in-progress → pr-ready
      │              │              │              │           │
   (new idea)   (AI asks Qs)   (user reviews)  (approved)  (building)
```

### Phase 1: Grooming (Interactive, Single)
- Issues with `needs-grooming` label are picked up one at a time
- Agent asks clarifying questions to understand requirements
- Produces a detailed implementation plan
- Posts plan as a comment, changes label to `awaiting-approval`

### Phase 2: Building (Parallel, Autonomous)
- Issues with `ready` label are picked up (multiple in parallel)
- Agent implements following the approved plan
- Creates PR when complete, changes label to `pr-ready`

## Label Reference

| Label | Who Sets It | Meaning |
|-------|-------------|---------|
| `needs-grooming` | You (manually) | New idea, needs clarification |
| `grooming` | Orchestrator | Agent is asking questions |
| `awaiting-approval` | Agent | Plan posted, waiting for review |
| `ready` | You (manually) | Plan approved, start building |
| `in-progress` | Orchestrator | Agent is implementing |
| `pr-ready` | Agent | PR created, ready for review |
| `agent-failed` | Orchestrator | Something went wrong |

## Quick Start

1. **Create an issue** with a feature idea
2. **Add `needs-grooming` label**
3. **Run the orchestrator:**
   ```bash
   cd agents/orchestrator
   npm run dev
   ```
4. **Copy/paste the prompt** from Notepad into Claude terminal
5. **Answer questions** in the grooming session
6. **Review the plan** posted as a comment
7. **Approve:** Change label to `ready` (or tell agent "mark it ready" during grooming)
8. **Wait for PR** to be created

## Prerequisites

- Node.js 18+
- Claude Code CLI installed and authenticated (`npm install -g @anthropic-ai/claude-code`)
- GitHub CLI installed (`winget install GitHub.cli`)
- GitHub Personal Access Token with `repo`, `read:org`, `workflow` scopes

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
   # GitHub Personal Access Token with 'repo', 'read:org', 'workflow' scopes
   GITHUB_TOKEN=ghp_your_token_here
   GH_TOKEN=ghp_your_token_here

   # Repository in format: owner/repo
   GITHUB_REPO=your-username/your-repo

   # Labels (defaults shown)
   GROOMING_LABEL=needs-grooming
   ISSUE_LABEL=ready
   ```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start orchestrator (dev mode with auto-reload) |
| `npm run status` | Show tracked issues by phase |
| `npm run retry <issue#>` | Reset and retry a specific issue |
| `npm run reset` | Clear all tracked issues |
| `npm start -- --help` | Show help with workflow details |

## Usage

**Development mode:**
```bash
npm run dev
```

**Check status:**
```bash
npm run status
```

Shows all issues grouped by phase (grooming, awaiting approval, building, PR created).

**Retry an issue:**
```bash
npm run retry 5
```

Resets the issue back to `needs-grooming` and clears any local branch.

**Reset everything:**
```bash
npm run reset
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator                              │
│                                                              │
│  1. Polls GitHub for issues                                  │
│  2. Phase 1: Groom one issue at a time (interactive)         │
│  3. Phase 2: Build ready issues in parallel (autonomous)     │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ Claude  │   │ Claude  │   │ Claude  │
   │ Groom   │   │ Build   │   │ Build   │
   │ (1 max) │   │ Agent   │   │ Agent   │
   └─────────┘   └─────────┘   └─────────┘
```

When the orchestrator picks up an issue, it:
1. Opens **Notepad** with the prompt
2. Opens a **Claude terminal** ready for paste
3. You copy from Notepad (Ctrl+A, Ctrl+C) and paste into Claude (Ctrl+V)

This approach allows:
- Interactive sessions (you can answer agent questions)
- Parallel work (multiple terminal windows)
- Full prompt visibility (no command-line length limits)

## Approving Plans

After grooming, the agent posts a plan as an issue comment. You have two options:

**Option A: During grooming session**
Tell the agent: "I approve this plan, mark it ready"

**Option B: After grooming**
1. Review the plan comment on GitHub
2. Change the label from `awaiting-approval` to `ready`

## Configuration

Edit `src/config.ts` to customize:

| Setting | Default | Description |
|---------|---------|-------------|
| `pollIntervalMs` | 60000 | How often to check for new issues (ms) |
| `maxParallelAgents` | 1 | Maximum concurrent building agents |

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

prompts/
├── grooming.md            # Prompt for grooming sessions
└── feature-builder.md     # Prompt for building sessions
```

## Troubleshooting

**GitHub CLI keyring error on Windows**
Use the `GH_TOKEN` environment variable (set in `.env`) to bypass keyring issues.

**Agent can't use gh command**
Make sure `GH_TOKEN` is in your `.env` file. The batch files pass it to spawned sessions.

**Issues not being picked up**
- For grooming: Add `needs-grooming` label
- For building: Add `ready` label
- Check that the issue is open (not closed)

**Agent keeps failing**
- Check the error comment on the GitHub issue
- Ensure Claude Code CLI is working: `claude --version`
- Run `npm run retry <issue#>` to start fresh
