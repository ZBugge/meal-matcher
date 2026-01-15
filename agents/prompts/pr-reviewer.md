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
2. **Run the build first**: `npm run build` - this catches TypeScript errors, import/export mismatches, and syntax issues
3. Run tests: `npm test`
4. Review the diff against the approved plan
5. If issues found:
   - Attempt to auto-fix
   - Push fixes to the branch
   - Re-run build and tests
6. If build passes, tests pass, and spec is met:
   - Approve and merge: `"C:\Program Files\GitHub CLI\gh.exe" pr merge {{PR_NUMBER}} --squash --auto`
7. Update labels appropriately

### Auto-Fix Guidelines
- Fix build/compile errors (TypeScript errors, missing imports, syntax issues)
- Fix import/export mismatches (e.g., `export default` vs named exports)
- Fix missing tests
- Fix test failures
- Fix obvious spec compliance issues
- Don't add features beyond the plan
- Don't refactor working code

### Commenting on Auto-Fixes
**IMPORTANT:** When you make auto-fixes, you MUST document them with PR review comments.

For each auto-fix:
1. **Post an inline PR review comment** using `gh pr review` with the file and line number
2. **Explain what was wrong** and what you fixed
3. **Track all fixes** throughout the review process

Comment format:
```
gh pr review {{PR_NUMBER}} --comment --body "**Auto-fix applied:** [brief description]

**Issue:** [what was wrong]
**Fix:** [what you changed]
**File:** [file_path:line_number]
```

Examples:
- "**Auto-fix applied:** Fixed TypeScript error\n\n**Issue:** Property 'id' does not exist on type 'Meal | undefined'\n**Fix:** Added optional chaining: `meal?.id`\n**File:** client/src/pages/Dashboard.tsx:45"
- "**Auto-fix applied:** Fixed missing import\n\n**Issue:** 'Button' is used but not imported\n**Fix:** Added `import { Button } from '../components/Button'`\n**File:** client/src/pages/Settings.tsx:3"

### Learning Capture
After completing the PR review, analyze the fixes you made:

1. **Categorize the issues:**
   - One-off mistakes (specific to this PR)
   - Recurring patterns (seen multiple times or in multiple PRs)

2. **For recurring patterns, persist learnings:**
   - Update `CLAUDE.md` if the pattern is a general codebase rule
   - Update `agents/prompts/feature-builder.md` in the "Common Mistakes" section if it's an agent-specific issue

3. **Format for learnings:**
```
**Pattern:** [describe the recurring mistake]
**Prevention:** [how to avoid it in the future]
**Example:** [code example of correct approach]
```

4. **When to add learnings:**
   - Same type of error appears 2+ times in this PR
   - Same type of error has appeared in previous PRs
   - Error relates to project-specific patterns (SQLite booleans, export conventions, etc.)

5. **Commit learnings:**
   - Make a separate commit for documentation updates
   - Use commit message: "docs: Add learning from PR review - [brief description]"

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
