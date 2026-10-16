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

Before a TypeScript builder releases ownership, run its deterministic handoff check from that builder's assigned worktree (use an absolute contract path when the coordinator stores it elsewhere):

```powershell
node scripts/delivery-handoff.mjs .verification/delivery/contract.json builder-owner
```

It checks the actual registered worktree, base ancestry and dirty/committed path ownership (both rename paths), runs affected package builds including configuration-only changes without executing arbitrary contract commands, and records a receipt/logs under that worker's ignored `.verification/delivery/handoff/`. A pass requires the same HEAD and source fingerprint before and after. Assignments without applicable package builds are explicitly unsupported and cannot receive a passing receipt. A receipt on changed source is stale; repeat the affected check. Targeted behavior tests and authored browser acceptance still travel with the builder, and final integration review/full verification remain required. The coordinator inspects the receipt and actual source; a handoff receipt cannot authorize a merge.

Run checks before sending the final hand-back, while the other builder/coordinator can still make independent progress. This catches type failures on the worker's critical path rather than waiting for the integrated full suite. After worker handback the coordinator may take over the one consolidated repair within the original file union; record that ownership transition and keep the original source audit. Do not run simultaneous edits against a released slice.

## Short assignments

Give each worker: outcome and acceptance, assigned directory/base, exact file allowlist, settled interfaces, targeted checks, forbidden shared edits, stopping condition, and concise hand-back format. Fresh context, normally under 500 words. Ask for changed files, check evidence, start/end times, material findings and blockers. For TypeScript changes require the affected package type check/build before handback as well as targeted tests; passing runtime tests cannot establish type correctness. When adding form controls, inspect existing browser locators for ambiguity and use explicit accessible names. Do not send the backlog or whole conversation. Skip extra scouts and test-running agents.

## Finish once

Integrate both slices, inspect ownership and run focused checks. Freeze the complete candidate before independent review. Start deterministic full verification and one read-only reviewer concurrently against that candidate. Record candidate commit/tree and clean status before and after; a changed candidate invalidates affected evidence. Recheck material fixes within the existing attempt budget. Preserve normal PR checks, head-match merge and actual merged-state verification. Concurrency changes scheduling, not acceptance or privacy gates.

## Measure the whole delivery

Save real UTC start/end timestamps for setup, each builder, integration, repairs, review and verification in an ignored run record. Include parent/coordinator overhead in the run interval. Missing timing or quality evidence is unknown, never a pass. Run:

```powershell
node scripts/delivery-metrics.mjs report .verification/delivery/run.json
node --test scripts/delivery-contract.test.mjs scripts/delivery-metrics.test.mjs
```

The metrics tool distinguishes observed elapsed time from a reconstructed sequential schedule. Holding actual task durations constant gives a useful scheduling estimate; it is not a measured sequential control and cannot prove causal speedup or savings in credits. Count repairs, handoffs and integration. Token totals must include parent and children; report unknown when not exposed.

Use review/verification phase kinds only for evidence on the final frozen candidate. Record invalidated earlier gate rounds as `other`, preserving their full time as overhead. Integration and repair must finish before the final gates start. Duplicate overlapping reviews or verification intervals are rejected; missing or zero-duration final-gate records cannot establish quality. Quality flags are supplied assertions: the coordinator must inspect the actual reports and reviewed candidate identity.

The initial adoption target remains at least 20% estimated elapsed reduction, at most 10% additional comparable observed token use, unchanged gates and no additional material defects. For Zach's stronger objective of a dramatic improvement, look for at least 30% end-to-end reduction (about 1.43x throughput), supported by two eligible accepted outcomes, with setup and repairs included. Do not silently relabel a faster build phase as faster delivery. A workflow-tooling pilot supplies initial evidence, not proof about arbitrary product features.

If builders occupy fraction p of sequential delivery, two perfectly balanced builders can reduce that portion by at most half: overall speedup is bounded by 1 / (1 - p/2), before overhead. At p=0.6, the ceiling is roughly 1.43x. Overlapping final review/checks can also help, but additional builders cannot fix a serial shared-contract bottleneck. Stop splitting when conflicts, idle time or repair erase the gain; improve scope/contracts or use one writer.

Use the next authorized eligible work as the second trial; never duplicate an implementation or consume an unselected backlog item merely to manufacture a benchmark. Keep confidence and cost claims provisional until evidence supports them.

The first two trials (2026-10-16) estimated11.59% and16.05% whole-delivery reductions, below the20% target, despite41.5% and38.8% builder-stage reductions. Setup, integration, repair and release overhead dominated these short tasks. Keep the single-writer default, use the handoff check to prevent the demonstrated missed-build failure, and reserve two builders for larger independent slices whose observed durations can amortize overhead. These results do not justify a third builder, broader spending, or claims of proven dramatic delivery savings. Timing records live in the canonical CoS briefs and ignored run evidence; metrics are reconstructed scheduling comparisons, not sequential controls.
