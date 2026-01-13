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

### Steps
1. [step]
2. [step]

### Files
- `path/file.ts` - [change]

### Complexity
[S/M/L] - [brief reason]
```

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
