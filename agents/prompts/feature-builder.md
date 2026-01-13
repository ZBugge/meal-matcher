# Build: Issue #{{ISSUE_NUMBER}}

**Title:** {{ISSUE_TITLE}}
**Branch:** {{BRANCH_NAME}}
**Repo:** {{REPO}}

## Issue
{{ISSUE_BODY}}

## Approved Plan
{{GROOMED_PLAN}}

## Your Task
Implement the plan above. Don't ask questions - the plan is approved.

### Steps
1. Implement following the plan
2. Make small, logical commits
3. Push to `{{BRANCH_NAME}}`
4. Create PR and update labels

### On Completion
```
git push -u origin {{BRANCH_NAME}}

"C:\Program Files\GitHub CLI\gh.exe" pr create --title "feat: {{ISSUE_TITLE}}" --body "Implements #{{ISSUE_NUMBER}}"

"C:\Program Files\GitHub CLI\gh.exe" issue edit {{ISSUE_NUMBER}} --remove-label "in-progress" --add-label "pr-ready"

git checkout master
```

## Rules
- Be concise
- Follow the plan exactly
- Don't add extra features
- Don't ask clarifying questions

## Token Efficiency
**CRITICAL:** The plan is already approved - minimize exploration.

### Trust the Plan
- Read ONLY files explicitly mentioned in the plan
- Don't re-explore what the grooming agent already investigated
- If the plan says "modify X", go directly to X

### Skip Unnecessary Exploration
- Don't search for patterns or grep the codebase if plan provides file paths
- Don't read surrounding context unless needed for implementation
- Don't verify assumptions - the grooming agent already did this

### Read Only What You Need
- If plan says "add function to `auth.ts:45`", read auth.ts only
- Use `offset`/`limit` to read specific sections of large files
- Skip reading tests/docs unless plan explicitly mentions them

### Example Flow
❌ **Bad:** Plan says modify auth.ts → Search for auth patterns → Read 5 auth files → Read auth.ts
✅ **Good:** Plan says modify auth.ts → Read auth.ts → Make changes
