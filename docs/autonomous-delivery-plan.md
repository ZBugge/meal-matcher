# Cost-conscious autonomous MealMatch delivery

**Superseded delivery process, 2026-10-15 (MM-D012):** Zach requested direct set-and-forget feature shipping and rejected the setup/approval staircase. Keep the economical model choices and meaningful verification; use native Git/PR delivery, with no bespoke helper, new branch protection, or infrastructure pilot as a prerequisite. Build the recipe/plan/shopping/cooking loop, then connect voting and phone installation; hand over a usable app for feedback. Existing configured repository requirements still apply. The detailed proposal below is retained as background, not an active gate against shipping.

2026-10-15, America/New_York. Delivery-loop proposal; not enabled. Zach subsequently selected his existing Codex plan and aggressive savings (MM-D009). The model-routing/economy policy is active; publishing and the product queue remain a separate implementation stage.

## Recommendation

The concrete entry point is [MealMatch Delivery](../.agents/skills/meal-match-delivery/SKILL.md). Invoke it by name in the project chat:

- `Use $meal-match-delivery to check readiness. Do not change anything.`
- `Use $meal-match-delivery to prepare a pilot batch for MM-I002. Do not publish.`
- Once a concrete batch is authorized: `Use $meal-match-delivery to run batch dashboard-pilot under its recorded scope, budget, publishing and deployment authorization.`
- To recover interrupted work: `Use $meal-match-delivery to resume batch dashboard-pilot under its existing authorization.`

