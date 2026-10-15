# Delivery setup — prepared batch

2026-10-15, America/New_York. Batch ID: `delivery-setup`. Related queue item: MM-I009. **Proposal saved; execution is not authorized.**

## Short answer

Establish a committed hardening baseline, deterministic CI, and tested delivery guards before enabling the [dashboard pilot](dashboard-pilot.md). Preparation changes documentation only. No product code, helper implementation, commits, pushes, PRs, merges, protection changes, or deployment are authorized by the current request.

## Repository and evidence

- Canonical memory owner: this coordinator in `C:/Users/ZachBugge/food-app`, branch `codex/chief-of-staff`. Preserve all existing tracked/untracked changes. The `codex/fast-verification` worktree also exists; no worker is assigned there by this proposal. Before execution, check actual processes/other writers and acquire an exclusive delivery lock; a worktree list does not prove isolation.
- Repository: `https://github.com/ZBugge/meal-matcher`. Read-only GitHub calls today confirm default `master`, remote head `38f198ba28b4349d81dfac461c4d4e07a6cb5a8f`, matching local HEAD/master/origin/master. GitHub access works outside the sandbox; account has ADMIN permission, but bypass is prohibited.
- Zero workflows, rulesets, and open PRs; `master` is unprotected (classic protection returns 404). No required check context exists yet. Scripts contain verification tooling but no delivery helper with the guards below.
- Hardening and verification work is local and uncommitted. The previous canonical run passed in 56.53 seconds; `.verification/latest.json` still points at that run. This historical result is not evidence for a future committed candidate.
- Node 22.14.0, npm 10.9.2, GitHub CLI 2.83.2, and root/client/server dependency directories are present. Locked-install consistency is not proven by directory presence. Chromium's sandbox-resolved executable is absent; real user browser availability/local-server permission must be checked in the normal approved execution context. No installation or full app verification was performed during preparation.
- `railway.json` specifies build/start/restart settings; automatic deployment on merge and the connected service/branch remain unknown. No Railway configuration was changed.

## Authority and budget

Current authority: prepare and save these proposals/checkpoints only, with **no publishing**. Future local setup would require explicit implementation authority, scoped local commits, and isolated worktrees. Hosted CI validation requires separately authorized push/PR actions. Enforced protection requires explicit repository-settings authority. Merge/deployment authority is absent and must be recorded before either happens.

Proposed setup ceiling: two milestones or 45 minutes of active work, whichever comes first, then checkpoint incomplete work. Do not count an unpublished milestone as merged or continue into the pilot on leftover setup time. Use existing Codex allowance only, Standard speed, no API fallback, credits, paid services, scheduler, or new production dependencies. Follow [model routing](../../.agents/skills/meal-match-chief-of-staff/references/model-routing.md): one writer; Sol medium ordinary work, Sol high for consequential merge enforcement/review; maximum three implementation attempts and five delegated turns per milestone, including repairs/rechecks. One independent review plus one consolidated recheck. Stop on exhausted limits; record total coordinator/worker effort and available usage, otherwise mark usage unavailable.

## Ordered milestones

### S1 — Reproducible trusted baseline and CI candidate

Scope: inventory and preserve the dirty canonical tree; separate existing hardening/verification from coordination documentation through reviewed scoped changes. After local commit authority is granted, use `codex/delivery-baseline` for the scoped baseline; preserve notes in an appropriate separate documentation change. Do not stage the entire dirty checkout blindly. Add a proposed `.github/workflows/verify.yml`, with a stable job context such as `MealMatch verification` (the actual hosted context must be observed before configuring protection).

Acceptance:

- A clean isolated checkout includes the authorized hardening, meaningful tests, verification scripts/configuration, and all required lockfiles; no dependency on untracked canonical files or the other worktree.
- Workflow installs via `npm ci` at root/client/server, installs Chromium, runs `npm run verify`, and runs the brain validator/tests when coordination tooling changes. Upload diagnostic reports on failure without secrets or production data. No model key or legacy orchestrator migration.
- Full candidate verification passes every gate below 120 seconds, including production smoke and adversarial mutations. Missing/skipped/flaky gates fail; original persistent data and tracked test output stay unchanged. Setup/download time is separate.
- Independent exact-candidate review passes. Once publishing is authorized, a fresh hosted run proves the actual job context and performance before it is required. A local workflow file alone cannot satisfy this acceptance condition.

Failure/recovery: missing baseline files, stale local reports, inconsistent locked installs, failed CI, or hosted runtime over budget block advancement. Preserve artifacts and diagnose within the attempt budget; do not remove tests, weaken the timer, reinstall repeatedly, or publish without authority. Without publishing authority this milestone can reach only local-candidate status.

### S2 — Fail-closed delivery helper and protected path

Dependency: S1's committed baseline; actual hosted success/protection and deployment resolution are required before enabling merge. Proposed worktree/branch: `codex/delivery-guards`. Use a small dependency-free helper under `scripts/`, with ignored runtime state under `.verification/`, separate from the existing verification lock.

Acceptance:

- Exclusive active-run lock identifies batch/worktree/owner process. Restart checks process identity/liveness and actual Git/GitHub state; neither stale lock age nor a note alone permits takeover.
- Persist base SHA B, head H, candidate and tested integration tree T, clean-worktree checks before/after verification, exact report identity/results, reviewer binding, PR/check contexts, phase, attempts, delegated turns, and elapsed active budget. Changes invalidate affected evidence. A plain reviewer summary or old green report cannot unlock merge.
- Enforce limits across restart/follow-ups, bounded CI waits, and no second active milestone/writer. Reject absent authorization, dirty candidate, missing/failed/skipped checks, stale review, stale head, changed base, duplicate run, and exhausted budget before mutation.
- Require a current integration candidate with remote required checks; immediately re-read B/H/protection/checks, then use head-matching merge plus strict current-base enforcement. No admin bypass/force push. If B/H changes, stop and refresh verification/review.
- After explicit settings authority, require the observed CI context on `master`, strict current-base checks and enforcement for the delivery account. A second agent on the same account is independent code review, not a distinct human GitHub approval.
- Resolve Railway's real merge/deploy connection before merge authorization: explicitly accept the deployment side effect or authorize decoupling it. Unknown behavior blocks merge.
- Mock/local-fixture tests cover the failures above, timeout, crash/stale-lock recovery, replayed evidence, and ambiguous merge response. Reconcile a possibly completed merge through GitHub before retrying. Verify actual merged state/content and full verification on the resulting default branch before another milestone.

This helper is proposed, not implemented. Fixture success does not demonstrate a protected real merge. S2 completes operationally only after authorized hosted/protection evidence; the first end-to-end proof belongs to the pilot.

## Exclusions and stop conditions

No dashboard changes in setup, family planning/shopping/PWA features, legacy orchestrator redesign, account/billing changes, secrets, production databases, default-branch rewriting, or recurring automation. No parallel shared-memory writers. Stop on failed gates, unverifiable remote state, unknown deployment scope, exhausted limits, or missing authority; checkpoint the exact phase without treating it as success.

## Next invocation

For a local-only implementation stage, explicitly authorize: `Use $meal-match-delivery to implement the local delivery-setup candidates within the recorded budget. Local scoped commits and isolated worktrees are allowed. Do not push, open PRs, merge, change repository settings, or deploy. Stop before hosted-only gates.`

This is proposed wording, not permission already granted. Standard run/merge readiness remains BLOCKED until prerequisites are evidenced. Hosted validation/protection needs a later explicit external-action scope. Recheck readiness before running [dashboard-pilot](dashboard-pilot.md).
