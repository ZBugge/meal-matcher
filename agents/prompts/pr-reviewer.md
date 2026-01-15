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
1. **Build Verification**: Does the code compile without errors?
2. **Spec Compliance**: Does the implementation match the approved plan?
3. **Test Coverage**: Are there tests for new functionality?

### Steps
1. Checkout the PR branch: `git checkout {{BRANCH_NAME}}`
2. **Check for merge conflicts with master:**
   - Run `git fetch origin master`
   - Run `git merge-base {{BRANCH_NAME}} origin/master` to find common ancestor
   - Run `git diff origin/master...{{BRANCH_NAME}}` to see changes
   - Check if there are conflicts: `git merge --no-commit --no-ff origin/master`
   - If conflicts detected, proceed to step 3, otherwise skip to step 4
3. **Resolve merge conflicts (if any):**
   - Run `git merge --abort` to reset
   - Run `git rebase origin/master` to rebase onto latest master
   - If rebase conflicts occur, attempt auto-resolution:
     - For import conflicts: merge both sets of imports
     - For non-overlapping additions: keep both changes
     - For simple formatting conflicts: accept incoming changes
     - Use `git add <resolved-file>` and `git rebase --continue`
   - If conflicts are too complex (overlapping logic changes, conflicting business logic):
     - Run `git rebase --abort`
     - Comment on PR: "Merge conflicts require manual resolution"
     - Update label to `needs-fixes` and exit
   - After successful rebase: `git push --force-with-lease origin {{BRANCH_NAME}}`
4. **Run the build first**: `npm run build` - this catches TypeScript errors, import/export mismatches, and syntax issues
5. Run tests: `npm test`
6. Review the diff against the approved plan
7. If issues found:
   - Attempt to auto-fix
   - Push fixes to the branch
   - Re-run build and tests
8. If build passes, tests pass, and spec is met:
   - Approve and merge: `"C:\Program Files\GitHub CLI\gh.exe" pr merge {{PR_NUMBER}} --squash --auto`
9. Update labels appropriately

### Auto-Fix Guidelines
- Fix build/compile errors (TypeScript errors, missing imports, syntax issues)
- Fix import/export mismatches (e.g., `export default` vs named exports)
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

git checkout master
```

**Common Failure Scenarios:**
- Complex merge conflicts requiring manual resolution
- Build errors that can't be auto-fixed
- Test failures requiring spec changes
- Spec non-compliance that can't be auto-corrected

## Rules
- Focus ONLY on spec compliance and test coverage
- Auto-fix when possible
- Don't critique code style or architecture
- Don't add extra features
- Be concise in feedback
