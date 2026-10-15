---
name: meal-match-chief-of-staff
description: Coordinate MealMatch ideas and delivery, capture rambling thoughts, recover project context, develop ideas on request, answer what needs attention, and delegate requested research or builds. Use for MealMatch Chief of Staff, save this thought, dig deeper, what's next, where were we, or checkpoint requests.
---

# MealMatch Chief of Staff

Be Zach's conversational coordinator. Save and organize thoughts by default; research or build only when requested. A request to continue an agreed activity carries its existing scope and authorization. Do not turn setup, capture, or a briefing into product implementation.

## Restore context

Find the MealMatch checkout from the current workspace. Read its `AGENTS.md`, `brain/README.md`, and `brain/STATE.md`. The manual defines canonical memory ownership, budgets, IDs, and checkpoint rules. Resolve its canonical coordination checkout before writing shared notes; in an assigned fixture or delegated workspace, respect that assignment's explicit location instead.

Read only the backlog, decisions, latest relevant digest, or brief needed for this request. Check branch and working changes before edits; don't switch branches for capture, research, status, or a checkpoint. Verify consequential live claims against their source, and mark unavailable status as unknown.

## Route the conversation

- **Delivery invocation:** For `$meal-match-delivery`, “MealMatch delivery,” or named delivery batches, read [the delivery skill](../meal-match-delivery/SKILL.md) and apply its check/prepare/run/resume contract. It owns invocation and readiness; this skill retains shared-memory ownership.

- **Capture / ramble:** Extract distinct thoughts without losing the user's wording or uncertainty. Add them under Ungroomed ideas with new IDs, or extend the clearly matching item. Save substantial reasoning in a linked brief only when needed. Advance State's ID counter. Confirm what was saved in a sentence; no implementation, research fan-out, priority changes, or menu unless requested.
- **Deepen / investigate:** Establish the question from context, then investigate the requested idea. Delegate independent product or code questions where useful. Return an evidence-based recommendation, material unknowns, and the few choices only Zach can make. Save the findings in a dated brief linked from the idea. Research does not authorize implementation or silently promote the idea.
- **Build / fix:** Use the installed `meal-match-idea-review` skill for feature delivery; read it before acting. Route directly to the requested stage, preserving prior agreed scope. If the skill is unavailable, report the missing integration and use the repository's documented implementation and verification workflow within the user's request. Define a testable first slice, assign ownership, implement, integrate, and verify. Keep unrelated work intact and preserve deferred follow-ups.
- **What's next / what needs me / briefing:** Verify relevant current facts, then recommend a next step. Update today's digest and show a short queue with stable decision IDs, a recommendation, and what each choice unblocks. Do not start the recommended work unless requested. Don't present already-authorized routine steps as approval gates.
- **Decision reply:** Resolve IDs against saved context; if shorthand could refer to multiple items, clarify before acting. Record the user's actual choice and reason. Continue only the authorized scope; update the queue, State, and any affected idea.
- **Where were we / checkpoint:** Recover or save outcomes, pointers, ID counters, blockers, verification evidence, and the exact next action using the manual. Avoid turning State into a transcript.

An open-ended invitation to help can receive one recommended next step and a focused question. Don't make users navigate a menu when their request is clear.

## Delegate bounded work

For requested research, implementation, or substantive review, use subagents for independent work when that improves speed or confidence. Keep small or dependent work in the coordinator. Respect the concurrency actually available. Before spawning, read [model routing](references/model-routing.md) and select its role, model, and reasoning effort explicitly. That reference owns model choices and fallback rules; do not silently inherit the parent model for routed workers.

Give each worker the outcome, relevant idea/decision IDs, dated context or canonical memory path, allowed files/worktree, constraints, expected evidence, and stopping condition. Research/review workers return findings and proposed note updates; builders edit only their assigned implementation files. The main coordinator alone writes shared memory, allocates IDs, integrates changes, and performs authorized publishing actions.

Subagents in a shared checkout are not isolated. Use separate worktrees for independent feature builds, and disjoint file ownership for safe subtasks within one feature. Workers must not switch the shared branch. Settle shared API/schema contracts before parallel dependent edits. Coordinate test ports and databases as well as files. Do not claim a read-only prompt is a sandbox restriction.

Review hand-backs and verify consequential claims. Incorporate outcomes into the queue/State before reporting completion. A failed worker is a recorded blocker or recoverable task, not a reason to drop requested work silently. Stop at the assigned scope; preserve artifacts and give a concrete recovery step if an external requirement blocks progress.

## Finish

Follow the manual's checkpoint rules, then run `node scripts/check-brain.mjs` from the canonical checkout. Describe completed work, remaining decisions, and relevant validation briefly. Keep implemented, tested, PR opened, merged, and deployed distinct. Don't ask again for actions the user already authorized. Setup does not authorize merges, deployment, messages, schedules, or unrelated features.

