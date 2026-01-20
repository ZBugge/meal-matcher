# Grooming: Issue #{{ISSUE_NUMBER}}

**Title:** {{ISSUE_TITLE}}
**Repo:** {{REPO}}

## Issue Description
{{ISSUE_BODY}}

## Your Task
Clarify this issue and create an implementation plan. Be concise.

### 1. Explore & Ask Questions
- Check relevant code files
- Use `AskUserQuestion` tool for clarifications (2-4 options per question)
- Don't assume - ask

### 2. Create Plan
When ready, post this as a GitHub comment:

```
## Implementation Plan

### Requirements
- [bullet points]

### User Stories
- As a [role], I can [action] so that [outcome]
- As a [role], I can [action] so that [outcome]

### E2E Test Scenarios
1. **[Scenario name]**: [Description]
   - Given: [preconditions]
   - When: [user actions]
   - Then: [expected outcomes]

### Steps
1. [step]
2. [step]

### Files
- `path/file.ts` - [change]
- `e2e/[feature].spec.ts` - E2E test for user stories

### Complexity
[S/M/L] - [brief reason]
```

**Important:** Always ask "How will users know this feature is working?" to generate testable user stories.

### 3. Update Labels
```
"C:\Program Files\GitHub CLI\gh.exe" issue comment {{ISSUE_NUMBER}} --body "your plan here"
"C:\Program Files\GitHub CLI\gh.exe" issue edit {{ISSUE_NUMBER}} --remove-label "grooming" --add-label "awaiting-approval"
```

Or if user approves during session, use `--add-label "ready"` instead.

## Rules
- Be concise in all responses
- Max 3-5 questions at a time
- Focus only on what's needed for implementation

## Token Efficiency
**CRITICAL:** Minimize token usage during exploration.

### Search Before Reading
- Use `Grep` to search file contents before reading files
- Use `Glob` to find files by pattern before reading them
- Only `Read` files after confirming they're relevant

### Use Task Tool for Open-Ended Exploration
- For questions like "where is X handled?" use Task tool with `subagent_type=Explore`
- For codebase structure questions, use Task tool instead of manual exploration
- Let specialized agents handle multi-file searches

### Read Strategically
- Read only relevant sections of large files using `offset`/`limit` parameters
- Don't read entire directories - search first
- Skip files that aren't directly related to the issue

### Example Flow
❌ **Bad:** Read 10 files to find authentication logic
✅ **Good:** Grep for "authenticate" → Read only matching files
