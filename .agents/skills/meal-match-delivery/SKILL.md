---
name: meal-match-delivery
description: Check readiness, prepare, run, or resume a scoped MealMatch delivery batch using the project's aggressive cost policy and verification/merge gates. Use for MealMatch delivery or named delivery batches. Capturing an idea alone does not start execution.
---

# MealMatch delivery

## Active ship mode — 2026-10-15, MM-D012

Zach explicitly rejected the prepare/approve/setup staircase and requested set-and-forget delivery: build the family app, make reasonable reversible choices, test/review, ship, and let him try it and give feedback. For a clear autonomous build request, treat ordinary scoping, isolated implementation, scoped commits/PRs/merges into the existing repository and normal release work as authorized. Use one concrete working brief rather than requiring a named batch or another approval prompt. Keep the existing-plan economy policy and real tests/privacy/data-preservation rules. Ask only for a material product decision or genuinely unavailable access, destructive action, or new spending.

The proposed delivery helper, new branch protection, and mandatory infrastructure pilot are NOT prerequisites. Use native Git/PR tools and obey any actual configured repository checks; inspect the current candidate and base, verify/review the code, merge normally and verify the result. No bypass flags or force-pushes. A local preview is a valid feedback artifact; claim deployment only with evidence. Earlier prepare-only records describe those earlier requests, not a veto on later explicit build instructions. This section supersedes conflicting proposed setup gates below.

Use this entry point for `$meal-match-delivery` and “MealMatch delivery.” It loads a workflow, not a daemon or an automatic authorization to publish.

## Load and acknowledge

Read `AGENTS.md`, `brain/README.md`, `brain/STATE.md`, and [model routing](../meal-match-chief-of-staff/references/model-routing.md). Preserve the dirty checkout and canonical memory owner. Read only the relevant parts of [the delivery plan](../../../docs/autonomous-delivery-plan.md), named idea/brief, and existing batch record. Use the installed idea-review skill for authorized implementation, without repeating menus or permissions already resolved.

Start with a receipt: `MealMatch delivery loaded | mode=... | scope/batch=... | existing-plan/economy | budget=... | checking/ready/blocked`. State the verified repository/default branch and worktree when available. A receipt proves loading, not readiness or successful execution. Never claim the skill changed the main chat's model.

## Select the mode

- **check** / readiness / status: read-only investigation. No edits (including notes), full app test run, installs, worktrees, or publishing. A bare invocation continues an already authorized active delivery scope; if there is none, check readiness.
- **prepare**: save a concrete batch proposal with milestones, acceptance/failure cases, dependencies, exclusions, repo/branch, budget, delivery authority requested, deployment implications, and next invocation. This does not authorize product code or publishing.
- **run**: carry a clear authorized build through completion. Save a compact working scope if necessary; a formal batch name is optional. Reuse the user's existing authorization and reasonable reversible defaults.
- **resume**: inspect actual processes, Git/PR/merge state and remaining budget, then continue the existing batch's authorization without duplicating completed actions. A status request is not resume.

## Check readiness with evidence

Use bounded read-only commands; inspect errors and outputs. An inaccessible service is unknown, not ready. Sandbox-only GitHub failures do not establish invalid credentials; use normal approved access without exposing tokens.

Verify:

1. Actual repository/default branch, current branch/status, and isolation from other writers. Previously observed default was master; recheck it.
2. Include the approved hardening and required local dependencies in the delivered candidate. Preserve unrelated work.
3. Verify GitHub access and obey actual configured checks/protections. Do not require new branch protection or CI infrastructure before shipping a locally verified candidate.
4. Use native Git/PR tools to inspect the candidate, review/test its final tree, and match the reviewed PR head at merge. No custom delivery helper is required.
5. Exact batch/milestones, acceptance criteria, ordering, publish/merge authority, budget, and Railway merge/deploy implications. Reuse prior permission; don't infer an approved batch from ungroomed ideas.
6. Relevant tools, installed locked dependencies, Chromium, local-server permissions and model availability. Readiness does not require reinstalling/rerunning every app check; the actual candidate still requires full verification.

Finish with `READY` only if the requested operation's prerequisites have evidence; otherwise `BLOCKED` with specific missing items and next actions. “Readiness check completed” is distinct from “delivery ready.” Check mode writes nothing. Prepare can finish with execution prerequisites still blocked.

## Prepare, execute, and recover

Keep `Ideas.md` as the only queue. Save a compact working brief under `brain/briefs/`; do not allocate a new idea for each milestone. Record delivery authority from the actual request and investigate the existing release path. Existing-plan economy is already decided. Respect explicit user limits and bounded worker attempts; proposed historic time/milestone ceilings are not automatic stop gates for a newly authorized build.

For run/resume, follow the delivery plan: scope → implement → integrated candidate → full verification and independent review concurrently → current PR checks → merge → verify actual default-branch result → next approved milestone. Use the routing reference's lowest-suitable-model policy and total attempt/turn limits, including follow-ups. For independent slices, apply the [parallel delivery procedure](../../../docs/parallel-delivery.md): at most two builders with exact ownership in separate worktrees, one coordinator integrating, and review only after the candidate freezes. Keep coupled work with one writer. No nested agents, automatic scouts, paid API fallback, or credit purchases. Use scripts for repeated test/status work.

Bind review and tests to the final candidate/integration tree; recheck base/head before merging and refresh affected evidence after changes. Use the CLI head-match option and obey required checks. No admin bypass or default-branch force push. Verify the actual merged state before advancing. If production access is missing, provide a working local preview and explain the exact remaining access requirement without hiding completed delivery.

Checkpoint through the Chief of Staff ownership rules after meaningful writes. Recover actual Git/PR/process state before retrying an interrupted action. Preserve unfinished work, and report implemented/tested/published/merged/deployed separately. If the delivery infrastructure is missing, report the scoped setup work; do not silently build or publish it under check/prepare.

## Invocation examples

- `$meal-match-delivery check readiness. Do not change anything.`
- `$meal-match-delivery prepare a pilot batch for MM-I002. Do not publish.`
- `$meal-match-delivery run batch dashboard-pilot. Commit, push, open PRs, and merge passing changes into the verified default branch within its recorded budget and deployment scope.`
- `$meal-match-delivery resume batch dashboard-pilot under its existing authorization.`

Examples do not authorize their actions. If discovery has not refreshed, explicitly read this file by path; don't claim picker discovery without checking. Skill creation does not prove a working autonomous merge loop.
