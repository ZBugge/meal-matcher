# MealMatch decisions

Record choices and their reasons here. Pending choices belong in the latest relevant digest. Recommendations are not user decisions.

<a id="mm-d001"></a>
## MM-D001 — Capture first

- Date: 2026-10-13 (America/New_York).
- Decision maker: Zach, in response to the setup preference question.
- Choice: Save and organize app ideas by default; investigate or build when asked.
- Why: Make rambling useful without turning every thought into an implementation commitment.
- Revisit if: Zach explicitly changes the default autonomy level.

<a id="mm-d002"></a>
## MM-D002 — Bootstrap the Chief of Staff

- Date: 2026-10-13 (America/New_York).
- Decision maker: Zach, authorizing the proposed setup with “ok lets get it going.”
- Choice: Install the minimal coordination workflow described in [the proposal](../docs/agentic-pod-proposal.md).
- Implementation defaults chosen by the coordinator: project-local skill and notes, existing product backlog, stable IDs, on-demand briefings, bounded subagents, and one writer for shared memory.
- Why: Reuse the existing idea-to-PR workflow while making context recoverable across chats.
- Boundaries: This setup request does not select or authorize a product feature, publish changes, migrate the Claude orchestrator, or configure recurring automation.
- Revisit if: Multiple projects, personal notes, or a demonstrated recurring need make a separate memory workspace or schedule useful.

<a id="mm-d004"></a>
## MM-D004 — Route delegated tasks to different OpenAI models

- Date: 2026-10-13 (America/New_York).
- Decision maker: Zach, asking to add task-based model routing after confirming it was missing.
- Choice: Select the model and reasoning effort explicitly for delegated work, using the [routing policy](../.agents/skills/meal-match-chief-of-staff/references/model-routing.md).
- Implementation defaults chosen by the coordinator: Luna for narrow factual work, Sol for routine work/reviews, and Astra for demanding analysis; use self-contained assignments when model overrides require fresh context.
- Why: Match delegated effort to the task while keeping one accountable coordinator.
- Boundaries: Capture-first behavior still applies. The coordinator's selected chat model is unchanged. No account, provider, billing, global model defaults, or unattended schedules are changed.
- Revisit if: A model becomes unavailable, the tool interface changes, or observed results show a role needs a different model or effort.

<a id="mm-d005"></a>
## MM-D005 — A personal family food app

- Date: 2026-10-14 (America/New_York).
- Decision maker: Zach, describing his new product direction and mission.
- Choice: Center MealMatch on storing recipes, agreeing on meals for a day or week, constructing a shopping list, and using recipes while cooking. Keep swiping for couple decisions and support takeout; prioritize Zach's household, including solo use, over distribution or scalability for others.
- Why: Make this the family's go-to food app and reduce recurring meal decisions and shopping work.
- Delivery preference: Iterate quickly with very little guardrails or process overhead. Use small practical changes; specific technical designs below remain recommendations.
- Boundaries: This turn requests an assessment of the current setup, not product implementation, deployment, removal of existing authorization checks, or a blanket change to publishing permissions.
- Related ideas: [MM-I006](briefs/MM-I006.md), and MM-I004 in [Ideas](../Ideas.md).
- Revisit if: Zach changes the family mission or asks to support broader distribution.

<a id="mm-d006"></a>
## MM-D006 — Full verification in under two minutes

- Date: 2026-10-14 (America/New_York).
- Decision maker: Zach, setting the goal to reduce testing time below two minutes without losing confidence.
- Choice: Make repeated full local app verification fast enough for rapid iteration while retaining the baseline checks.
- Implementation defaults chosen by the coordinator: `npm run verify`, parallel complete gates, bounded workers, dedicated browser ports/database, automatic phone smoke/screenshots, strict report validation, and a 120-second failure budget. Existing baseline tests are retained.
- Why: Avoid setup/tool-call overhead slowing each family-app iteration.
- Evidence: final complete command time 42.56 seconds after the unit-database isolation fix, with all 138 unit tests, 22 browser scenarios, lint, both builds, and runner regressions passing; before/after hash confirmed the original database unchanged. Earlier measured runs were 44.87/41.70 seconds; deliberate failing-test run correctly exited 1. See [verification instructions](../docs/verification.md).
- Boundaries: This changes local verification, not the family feature roadmap, real-device coverage, deployment, or publishing permissions. Installation/setup and feature-debugging time are separate from repeated verification runtime.
- Revisit if: The suite grows past the budget or target-device behavior requires additional checks; optimize execution rather than silently dropping coverage.

<a id="mm-d007"></a>
## MM-D007 — Implement and repeat the adversarial confidence pass

- Date: 2026-10-14, resumed 2026-10-15 (America/New_York).
- Decision maker: Zach, requesting implementation of the audit, a passing suite under two minutes, and continued adversarial audits; resumed with “keep going.”
- Choice: Fix reproduced defects and strengthen actual API, browser recovery, persistence, and production-runtime verification. Include repeatable mutation checks and extend them when consequential regressions reveal gaps.
- Why: Build quickly with evidence that tests detect important broken behavior, after the old green suite accepted a deliberately permissive invalid-vote guard.
- Related idea: MM-I008 in [Ideas](../Ideas.md); original [audit](briefs/adversarial-confidence-2026-10-14.md).
- Boundaries: Local implementation/testing and independent review authorized. No publication, deployment, account changes, recurring schedule, or unrelated family feature inferred.
- Revisit if: Verification approaches two minutes, new features need different failure coverage, or target-device behavior needs dedicated checks.

<a id="mm-d008"></a>
## MM-D008 — Plan cost-conscious autonomous delivery

