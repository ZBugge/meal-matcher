# MealMatch coordination notes

This is the project memory for Zach's Chief of Staff. Save and organize thoughts by default; investigate or build when asked. User instructions and corrections win over these conventions. Keep personal information and credentials out of this repository.

## Where things live

| Home | Contents | Read/update when |
|---|---|---|
| [Ideas](../Ideas.md) | The single product backlog, with stable MM-I IDs | Capture, refinement, priority changes, feature completion |
| [State](STATE.md) | Current goal, active work, blockers, next actions, ID counters | Read at startup; rewrite affected lines at checkpoints |
| [Decisions](DECISIONS.md) | Dated user choices, reasons, revisit conditions | Read relevant choices; update when a choice is made |
| `briefs/MM-I###.md` | Context, original wording, research, alternatives | Create on a request for depth or to preserve substantial reasoning |
| `digests/YYYY-MM-DD.md` | On-demand summary, decision queue, outcomes | Create on briefing requests; update today's existing briefing |
| [Chief of Staff skill](../.agents/skills/meal-match-chief-of-staff/SKILL.md) | Conversation routing and delegation procedure | Planning, capture, research, implementation coordination, recovery |
| [Model routing](../.agents/skills/meal-match-chief-of-staff/references/model-routing.md) | Role/model/effort choices, explicit spawning, escalation and fallback | Read before delegated work; record material routing outcomes in the digest |
| [Repository guide](../AGENTS.md) | Durable engineering invariants | Engineering work |

The PR records an implemented feature's scope and verification. Keep pre-implementation reasoning in a brief and link it from the backlog. Do not mirror live GitHub or deployment status in a second tracker.

## Ownership and worktrees

The canonical coordination checkout is `C:/Users/ZachBugge/food-app`. Only its main coordinator writes shared notes and assigns IDs. Other chats/worktrees read a dated snapshot or the canonical files and return proposed updates. Workers never change the coordinator's branch or shared notes. Re-read before writing to preserve human edits and intervening updates.

At handoff, state the canonical directory, branch/worktree, scope, and next action. If the canonical directory has moved or is inaccessible, report that and resolve its location before writing a second copy. Do not assume worktree copies are current. A new coordinator can take over once the earlier one has stopped or handed off; don't run competing coordinators.

Keep notes as local working changes while capturing. A request to save means write to files, not automatically commit or push. Include approved setup/documentation changes in an appropriate commit or PR when requested. Follow the repository's existing allowance for accepted backlog-only grooming on master; feature-completion cleanup stays in the feature PR. Before starting a feature, preserve these local notes and use a separate worktree if needed.

Feature-completion exception: the coordinator may remove the completed idea and add its scoped follow-ups in the feature worktree's `Ideas.md` for that feature PR. This is delivery cleanup, not a second live backlog. Keep canonical entries active until merge; then reconcile the scoped outcome with any newer local notes. Never overwrite the whole canonical backlog with a worker's older copy. Shared State, decisions, briefs, and ID allocation remain with the canonical coordinator.

## Memory and attention budgets

- State is a snapshot, at most 8 KB. Replace affected lines; don't append event history or a prior-state section.
- This manual is at most 8 KB. A digest is at most 12 KB, with at most eight Summary bullets and ten open Decision queue entries.
- Briefs begin with a short answer and remain on-demand. Link detail instead of loading every brief or old digest.
- Use America/New_York dates. Date status claims and verify stale or consequential claims from their actual source before acting.
- Preserve meaningful original wording before replacing a raw idea with a groomed version. Keep it in the idea's brief when the wording contains useful context; don't create an archive for trivial edits.
- Record explicit corrections in the rule's existing home, with date and reason when useful. Distinguish a project preference from a one-task exception; don't invent universal rules.

## IDs, decisions, and parked work

Use `MM-I001` for ideas and `MM-D001` for decisions. Assign from the next-ID counters in State and advance them; never recycle IDs when items leave the backlog. Keep an ID when its title, priority, or status changes. Repeated references to an ID are fine; duplicate definitions are not.

A queue entry is `- [ ] MM-D003: [needs-you] Decision, recommendation, and what it unblocks.` Order prepared approvals, decisions, running work, and waiting items by what unblocks useful work. Do not create an approval item for an action already authorized. Refer to completed choices in Decisions; keep only a brief done-today outcome in the digest.

For a resolved choice, record the date, decision maker, choice, reason, related idea, and revisit condition. Mark recommendations as recommendations. No reply is not approval. A future research request permits research; it does not by itself approve implementation.

Parked actionable work needs a revisit condition (a date, a dependency, or an explicit event). Evaluate relevant conditions during a briefing; label conditions requiring unavailable live data as unverified. No background watcher or reminder exists unless one has actually been configured.

## Checkpoints

Before ending substantial project work, save decisions and requested thoughts, update State's affected lines and counters, and update the current digest if one exists. Record the next action, verified results, and any blockers. Distinguish implemented, tested, PR opened, merged, and deployed.

Run `node scripts/check-brain.mjs` after note changes. Fix failures before reporting the checkpoint complete. For structured output use `--json`; `--root <directory>` supports isolated fixtures. The check validates budgets, queue/idea IDs, and relative file links; it does not establish factual truth or run app tests.

Briefings are on demand. No daily schedule, autonomous backlog processing, or message sending is enabled.
