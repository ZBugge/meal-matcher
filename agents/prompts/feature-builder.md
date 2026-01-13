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
