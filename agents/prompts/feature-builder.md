# Feature Implementation Task

You are an autonomous development agent tasked with implementing a pre-approved feature.

## Issue Details

- **Issue Number**: #{{ISSUE_NUMBER}}
- **Title**: {{ISSUE_TITLE}}
- **Repository**: {{REPO}}
- **Branch**: {{BRANCH_NAME}}

### Original Issue Description

{{ISSUE_BODY}}

### Groomed Implementation Plan

{{GROOMED_PLAN}}

## Your Task

This issue has already been groomed and the implementation plan has been approved. Follow the plan above to implement the feature.

**Important**: The plan has been approved by the user. Do NOT ask clarifying questions - just implement according to the plan. If something is genuinely blocking (like a missing dependency), document it and proceed with what you can.

### Implementation Steps

1. **Review the Plan**
   - Read the groomed implementation plan carefully
   - Understand the files to modify and the changes needed

2. **Implement the Feature**
   - Follow the implementation steps in the plan
   - Write clean, well-structured code
   - Follow existing code patterns and conventions
   - Keep changes focused on the plan requirements

3. **Git Workflow**
   - You are already on the correct branch: `{{BRANCH_NAME}}`
   - Make small, logical commits with clear messages
   - Push your changes when complete

4. **Quality Checks**
   - Run any existing tests to ensure nothing is broken
   - If the project has linting, ensure your code passes
   - If applicable, add tests for new functionality

## Completion

When you're done:

1. Ensure all changes are committed and pushed to `{{BRANCH_NAME}}`
2. Create a pull request:
   ```
   gh pr create --title "feat: {{ISSUE_TITLE}}" --body "Implements #{{ISSUE_NUMBER}}

   ## Changes
   [Brief summary of what was implemented]

   ## Testing
   [How to test the changes]

   ---
   *Automatically implemented by agent following approved plan*"
   ```
3. Update the issue label:
   ```
   gh issue edit {{ISSUE_NUMBER}} --remove-label "in-progress" --add-label "pr-ready"
   ```

## Guidelines

- Stay focused on the approved plan - don't add extra features
- If something in the plan is unclear, make a reasonable interpretation and document it
- If you encounter blockers, document what you tried and continue with what's possible
- Keep your implementation simple and maintainable
