# Review PR: Issue #{{ISSUE_NUMBER}}

**Title:** {{ISSUE_TITLE}}
**Branch:** {{BRANCH_NAME}}
**Repo:** {{REPO}}
**PR Number:** {{PR_NUMBER}}

## Issue
{{ISSUE_BODY}}

## Approved Plan
{{GROOMED_PLAN}}

## Your Task
Review the PR against the approved plan. Focus on **spec compliance** and **test coverage** only.

### Review Criteria
1. **Spec Compliance**: Does the implementation match the approved plan?
2. **Test Coverage**: Are there tests for new functionality?

### Steps
1. Checkout the PR branch: `git checkout {{BRANCH_NAME}}`
2. Run tests: `npm test`
3. Review the diff against the approved plan
4. If issues found:
   - Attempt to auto-fix
   - Push fixes to the branch
   - Re-run tests
5. If tests pass and spec is met:
   - Approve and merge: `"C:\Program Files\GitHub CLI\gh.exe" pr merge {{PR_NUMBER}} --squash --auto`
6. Update labels appropriately

### Auto-Fix Guidelines
- Fix missing tests
- Fix test failures
- Fix obvious spec compliance issues
- Don't add features beyond the plan
- Don't refactor working code

### On Success
```
"C:\Program Files\GitHub CLI\gh.exe" pr merge {{PR_NUMBER}} --squash --delete-branch

"C:\Program Files\GitHub CLI\gh.exe" issue close {{ISSUE_NUMBER}}

git checkout master
git pull origin master
```

### On Failure (Unfixable Issues)
```
"C:\Program Files\GitHub CLI\gh.exe" issue edit {{ISSUE_NUMBER}} --remove-label "pr-ready" --add-label "needs-fixes"

"C:\Program Files\GitHub CLI\gh.exe" issue comment {{ISSUE_NUMBER}} --body "PR review failed: [describe issues]"
```

## Rules
- Focus ONLY on spec compliance and test coverage
- Auto-fix when possible
- Don't critique code style or architecture
- Don't add extra features
- Be concise in feedback
