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
2. **Write tests for your code** (see Testing section below)
3. Run tests to verify everything works
4. Make small, logical commits
5. Push to `{{BRANCH_NAME}}`
6. Create PR and update labels

### On Completion
```
git push -u origin {{BRANCH_NAME}}

"C:\Program Files\GitHub CLI\gh.exe" pr create --title "feat: {{ISSUE_TITLE}}" --body "Implements #{{ISSUE_NUMBER}}"

"C:\Program Files\GitHub CLI\gh.exe" issue edit {{ISSUE_NUMBER}} --remove-label "in-progress" --add-label "pr-ready"

git checkout master
```

## Testing Requirements
**Every feature must include tests.** This is not optional.

### What to Test
- New API endpoints: test success cases, error cases, auth requirements
- New UI components: test rendering and key interactions
- Business logic: test core functionality and edge cases
- Database changes: test queries return expected results

### How to Test
- Run `npm test` from the project root
- Backend tests go in `server/src/**/*.test.ts`
- Frontend tests go in `client/src/**/*.test.ts` or `client/src/**/*.test.tsx`
- Use Vitest (already configured)

### Test Before Committing
```
npm test
```
If tests fail, fix them before pushing. Don't push broken tests.

## Rules
- Be concise
- Follow the plan exactly
- Don't add extra features
- Don't ask clarifying questions
- **Always write tests for new code**

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

## Common Mistakes
**Learn from past PR reviews.** The PR reviewer agent has identified these recurring patterns. Avoid them.

**Pattern:** React hooks placed after early returns
**Prevention:** ALL hooks (useState, useEffect, useCallback, useMemo, useRef, etc.) must be declared at the top of the component, BEFORE any conditional returns. React requires hooks to be called in the same order on every render.
**Example:**
```tsx
// WRONG - hooks after early return
function Component() {
  if (loading) return <Spinner />;
  const [value, setValue] = useState(''); // ❌ Violates Rules of Hooks
  ...
}

// CORRECT - all hooks at the top
function Component() {
  const [value, setValue] = useState(''); // ✅ Before any returns
  if (loading) return <Spinner />;
  ...
}
```
