# Parallel delivery

MM-I009 implementation trial, 2026-10-16. Use native subagents on the existing Codex allowance. This workflow helps deliver already authorized ideas; it does not select new product work or authorize spending, deployment, or repository settings changes.

## Choose a schedule

Keep small or coupled work with one writer. For separable work, use two builders in separate worktrees from the same verified base. The coordinator owns shared contracts and integration. Use the [routing policy](../.agents/skills/meal-match-chief-of-staff/references/model-routing.md) for models, efforts, attempts and delegated-turn limits.

Before splitting, map the acceptance criteria to exact files. Settle shared interfaces first. Each builder must produce a necessary, independently checkable part without waiting on or editing the other builder's implementation. Authentication, schema, persistence and recovery changes have one accountable writer. Estimate setup/handoff/integration overhead; split only when the shorter independent slice exceeds it. Reuse installed dependencies and browser caches; isolate ports and databases.

Write a versioned contract with base SHA, acceptance, shared interface, exact coordinator/builder file ownership, distinct absolute worktree paths, builder checks and estimates, integration order and budget. Check it before spawning:

```powershell
node scripts/delivery-contract.mjs check .verification/delivery/contract.json
```

Record actual changed paths for each owner and check them before integration:

```powershell
node scripts/delivery-contract.mjs check .verification/delivery/contract.json .verification/delivery/changes.json
```

These checks validate supplied declarations, not filesystem isolation or the truth of a worker's report. Inspect each actual worktree status and diff, including untracked files and rename destinations. Coordinator integrates sequentially. No worker changes shared memory, switches the coordinator's branch, publishes, or delegates.

## Short assignments

Give each worker: outcome and acceptance, assigned directory/base, exact file allowlist, settled interfaces, targeted checks, forbidden shared edits, stopping condition, and concise hand-back format. Fresh context, normally under 500 words. Ask for changed files, check evidence, start/end times, material findings and blockers. Do not send the backlog or whole conversation. Skip extra scouts and test-running agents.

## Finish once

Integrate both slices, inspect ownership and run focused checks. Freeze the complete candidate before independent review. Start deterministic full verification and one read-only reviewer concurrently against that candidate. Record candidate commit/tree and clean status before and after; a changed candidate invalidates affected evidence. Recheck material fixes within the existing attempt budget. Preserve normal PR checks, head-match merge and actual merged-state verification. Concurrency changes scheduling, not acceptance or privacy gates.

## Measure the whole delivery

Save real UTC start/end timestamps for setup, each builder, integration, repairs, review and verification in an ignored run record. Include parent/coordinator overhead in the run interval. Missing timing or quality evidence is unknown, never a pass. Run:

```powershell
node scripts/delivery-metrics.mjs report .verification/delivery/run.json
node --test scripts/delivery-contract.test.mjs scripts/delivery-metrics.test.mjs
```

The metrics tool distinguishes observed elapsed time from a reconstructed sequential schedule. Holding actual task durations constant gives a useful scheduling estimate; it is not a measured sequential control and cannot prove causal speedup or savings in credits. Count repairs, handoffs and integration. Token totals must include parent and children; report unknown when not exposed.

The initial adoption target remains at least 20% estimated elapsed reduction, at most 10% additional comparable observed token use, unchanged gates and no additional material defects. For Zach's stronger objective of a dramatic improvement, look for at least 30% end-to-end reduction (about 1.43x throughput), supported by two eligible accepted outcomes, with setup and repairs included. Do not silently relabel a faster build phase as faster delivery. A workflow-tooling pilot supplies initial evidence, not proof about arbitrary product features.

If builders occupy fraction p of sequential delivery, two perfectly balanced builders can reduce that portion by at most half: overall speedup is bounded by 1 / (1 - p/2), before overhead. At p=0.6, the ceiling is roughly 1.43x. Overlapping final review/checks can also help, but additional builders cannot fix a serial shared-contract bottleneck. Stop splitting when conflicts, idle time or repair erase the gain; improve scope/contracts or use one writer.

Use the next authorized eligible work as the second trial; never duplicate an implementation or consume an unselected backlog item merely to manufacture a benchmark. Keep confidence and cost claims provisional until evidence supports them.
