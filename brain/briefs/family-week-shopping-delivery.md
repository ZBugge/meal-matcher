# Family week and shopping delivery — 2026-10-15

Implement the ten selected product-review ideas: 1–3, 6–7, 16–19 and 22. Save all forty proposals, keeping their original discussion numbers. [Full catalogue](family-product-review-2026-10-15.md). User explicitly said start with these; prior autonomous test/review/merge/local-preview authority continues. Existing-plan economy; hosting deferred.

## Delivery groups and acceptance

MM-I014, week planning (1–3,6):
- Current week opens with Tonight, an obvious cook action for scheduled recipes, and a useful choice when tonight is empty. Other weeks must not imply their meals are tonight.
- Show seven understandable day slots plus flexible meals. Existing date assignment, multiple meals per day and takeout remain supported; no pressure to fill every day.
- Intentional Add meal action opens a searchable recipe picker and can choose a date. Keep library candidates out of the permanent agreed-menu display. Offer adding flexible meals to tonight rather than duplicating them.
- Repeat a chosen week's selected menu into another Monday with weekday positions shifted, flexible meals flexible, fresh IDs and a fresh needed grocery checklist. Review selection first; append without replacing an existing target plan. Never mutate source week or carry purchased/already-have states as new purchases. Ownership checks and persistence rollback cover the whole copy.

MM-I007, weekly staples (7):
- Reusable named dinner slots such as salmon and Asian tofu, distinct from pantry groceries. Persist editable/removable household templates and let user choose an actual saved recipe for the selected week. Offer salmon/tofu starters without silently creating fake recipes, automatically adding unchosen candidates, or repeatedly resurrecting deleted records. Reopening another phone/session must retain saved staples.

MM-I015, shopping (16–19,22):
- Compact phone Shop view with large tap/checkbox actions, completed items tucked away and editing behind intentional controls. Preserve existing extras, edit/remove, have/bought states and copy-list behavior.
- Consolidate ingredient rows across meals, with source attribution. Normalize case/whitespace; only total quantities with compatible understood units. Keep ambiguous/free-text amounts intact and show their contributions; no guessed conversions.
- Sensible aisle grouping/order plus an editable persisted aisle choice. Ingredient-only categorization may use a small local deterministic map; unknown items stay Other. No services/dependencies.
- Pantry review supports selecting several already-have items and applying once, before shopping. Validate every selected row and perform bulk state changes atomically; reject mixed ownership/stale IDs without partial writes.
- Removing dinner explains grocery consequences and offers Keep groceries. Purchased groceries must survive automatically as standalone items; kept rows remain editable/purchasable. Do not silently delete shopping progress. Full undo/moving across weeks is unselected idea 5 and not required here.

## Engineering and assurance

One writer in C:/Users/ZachBugge/food-app/.feedback-worktree, branch codex/family-week-and-shopping from master e85040b. Canonical notes owner remains C:/Users/ZachBugge/food-app on dirty codex/chief-of-staff. Workers do not edit shared notes or switch branches. Reuse installed dependencies; no new production packages. Keep fresh schema/additive migrations/types/API/consumers aligned. Public voting/recipe privacy and storage contracts unchanged. Multi-step saves must persist once with rollback after disk failure. Add meaningful HTTP ownership/atomicity/migration coverage and phone end-to-end coverage for the complete selected flows; attach week/shop screenshots. Preserve existing browser assertions by adapting expected UI rather than reducing coverage.

Sol-medium builder with one focused repair; Sol-high independent review for schema/bulk persistence and cross-layer changes, one consolidated recheck. No nested agents or redundant scouts. Coordinator handles canonical backlog/notes, full verifier, integration/publication and preview refresh. Full candidate verification under 120s, review, current GitHub requirements, head-matched merge, verify actual master and full post-merge gate. Backup existing copied preview DB before migration/restart, preserve original canonical DB hashes. Build all selected scope before handoff; if genuine access/usage blocks delivery, checkpoint exact remaining work.
