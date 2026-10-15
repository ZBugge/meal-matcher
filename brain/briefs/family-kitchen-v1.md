# Family kitchen v1

Zach requested a set-and-forget delivery workflow: “ship quickly fail fast go go go,” then try the app and give feedback. Build the usable family loop now rather than requiring a custom delivery platform or repeated setup approvals. See MM-D012.

## Outcome and defaults

Recipes → choose several meals → save a weekly plan → generate ingredients → mark pantry items and purchases → open recipes while cooking. Existing couple swiping feeds multiple meals into the same plan. Support takeout nights.

Use one shared family login on both phones for this first version. Preserve authentication, ownership, private recipe data and existing public voting. Keep the current stack and database. Installable online-first PWA; show a useful offline screen, without pretending offline edits synchronize.

Persistent login survives ordinary server restarts. Dashboard actions stay accessible above a searchable, collapsible library and independently collapsible history.

Recurring staples (weekly salmon, Asian tofu) remain MM-I007 for later feedback. Grocery ordering, separate household accounts, unit conversion and full offline synchronization are deferred.

## Delivery

- Coordinator/canonical memory: C:/Users/ZachBugge/food-app.
- Isolated branch: codex/family-kitchen.
- Worktree: C:/Users/ZachBugge/.codex/visualizations/2026/10/14/01a13be4-9411-7f41-be0c-89648b4cbd44/family-kitchen.
- One Sol-medium implementation worker completed scoped planning API/pages and tests; root integrates navigation, voting, PWA and durable login. Independent Sol-high review follows.
- Normal scoped commits, PR/merge and existing release path are authorized by the delivery request. Do not change billing, buy API credits, bypass protections, or destroy data. Use existing Codex plan with bounded delegation.

## Acceptance evidence

Require persistent multi-meal plans, correct week/day validation, ordered private ingredients, pantry/purchased state preserved, shopping extras, second independent same-account browser, cooking view, multiple voted meals added, guest privacy, database reopen/migration and write-failure rollback. Run full verification under two minutes, inspect phone layout, and review consequential changes.

Status: implementation and independent Sol-high review complete. Reviewer caught owned quick-session options rejected by planning; fixed with host-scoped active lookup, HTTP privacy checks and an authenticated quick-result-to-week browser regression. Final full run passed in 66.3 seconds: 104 server/110 client/27 browser tests, seven runner checks, lint/builds/production smoke and six mutations. Phone week/list/library screenshots inspected; no overflow. Preview http://localhost:5174 uses copied local data; original database hash unchanged. Publishing next; no PR/merge/deployment yet. Local Chromium tests do not establish iPhone Safari behavior or production deployment.