- Date: 2026-10-15 (America/New_York).
- Decision maker: Zach, requesting a plan to iterate the idea list through implementation, testing, merge, and the next task using cheaper models/subagents.
- Choice: Investigate and prepare a concrete delivery plan with cost controls. [MM-I009](briefs/MM-I009.md), [proposal](../docs/autonomous-delivery-plan.md).
- Why: Deliver the family roadmap quickly without making expensive models and repeated coordination the default.
- Unresolved preference: Zach asked for the pros/cons of existing Codex allowance versus API billing. Existing-plan pilot is the coordinator's recommendation, not a user-selected spend policy.
- Boundaries: Planning/read-only access checks and saved documentation only. No feature batch, commit/push/merge, branch-protection change, API billing, or scheduler enabled by this request.
- Revisit if: Zach adopts the plan and selects the first authorized delivery batch and spending/deployment scope.

<a id="mm-d009"></a>
## MM-D009 — Existing plan and aggressive cost savings

- Date: 2026-10-15 (America/New_York).
- Decision maker: Zach: “the existing plan for sure” and “lets actually be quite aggressive about cost saving if we can.”
- Choice: Existing Codex allowance only; aggressively reduce model/coordination overhead. No separately billed API fallback or automatic credit purchases.
- Operating defaults: Luna first for bounded mechanical work and narrow facts; Sol medium for ordinary implementation/review, Sol high for consequential analysis, Astra only for an explicit exceptional reason. Short fresh-context assignments, one active worker, bounded repair/handoff, deterministic testing/status checks. Keep acceptance criteria, independent review and full verification intact.
- Why: Spend the allowance on accepted user outcomes rather than oversized models, duplicated context, or repeated attempts. Main-chat model selection stays in the UI; cheaper children do not change it.
- Related work: MM-I009 [delivery plan](../docs/autonomous-delivery-plan.md) and [routing policy](../.agents/skills/meal-match-chief-of-staff/references/model-routing.md).
- Boundaries: This accepts the spending/model policy; it does not itself publish existing work, change GitHub protections, or start merging the product queue.
- Revisit if: Measured repairs/review erase cheaper-model savings, quality falls, or Zach changes the spending preference.

<a id="mm-d010"></a>
## MM-D010 — A named, verifiable delivery invocation

- Date: 2026-10-15 (America/New_York).
- Decision maker: Zach, asking how to use the plan so it can be invoked with certainty.
- Request: Make invocation concrete and observable. Coordinator added the project-local [delivery skill](../.agents/skills/meal-match-delivery/SKILL.md), explicit AGENTS/Chief of Staff routing, mode/scope/budget receipt, and check/prepare/run/resume contract.
- Why: Avoid depending on remembering a prose plan or interpreting a vague “go.” Check readiness without writes; distinguish loading from operational enforcement.
- Evidence: YAML/metadata/references validated with installed js-yaml because the bundled Python validator lacked PyYAML. Independent bounded Luna/high forward check loaded the skill and returned blocked with missing baseline/tooling/batch evidence, without changes or a full-suite run. This validates check-mode behavior, not app-picker discovery or the full merge loop.
- Boundaries: No publishing, protection changes, or product batch started. Existing economy/spend policy retained; automated execution still requires its actual prerequisites and batch scope.
- Revisit if: Invocation discovery or mode selection fails in real use, or delivery tooling is implemented and permits a full pilot.

<a id="mm-d011"></a>
## MM-D011 — Prepare setup and the first dashboard pilot without publishing

- Date: 2026-10-15 (America/New_York).
- Decision maker: Zach: “Use $meal-match-delivery to prepare the delivery setup and first dashboard pilot batch. Do not publish.”
- Choice: Save concrete linked proposals for [delivery-setup](briefs/delivery-setup.md) and [dashboard-pilot](briefs/dashboard-pilot.md), under MM-I009 and MM-I002 respectively. Preserve the dirty canonical checkout and existing-plan economy policy.
- Coordinator's proposed defaults: baseline/CI followed by delivery guards/protection; first product slice moves session actions above the library and adds independent library/history disclosure controls. Search follows separately. Budgets and acceptance/failure cases are recorded in the briefs as proposals.
- Why: Make the next implementation scope reviewable before enabling delivery.
- Boundaries: Prepare mode only. No product/helper implementation, commits, push, PR, merge, repository-settings change, deployment or scheduler authorized. GitHub access/protection rechecked read-only; unknown Railway behavior remains a merge blocker. Backlog lanes unchanged.
- Revisit if: Zach authorizes a scoped implementation/run stage or changes the pilot/deployment scope.

<a id="mm-d012"></a>
## MM-D012 — Deliver the family app autonomously

- Date: 2026-10-15 (America/New_York).
- Decision maker: Zach: “set it and forget it agentic workflow,” then try the app and give feedback; “ship quickly fail fast go go go.”
- Choice: Build the usable family recipe → week → shopping → cooking loop now, including voting integration and phone installation. Use one shared family login and online-first behavior for v1.
- Delivery: Proceed through scoped implementation, real tests, independent review, normal commits/PR/merge and the existing release path without routine stage approvals. The previous setup/pilot preparation staircase and custom helper/protection prerequisites are superseded. Actual access requirements and repository rules still apply.
- Cost: Existing Codex allowance only, bounded delegation and aggressive economy. No paid API fallback or billing/settings changes.
- Boundaries: No destructive data changes, force pushes, protection bypass, unsolicited messages or recurring schedule. Ask only for a material product decision, unavailable access, new spending or destructive action.
- Related work: [family kitchen v1](briefs/family-kitchen-v1.md).
- Revisit: After Zach uses the working app and provides feedback, or a concrete deployment/access requirement blocks delivery.