Each invocation begins with a receipt naming the loaded skill, mode, scope, cost policy, budget and readiness state. A bare invocation means read-only check. Select the skill from the app picker where available; if discovery has not refreshed, explicitly read `.agents/skills/meal-match-delivery/SKILL.md` and apply it. AGENTS.md also routes the exact name/phrase to that file. Explicit skill invocation is supported by [official OpenAI documentation](https://learn.chatgpt.com/docs/build-skills).

This makes invocation visible and reproducible. It does not make prompt compliance or a future merge certain: readiness must identify missing enforcement, and execution remains blocked until the baseline, CI/protection, delivery tooling, batch authority, and deployment scope have evidence. Creating this skill did not enable automatic merges.

Use the existing Codex plan, one delivery coordinator, one active feature, a cheap model for narrow work, and an independent reviewer. Approve a bounded batch of well-defined outcomes once; the coordinator then implements, verifies, opens PRs, merges passing changes into the actual default branch, and continues without asking at every step. Ask only for material product choices, scope changes, exhausted budgets, or access that is genuinely required.

The valuable unit is a verified, merged user outcome. More agents, lower token prices, and more generated code are not independently measures of savings. Do not build a new orchestration service before demonstrating this loop with native Codex capabilities.

## Verified starting state

- Repository: `https://github.com/ZBugge/meal-matcher`; GitHub reports default branch **master**, not main. Use its verified default, without renaming it.
- Approved read-only GitHub calls succeeded outside the Windows sandbox. Account access is working and viewer permission is ADMIN. The scout's initial sandbox authentication failure was an environment limitation, not proof of invalid credentials.
- GitHub reports zero workflows, zero repository rulesets, and classic branch protection returns “Branch not protected.” No open PRs were returned.
- Live default-branch head, local HEAD, local master, and origin/master all reported `38f198ba28b4349d81dfac461c4d4e07a6cb5a8f` during inspection. Recheck before implementation.
- Existing verification/bug fixes, coordination files, and notes are uncommitted in the canonical checkout. They are not available to a new feature branch created solely from origin/master.
- Latest completed local verification took 56.53 seconds for 81 server/110 client/24 browser tests, seven runner checks, lint, builds, production smoke, and six caught mutations. This is evidence for the current local tree, not yet a CI benchmark or remote commit.
- `railway.json` describes build/start commands; it does not establish whether a merge deploys the app. Resolve this before enabling autonomous merges.
- Installed Codex CLI reports `0.162.0-alpha.17.2`; GitHub CLI supports `--match-head-commit`. Native explicit-model subagent calls work. There is no need to migrate the separate Claude orchestrator in `agents/orchestrator/`.

## Operating contract

Ideas.md remains the only product queue. Saving an ungroomed idea does not make it executable. For each approved batch, record in Decisions the ordered idea IDs/milestones, acceptance criteria, routine choices the agent can make, publishing/merging authority for this repository/default branch, deployment implications, and budget/stopping rules. Keep implementation details in a linked brief. A broad idea can have several mergeable milestones; completing one does not remove the unfinished parent idea.

After that batch is authorized, ordinary commits, pushes, PR creation, fixes, merges, and advancement within it require no repeated conversational approval. Do not consume unrelated or ungroomed ideas automatically. Pause a dependent item if an unresolved decision would materially change its behavior; continue other approved independent work only if no shared failure or budget limit prevents it.

One coordinator owns integration and canonical memory. One feature worktree has one writer. A process lock prevents duplicate delivery runs. One active worker is the default; overlap read-only work only when it demonstrably reduces total effort within the budget. Skip speculative next-feature preparation and never parallelize dependent schema/client builds across branches.

## Models and division of work

| Role | Default | Assignment |
| --- | --- | --- |
| Delivery coordinator | GPT-6.1 Sol, medium | Select the next ready milestone, settle routine contracts, implement ordinary changes directly, verify evidence, merge, checkpoint. Select this model in the delivery chat; spawning cheap children does not change the main chat's model. |
| Scout / acceptance checklist | GPT-6 Luna, high | Read the small task brief and relevant files; return file/test map, concrete expected behaviors and failure cases, and unresolved facts. Optional when the coordinator already knows the scope. |
| Mechanical micro-builder | GPT-6 Luna, high | First choice for fully specified UI/documentation work in at most three files, excluding consequential contracts/state. One focused repair before a single Sol handoff. |
| Ordinary implementation worker | GPT-6.1 Sol, medium | Use only for a separable assignment that saves coordinator work. Do not pay two agents to investigate and implement the same feature. |
| Independent reviewer | GPT-6.1 Sol, medium; high when warranted | Review the exact candidate against requirements and test evidence. Use high for consequential sharing, data, recovery, or difficult cross-layer behavior. |
| Specialist | GPT-6.1 Sol, high; exceptional Astra high | Sol high first for difficult analysis. Use Astra only for a documented unresolved question or specific risk that justifies its cost. Never duplicate the whole implementation. |

Assignments specify model and effort, use `fork_turns: none`, include only the task, constraints, relevant paths, owned files/worktree, evidence required, and stopping condition. Workers do not spawn more workers. Return concise evidence rather than raw logs. A worker's self-description is not model telemetry; record the actual accepted spawn configuration.

Active economy policy: **Luna micro-builder** for fully specified mechanical UI/documentation changes, at most three files, without authorization, schema, API contract, persistent state/recovery, dependency, deployment, or merge-tooling changes. Example: move existing dashboard controls and add a state-only collapse control. It gets one focused repair, then at most one Sol handoff. Independent Sol review and full verification still apply. Measure total usage including repairs/review and adjust the lane if it costs more per accepted result. Meal-plan data models and shopping synchronization remain Sol work. The [routing reference](../.agents/skills/meal-match-chief-of-staff/references/model-routing.md) owns the detailed role policy.

## Cost controls

1. Existing Codex-plan authentication only, as explicitly selected by Zach. No automatic API fallback, credit purchase, provider change, or paid service creation. Reconsider only if Zach later changes this preference.
2. Use Standard speed by default. Higher speed is an explicit latency/cost tradeoff, not a prerequisite for autonomous work.
3. Small-task lane: initial implementation plus one focused repair; a failed Luna task gets one evidence-based Sol handoff. Maximum three implementation attempts across all models. Review once, with at most one consolidated recheck after fixes. Astra is exceptional, not an automatic extra pass. Environment/access failures get one diagnostic, not repeated builds.
4. Normal path: qualifying Luna builder plus Sol-medium reviewer, or direct coordinator implementation plus one reviewer. Skip redundant scouts and speculative preparation. Aim for two delegated turns; maximum five including repair, handoff, review/recheck, and any specialist assignment. This counts follow-ups as turns. One active worker beside the coordinator is the default; no child agents, duplicate implementations, separate test runners, or extra paperwork agents. Checkpoint unresolved work rather than exceeding the cap.
5. Proposed initial batch ceiling: two merged product milestones or 45 minutes of active work, whichever comes first. Checkpoint rather than starting another item. These are proposed operational limits, not claims that elapsed time or agent count strictly caps tokens or dollars.
6. Do not send the full chat/backlog/repository to every agent. Keep a short task brief and canonical checkpoint, search targeted files, and return report paths plus failure excerpts. Use scripts for status checks, diff collection, report validation, and bounded waiting. Run no LLM loop just to poll CI.
7. Run focused checks during edits, full verification on the final candidate, and again only after a meaningful change invalidates it. Required CI plus post-merge verification are intentional independent checks, not reasons to rerun the suite on every message. Keep the complete local suite below 120 seconds.
8. Keep one reusable installed workspace per active branch with locked dependencies and cached browser downloads. Fresh test databases/ports remain mandatory. Setup time is recorded separately; do not install packages on each test run.
9. For each milestone record selected models/effort, delegated turns, repairs, specialist reason, elapsed work/test time, review findings, and merge result. Record tokens/credits when exposed by the runtime; otherwise label them unavailable. Count parent-agent work and retries too. Calls/time are useful proxies, not exact cost accounting.
10. Evaluate the first two milestones before expanding the batch. Optimize observed cost per merged, accepted outcome; don't run competing implementations or repeated model comparisons simply to create a benchmark.

Official Standard credit rates currently list input/output prices for Sol at 20 times Luna and Astra at five times Sol for equal uncached input/output token counts. This is a rate comparison, not a promised task saving or a conversion of included subscription allowance. Context, reasoning, repairs, and caching affect actual usage. [Official pricing](https://learn.chatgpt.com/docs/pricing).

## Feature state machine

`ready → scoped → implementing → verified → reviewed → PR checks passing → merged → default verified → next`

1. **Ready:** recheck approved scope, dependencies, current Git/PR state, branch target, budget, active-run lock, and authorization. Establish a clean isolated worktree from the latest verified default. Preserve the dirty canonical checkout.
2. **Scoped:** write concrete acceptance and likely failure/recovery cases first. Trace API/schema/storage contracts. Use a specialist before implementation when the decision needs demanding analysis. Distinguish selecting meals from marking them cooked.
3. **Implementing:** one writer builds the coherent user slice and meaningful regression tests. Use existing stack/dependencies where practical. No unrelated refactor or “while here” work.
4. **Verified:** run targeted red/green evidence where practical, then `npm run verify`. Validate the fresh summary, all gates, no skips/flakes, unchanged unrelated data, and phone screenshots for UI changes. Relevant device-specific behavior requires the target-device check; Chromium phone size alone cannot prove Safari/PWA behavior.
5. **Reviewed:** review the exact final candidate and acceptance criteria independently. Fix material findings within the budget, rerun affected/full checks as warranted, and obtain the bounded recheck. The builder's summary is not the review input's source of truth.
6. **PR checks passing:** publish the authorized scoped branch/PR, with problem, resulting behavior, and verification evidence. Keep feature-specific backlog cleanup on that branch; preserve unfinished parent milestones. Apply required checks to the current candidate, not an earlier green commit.
7. **Merged:** coordinator alone requests merge through required checks. Verify remote PR state actually says merged; an auto-merge request is not completion. Never use an admin bypass or force-push the default branch.
8. **Default verified:** fetch/inspect the actual merge result, confirm its relation to the default branch, verify its content against the tested integration tree, and run full verification on that resulting default-branch state in an isolated integration checkout before advancing. On failure stop the queue; prepare a forward fix or reviewed revert as appropriate, without rewriting published history.
9. **Next:** reconcile only scoped outcomes into canonical notes/backlog, record PR/commit/test evidence, release the worktree only when clean and merged, then select the next ready approved milestone within the batch budget.

## Merge evidence and CI

Before enabling auto-merge, add one deterministic GitHub workflow that installs from all three application lockfiles, sets up Chromium, runs full verification, uploads current reports on failure, and checks relevant coordination files if changed. It needs no model/API key. Validate a fresh hosted run before requiring its status. Dependency/browser setup is outside the repeated verification timer. Preserve the 120-second local verification budget; diagnose hosted slowness rather than weakening checks.

Protect master with the verified workflow's required status and require the branch to be current with its base. Apply enforcement to the delivery account as well. Independent agent review is a coordinator requirement; another agent using the same GitHub account cannot provide a separate human account's PR approval. Do not configure a required human approval and then bypass it to make the loop work.

Record base SHA B, PR head H, reviewed diff/tree, tested integration tree T, required check results, and review result. Immediately before merge re-read remote B/H and review/check state. Use the installed CLI's `--match-head-commit H` safeguard, together with strict base-up-to-date checks. If either base or candidate changes, invalidate affected evidence and retest/review the new integration. The head-match flag alone does not protect against a changing base. A squash commit can have a different SHA with the same tested tree; compare content as well as commit relationships. Verify the actual merge result afterward.

Current `verify` reports do not bind themselves to a Git commit. A small delivery helper must record/check commit and tree IDs plus working-tree cleanliness around verification, so a pass from uncommitted or different code cannot authorize a merge. Bind reviewer results to the same candidate; notes/PR text changes that alter tracked content must be included before final evidence is collected.

## Checkpoint and recovery

Keep a small ignored runtime record under `.verification/` containing batch/idea milestone, phase, owned worktree, base/head/tree IDs, PR URL, test/review evidence, attempts, model usage if known, and exact next action. Canonical State links the active record; it does not duplicate the backlog. The PR is the permanent feature delivery record.

On restart, inspect actual processes, Git state, PR/check/merge state, and existing artifacts before acting. Do not create a duplicate PR or reapply a migration because a previous turn ended. A lock or note alone does not prove a worker is running. Reconcile an uncertain merge through GitHub before retrying it. Preserve incomplete work on usage limits, failed checks, or inaccessible services; do not spend further model turns reporting an unchanged blocker.

Operate under normal sandbox/approval rules. Existing Windows test permissions must be available for verification; a rejected or unavailable approval blocks the dependent action and is reported, not bypassed. No permission-bypass flags from the old Claude orchestrator are carried forward.

## Rollout and the product queue

The following order is a recommendation, not an approved promotion of Ideas.md entries:

| Stage | Scope and proof |
| --- | --- |
| 0: trusted baseline | Publish/merge the existing scoped verification/bug-fix work and preserve coordination notes in an appropriate separate change. Add/validate deterministic CI and merge protection. Confirm Railway's merge/deploy behavior and accept or decouple that side effect. Prove a clean checkout gets the same passing suite. |
| 1: small pilot, MM-I002 | Dashboard placement/collapse first, then search if separately scoped. Prove the entire loop, including exact-candidate review, required CI, merge, and post-merge verification. Use Luna on qualifying mechanical work and evaluate total usage, not its rate alone. |
| 2: MM-I004/MM-I006 | Saved multi-meal plans with optional dates; then ingredient-derived editable shopping list with needed/already-have/purchased states and manual extras; then direct cooking view. Each milestone has an actual end-to-end journey and saved-data/reopen checks. Preserve free-text amounts; do not add automatic unit conversion/scaling in this slice. |
| 3: MM-I006 | Recipe-focused home/navigation; shared family access/reliable login; couple swipes adding several agreed meals to the plan; installable phone PWA; takeout plan entries and existing category voting. Settle shared access before implementing cross-device edits; keep home/takeout voting pools consistent. Phone-only install/offline behavior needs device evidence. |
| 4: remaining ideas | Recurring weekly staples (MM-I007), side dishes (MM-I001), options added during voting (MM-I003), pictures (MM-I005), and grocery-order handoff. Refine before execution; mid-vote additions alter a core fixed-pool invariant, and ordering/image/offline integrations need their own explicit scope and expense choices. |

Small milestones must remain complete user outcomes; never split off UI shells or stub APIs merely to pass tests cheaply. A pilot does not authorize skipping the requested family loop. Continue through the approved milestones, checkpointing uncertain independent ideas for later refinement.

## Concrete implementation package after plan adoption

- Existing routing now includes the aggressive economy policy and bounded Luna micro-builder. When implementing the loop, add the approved batch contract and enforce the budgets in deterministic tooling; keep one home for each policy. Add a delivery skill only if it reduces repeated instructions.
- Add deterministic CI and required branch status after its first successful hosted run. Confirm merge/deployment policy.
- Add a small dependency-free delivery helper for the process lock, candidate/tree/evidence binding, budget accounting, bounded CI waits, merge preconditions, and restart reconciliation. Use native Codex agents for reasoning; no new agent service, model API, database, or legacy orchestrator migration.
- Test the helper's consequential failure paths with local fixtures/mocked GitHub responses: stale head, changed base, missing/failed/skipped verification, outdated review, dirty candidate, duplicate run, timeout, ambiguous merge/restart, and exhausted budget. Fail closed before any real merge.
- Pilot one small authorized PR through actual protected merge and post-merge verification. Then use measured results to approve a larger batch; do not claim the workflow is operational based on this document or mocked tests alone.

## Existing plan selected; API background only

Zach selected existing-plan authentication and aggressive savings. Use that allowance and checkpoint on limits. API billing remains comparison background, not an approved fallback: it offers separate metering but adds variable bills and credential/spend-control work. A local loop still needs its machine available; hosted execution is a separate choice.

Native desktop/CLI delegation supports explicit model selection; subagent work consumes additional tokens. Accordingly, use fewer well-bounded agents rather than equating parallelism with savings. [Official subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).

If API use is chosen later, require a spending policy, instrument root and subagent usage, account for reasoning/retries/tools, and stop new calls before the budget is exhausted. Usage accounting can be incomplete or delayed; do not promise an exact dollar ceiling from a prompt or a dashboard setting alone. [Official API usage accounting](https://developers.openai.com/api/docs/guides/agents-api/observability).

Start with an explicit bounded goal in a normal delivery chat. No recurring scheduler is needed for the pilot. Scheduled local work is optional later and requires the computer/app available; scheduling alone does not approve scope or merging. [Official scheduled-task documentation](https://learn.chatgpt.com/docs/automations?surface=app).

## Acceptance of this planning task

The plan covers every requested transition from approved ideas through implementation, testing, review, merge, and advancement; concrete cheaper-model roles and bounded costs; fresh-state recovery; actual repository/default-branch facts; baseline and CI prerequisites; and the full remaining feature queue. It distinguishes a proposed workflow from an operationally demonstrated one. Enabling it, changing protections, or merging product work is a subsequent implementation stage with explicit batch authority.
