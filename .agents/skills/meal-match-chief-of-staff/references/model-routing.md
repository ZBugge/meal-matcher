# MealMatch subagent model routing

Updated 2026-10-16 for Zach's requested measured parallel-delivery trial (MM-I009), retaining existing-plan aggressive savings (MM-D009). This is the single home for role/model choices. Recheck available model IDs and effort values before spawning. Use existing-plan authentication only; never fall back to separately billed API calls or buy credits automatically.

## Choose the smallest suitable role

| Role | Use for | Model | Reasoning effort |
|---|---|---|---|
| Scout | Bounded factual lookups, file inventories, summaries of supplied material, checking a known command/result | `gpt-6-luna` | `high` |
| Micro-builder | Fully specified mechanical UI/documentation work in at most three files; no auth, schema, API contracts, persistent state/recovery, dependencies, deployment, or merge tooling | `gpt-6-luna` | `high` |
| Worker | Routine code investigation, product research with a clear question, drafting, bounded implementation and tests | `gpt-6.1-sol` | `medium` |
| Reviewer | Independent review of ordinary, bounded changes | `gpt-6.1-sol` | `medium` |
| Deep reviewer / specialist | Difficult debugging, consequential contracts, migrations, sharing/privacy, persistence/recovery, or cross-layer correctness | `gpt-6.1-sol` | `high` |
| Exceptional specialist | A specific unresolved problem after Sol high, or a documented risk that warrants starting with the strongest available model | `gpt-6-astra` | `high` |

Scout work needs a narrow question and direct evidence. Skip it when the coordinator already knows the facts. Use Luna first for qualifying micro-builds with clear acceptance checks; use Sol medium for ordinary feature work and Sol high for consequential analysis/review. Do not route ambiguous feature design, data models, or synchronization to Luna. Astra is exceptional: record the unresolved question or specific risk before spawning it, and give it a bounded analysis/review rather than a duplicate implementation.

## Aggressive economy defaults

- One active feature, one coordinator/integrator, one independent reviewer. One writer is the default for small or coupled work; two builders may own disjoint slices in separate worktrees after shared contracts are settled. No automatic scout, committee of reviewers, competing implementations, speculative next-feature agent, or nested delegation.
- Prefer a Sol-medium delivery coordinator selected in the UI. The current chat's model cannot be changed by spawning cheaper children; don't claim otherwise.
- For a qualifying task use one Luna builder and one Sol-medium review. Otherwise the coordinator builds directly or assigns one Sol-medium worker when that saves work. Use Sol-high review when the change needs it; don't add it to every simple patch.
- Initial implementation plus one focused repair on the small-task lane. If Luna still fails, hand the evidence to Sol once; do not repeat the investigation. Maximum three implementation attempts across all models. One initial independent review and one consolidated recheck after fixes; a still-unresolved item is checkpointed rather than retried indefinitely.
- Aim for two delegated turns on the normal builder/reviewer path; maximum five per milestone, including follow-ups, handoff, recheck, and any specialist assignment. Direct coordinator implementation can need only the reviewer. Do not add hidden clarification or housekeeping turns outside this allowance.
- At most two active builders beside the coordinator, only when both are needed for an authorized outcome and the shorter slice exceeds setup/handoff/integration overhead. Use the [parallel delivery procedure](../../../../docs/parallel-delivery.md) for ownership, timing and rollback checks. The two-builder lane targets three delegated turns (two builders plus reviewer), retaining the five-turn ceiling and reserving two repair/recheck turns. Its two initial builders count as two implementation attempts, leaving one consolidated repair. No worker spawns children. No separate agent just to run tests, poll CI, write routine notes, or repeat a conclusion.
- Freeze the integrated candidate before independent review; run deterministic verification concurrently with that review. Coordinator alone integrates, records canonical memory and publishes. A repair invalidates affected evidence. Keep the one-writer path when the split adds waiting, conflicts or repeated work.
- Use fresh-context assignments, relevant paths and failure excerpts; aim for a task brief of 500 words or less and a hand-back of 300 words or less. These are defaults, not reasons to omit necessary requirements/evidence. Do not copy the whole chat or backlog.
- Use deterministic scripts for verification, reports, status, and waiting. Reuse installed dependencies. Run focused checks while editing and the full suite at the existing candidate/CI/post-merge gates; unchanged code does not justify another full run.
- Preserve acceptance criteria, independent review, privacy/data-preservation invariants, and full verification. Reduce agent overhead before reducing assurance. Measure total observed usage including coordinator, repairs and review; don't equate the cheaper model's rate with guaranteed savings.
- Use Standard speed. No automatic API fallback, credit purchases, or paid services. If subscription limits stop work, checkpoint for later resumption. Existing batch/permission boundaries still apply.

Simple capture, checkpointing, status answers, and final synthesis stay with the main coordinator. Its model remains the one selected for the chat; this routing policy does not change the main chat's model or promise that it is Astra. Do not spawn a worker just to process every rambling thought.

## Apply the route in the tool call

In the available `collaboration.spawn_agent` interface, set all three fields explicitly:

- `fork_turns: "none"`
- `model`: the table's exact model ID
- `reasoning_effort`: the table's exact effort value

Full-history forks inherit the parent's settings and cannot accept model/effort overrides in this interface. Supply a self-contained assignment instead: the question, role, canonical repo/worktree, relevant files and decisions, scope, editing permissions, evidence required, and stopping condition. Include a request to read applicable repository instructions. The skill's ownership and isolation rules still apply.

For example, an ordinary code review uses `model: "gpt-6.1-sol"`, `reasoning_effort: "medium"`, and `fork_turns: "none"`; use high for consequential review. Put the assigned role and constraints in `message`.

This is routing through explicit spawn parameters. It does not rely on custom-agent TOML discovery or change global Codex settings. If another client has a different interface, inspect its supported schema and use its explicit equivalent. If per-agent overrides are unavailable, disclose that limitation and keep the work in the coordinator rather than pretending a model switch occurred.

## Verify, escalate, and recover

Before the spawn, briefly name the roles/models and purpose when delegation is material. Keep available concurrency for independent work; don't launch all roles automatically. Check the tool result for acceptance or errors. Record requested model/effort and outcome in the current digest when it exists. A worker's own claim about its model is not verification; rely on the spawn request/tool evidence and any runtime metadata actually exposed.

Review evidence, contradictions, and completeness. Escalate a failed narrow Luna assignment to Sol medium, difficult Sol-medium work to Sol high, and only a justified unresolved/risky question to Astra. Do not walk every task through every tier. Changing a follow-up message does not change the worker's model. Respect the attempt limits above; preserve unresolved evidence and report the exact missing decision rather than looping.

If a model is unavailable, don't repeatedly retry it or silently choose a more expensive model. Luna may fall back to Sol medium for a bounded task. If suitable Sol capacity is unavailable, checkpoint unless a specifically justified Astra assignment fits the user's existing allowance and task scope. Unresolved high-risk conclusions remain unverified. Don't enable a provider, buy capacity, or change account settings to bypass availability.

## Basis

The role/effort assignments above are MealMatch defaults chosen for this workflow, not a claim about measured project-specific speed or cost. OpenAI describes Luna for focused work, Sol as a balance for complex work, and Astra for the most demanding work. [OpenAI model guide](https://developers.openai.com/api/docs/guides/latest-model).

Codex supports explicit per-agent models and reasoning settings, with inheritance when settings are omitted. [OpenAI subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).
