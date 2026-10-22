# MealMatch → Cloudflare: implementation and deployment handoff

Prepared 2026-10-19; finalized 2026-10-20, America/New_York. Related idea: MM-I025. Platform direction: MM-D022.

## 1. Outcome and scope

Move MealMatch to Cloudflare Workers + D1, with its React/Vite frontend served as Worker Static Assets at the same origin as `/api`. Establish a small, documented deployment pattern that can be reused for Zach's other personal apps. Keep existing product behavior, data and private information intact. Make routine releases verifiable and automatic after initial setup.

Zach's priorities, in order: little ongoing involvement, low total cost across roughly 5–15 personal/family apps, dependable data, and easy agent-managed changes. He explicitly rejected deploying MealMatch to Railway first and using Cloudflare for other apps. Plan one destination: Cloudflare. Retaining an existing source as a temporary recovery copy during cutover is data protection, not a second ongoing hosting strategy.

This handoff is a plan, not a claim of implementation or deployment. The current request authorizes planning. Another agent must receive an execution instruction before changing the application. Existing MealMatch delivery authorization covers routine scoped build/test/review/PR/merge work once that work is requested, but excludes new spending and hosted changes. Prepare and verify the concrete candidate before requesting any remaining paid-plan or production action approval. Do not invent approval gates for reversible local work already requested.

Success means the deployed app supports current quick sessions, authenticated libraries, voting/results, family planning/shopping, recurring groceries, recipes and the accepted Notion integration. A fresh agent can diagnose a failed release, deploy a verified release, and recover code or data using documented scripts. There is one production database for this app, separate from test/staging databases and from future apps.

## 2. Current source and safe workspace entry

Canonical coordination checkout: `C:/Users/ZachBugge/food-app`, currently branch `codex/chief-of-staff`. Read `AGENTS.md`, `.agents/skills/meal-match-chief-of-staff/SKILL.md`, `brain/README.md`, `brain/STATE.md`, and this plan before work. For implementation, also load the installed `meal-match-idea-review` skill as directed by the project skill. If user explicitly invokes MealMatch delivery, use that skill's mode/scope contract.

The canonical application is an older dirty baseline. Do not use its source as the migration base merely because it is the current directory. At planning time:

- `.handoff-worktree` is detached at `e02b38d9f988b9a3cc8e70c52e894a998db2a3a5`, the last locally verified master snapshot.
- `.notion-worktree`, branch `codex/notion-recipes`, starts from that commit and contains important uncommitted/untracked Notion implementation and tests.
- `.notion-worktree` has a working preview and private ignored database/key material. The latest recorded full verification was 100.6 seconds. That historical result does not verify new migration code.
- Existing family and Notion previews use different local ports/databases. Do not stop, reuse, overwrite, or test against them.
- The repo has many unrelated local changes and worktrees. Preserve them. Do not clean the checkout, reset branches, or copy whole old worktrees over new source.

First execution deliverable: record actual branch/worktree/HEAD, current remote master if available, Notion delivery state, and relevant source changes. Re-read current state rather than assuming this dated snapshot is still current. Choose an isolated `codex/cloudflare-migration` branch/worktree from the accepted complete application source.

Preferred dependency sequence: complete the existing Notion feature through its normal review/merge path if its owner is ready; then base migration on the updated master. If it remains unmerged, explicitly coordinate a recoverable source snapshot/patch or stacked branch with its owner. Account for untracked files; do not silently omit Notion. Do not merge or commit another feature merely to simplify this migration without applicable authorization. Unrelated dirty canonical files are not an integration source.

The incoming agent may become canonical memory coordinator after this planning chat hands off. Workers only return proposed memory updates; one coordinator owns State, IDs and integration. Use the project's economy/model-routing rules. Default to one implementation writer for this coupled backend change, plus one independent reviewer with high reasoning for auth/persistence/concurrency. Parallelize only truly independent, file-owned work after contracts are settled.

## 3. Defaults that avoid another architecture discussion

| Area | Planned default |
|---|---|
| Hosting | One Cloudflare Worker per app/environment, Static Assets + same-origin API |
| Frontend | Existing React 18 + TypeScript + Vite + existing PWA |
| API | Retain Express through Cloudflare's Node adapter if the compatibility proof passes |
| Database | D1 with explicit SQL migrations and prepared statements; no ORM added by default |
| Auth | Existing accounts, bcrypt hashes, cookie-session behavior and D1 session storage |
| Identity sharing | Independent app accounts for now; no centralized sign-in project |
| Protection | Application ownership checks; preserve public invite flows; no blanket Access login |
| Environments | Local emulated D1, one isolated staging Worker/D1, one production Worker/D1 |
| Deployment | One GitHub Actions pipeline, Wrangler pinned in lockfiles; no parallel automatic Cloudflare Builds deployment |
| Initial URL | Stable provider URL unless an existing/custom hostname is deliberately chosen |
| Runtime storage | D1 only for app state; no filesystem database, in-memory accepted state, or session cache |
| Scheduled work | One bounded cleanup task if needed for sessions/staging records; no new product sync/notifications |
| Backups | D1 Time Travel plus private portable exports and a demonstrated restore |
| Plan/cost | Design for Workers Paid, roughly $5/account/month base plus usage; user must accept any paid upgrade |

The $5 is shared account base cost, not a per-app fixed charge or guaranteed total ceiling. Domain registration, messaging, third-party services and future large workloads are separate. Do not add Postgres, Redis, KV, Queues, Durable Objects, an auth subscription or infrastructure framework without a demonstrated requirement. R2 is an optional Cloudflare-only backup destination if selected and authorized; do not provision it speculatively.

Do not maintain permanent Node/sql.js and Workers/D1 production implementations. A temporary legacy adapter/test comparison is acceptable during migration; final normal development/testing must exercise Workers/D1. Keep sql.js only as a migration fixture/export tool if it remains useful outside production.

## 4. Verified source map

All paths in this table are relative to the chosen application worktree. Inspect current versions before editing.

| Files | Current role | Required treatment |
|---|---|---|
| `server/src/index.ts` | Express creation, middleware, session store, static serving, startup migrations, listener | Separate app construction from runtime; add Worker entry; Static Assets serves frontend; remove runtime filesystem init |
| `server/src/db/schema.ts` | Global sql.js database, create/migrate schema, sync queries, file export/atomic rename | Replace runtime access with async D1 repositories; extract reviewed numbered SQL migrations |
| `server/src/routes/{auth,meals,sessions,swipes,quick-session,plans,notion}.ts` | HTTP contracts, ownership, reads and multi-step mutations | Await D1 access; move dependent operations into explicit atomic domain operations |
| `server/src/services/sessionStore.ts` | Durable SQLite login sessions, touch throttling | D1 async Store callbacks; durable/revocable sessions; keep cookie behavior |
| `server/src/services/{matching,food-options,recipe,library-transfer}.ts` | Ranking, modes, recipes, transfer rules | Keep pure logic where possible; async callers; preserve formats/ranking |
| `server/src/services/{notion-reader,notion-credentials}.ts` | Bounded direct Notion API reads, AES-GCM credentials | Worker-compatible APIs; retain parser/limits/ciphertext compatibility; no runtime key file |
| `server/src/types.ts`, `client/src/api/client.ts` | API and database types | Preserve public payloads; deliberately type anonymous ownership/schema changes |
| `client/public/{sw.js,manifest.webmanifest,offline.html}` | Online-first PWA, public-only cache | Preserve cache privacy, deep links, update behavior and offline fallback |
| `client/vite.config.ts`, package scripts/lockfiles, tsconfig | Build/dev flow | Add Worker bundle/types/local emulator without needless frontend changes |
| `server/src/test/{setup,http}.ts`, server tests | sql.js fixture isolation and HTTP harness | Replace with real local D1/Workers integration fixtures; keep meaningful assertions |
| `playwright*.ts`, `e2e/` | Browser lifecycle/storage/phone checks | Isolated Worker runtime + static assets and emulated D1; never production bindings |
| `scripts/{verify,production-smoke,audit-adversarial,delivery-handoff,delivery-contract}.mjs` and tests | Full verification, runtime smoke, mutation detection and source-bound handoff | Make shipped Worker artifact and D1 semantics authoritative; preserve all gates |
| `railway.json`, `build.sh`, repository docs | Legacy deploy/build route | Retire Railway-specific active instructions after Cloudflare launch is proven |

Important correction: latest master and Notion sources already use a SQLite-backed session store. The canonical guide's memory-store statement is stale for those versions. Update durable documentation to the final architecture rather than carrying that claim forward.

## 5. Phase A — inventory and compatibility proof

Complete this before converting every route. Record evidence, not assumptions.

1. Inventory all database calls, raw SQL mutations, disk imports, filesystem/Node-only APIs, process globals, session callbacks, middleware, configuration and error handling. Check source imports, not just production package names.
2. Build the smallest local Worker using the existing Express major version, Cloudflare's Node compatibility adapter and a local D1 binding. Pin a tested Wrangler version and compatibility date. Preserve reproducible npm lockfiles.
3. Prove real HTTP routing, JSON parsing (including existing 5MB library-import limit), async errors, session cookie read/write, HTTPS cookie/proxy behavior and D1 persistence. Express 4 async handlers require explicit rejection forwarding or caught errors; a simple added `async` is not enough.
4. Prove bcrypt verifies a legacy cost-10 hash and produces a usable new hash within selected Paid CPU settings. Measure CPU separately from time waiting for network. Do not weaken password hashing to fit Free. Add bounded authentication abuse protection using Cloudflare/D1 capabilities only as needed; do not rely on process-local counters.
5. Prove AES-256-GCM decrypts a synthetic legacy `v1` ciphertext with identical nonce/tag/host-associated-data conventions. Check random APIs, Buffer, crypto and AbortController support actually used by Notion. Never put a key/token in output to prove it worked.
6. Prove D1 batch rollback, commit-time assertions, foreign-key behavior, representative JSON/set-based inserts and the large-import strategy described below. Test supported JSON SQL functions before designing around them.
7. Prove static routes `/week`, `/shopping`, `/recipes`, `/join/...` and `/results/...` serve the SPA while `/api/*`, including unknown paths and browser navigations, always receives API handling/JSON errors.

Exit: a short compatibility report, exact tested versions, supported architecture and any bounded blocker. Prefer the smallest Express adaptation. A framework replacement is a fallback only after a demonstrated incompatibility, not a prerequisite. Resolve the blocker before broad migration; do not open a second hosting comparison.

## 6. Phase B — schema and a safe data import design

### Baseline and migrations

Create numbered D1 SQL migrations under a single documented directory, with a baseline reflecting the accepted complete source, followed by migration-specific changes. Construct parent tables before dependent inserts. The same migration chain must initialize new local/staging/production databases; no special first-request schema creation. Use D1's migration ledger; do not insert fake entries to conceal schema mismatch.

Expected business tables include `hosts`, `meals`, `meal_ingredients`, `sessions`, `session_meals`, `participants`, `swipes`, `session_history`, `dinner_staples`, `recurring_groceries`, `login_sessions`, `plan_entries`, `shopping_items`, and, if Notion is integrated as expected, `notion_connections`, `notion_recipes`. Inventory actual tables/columns/indexes and later additions; this list is not permission to discard unknown data.

Keep numeric flags and votes, nullable recipe fields, ordered free-text ingredients, archived records, existing IDs, dates, pick counts, snapshots, history, Notion mappings and ciphertext. Preserve recurring-grocery uniqueness by host/week/template. Do not add cascading deletion that rewrites history.

### Foreign keys: a known required compatibility change

D1 enforces foreign keys; current sql.js setup does not explicitly enable enforcement. Current anonymous quick sessions assign `host_id = temp_<creatorToken>` without creating a `hosts` row, despite host foreign-key declarations. A straight schema/data copy will therefore fail for valid existing app behavior.

Preferred minimal design: nullable host ownership for anonymous `sessions` and temporary `meals`, retaining valid host foreign keys for authenticated records. Keep creator-token authorization and public payloads compatible. Convert only proven anonymous sentinel relationships during import, retaining original IDs and tokens; never create fake login accounts to satisfy constraints. Update DB types and all owner checks so null never grants library access or ownership. Keep `participants.host_id` optional as it already is.

Preflight must identify every missing parent, including sentinels and unexpected orphans. Verify candidate anonymous rows consistently belong to the same anonymous session/token context; do not classify arbitrary missing host IDs as anonymous. Produce a private transformation report and dry-run fixture. Unexpected violations block import for a specific resolution; never delete rows, disable enforcement globally or invent owners to make the check pass. Other FK/deletion-order issues may exist; test all CRUD flows under actual D1 enforcement.

Also inspect ordering based on implicit `rowid`. `readWeek` currently uses it for ordering ties. Preserve relative ordering through explicit import order or a deliberately migrated stable ordering column, then test it; equal business values with changed row order may still be a user-visible regression.

### Administrative migration is different from a library transfer

The app's versioned library JSON intentionally omits ownership, IDs, history, sessions, archived rows and credentials. It is not a full backup or a valid whole-app migration path. Build a private one-time migration tool that reads a consistent copy of the actual SQLite source, validates it and creates a D1-compatible data import using safe quoting/serialization. Do not rename/upload a binary SQLite file as if it were SQL.

Apply the reviewed target schema first; insert transformed data in FK-safe order. Isolate schema creation from business-data import, and do not copy legacy migration metadata into D1's ledger. Tools must default to dry run/local targets, require explicit named remote environment/database targets, and refuse a nonempty target or ambiguous source unless an explicitly designed recovery mode applies. Never empty production automatically.

A rehearsal report must compare per-table counts, primary/foreign-key relationships, ordered ingredients, ordered planning/shopping data, numeric votes, archived metadata, history and private Notion mappings. Use canonical sorted per-table/record hashes locally, with exact exemptions for documented transformations, timestamps generated by the migration itself and intentionally expired session rows. Counts alone are insufficient. Do not print credential fields, tokens, session IDs or private record contents in ordinary logs/CI artifacts.

Exit: empty-database migrations pass; repeat migration invocation is a no-op; fixture upgrade and copied-real-data rehearsal pass; `foreign_key_check` is clean; restore from a private export is demonstrated.

## 7. Phase C — asynchronous D1 access and atomic domain operations

Use a small typed repository layer with async `one`, `all`, `run` and explicit batched domain mutations. Prepared statement parameters must remain bound; safe handling of null, booleans and numbers is mandatory. Preserve API names/status codes/response shapes unless a deliberate contract change is documented with client/server/types/tests together.

Inject environment/database access through request-safe dependencies or a correctly scoped Cloudflare binding access pattern. Never place per-request host identity, mutable transaction state or test/production bindings into a shared global. Do not serialize requests by an in-memory mutex: different isolates do not share it.

### Transaction rules

- D1 `batch` offers an atomic SQL transaction. It is not an interactive JavaScript transaction callback. Do not split `BEGIN`, reads, network awaits and `COMMIT` over independent D1 calls.
- Do not port sql.js snapshot-and-compensate helpers. Restoring an old snapshot after an `await` could erase another user's accepted writes. D1 rollback handles definite database failure within the batch.
- Validate request structure first, then recheck mutable authority/state inside the committing SQL operation: host ownership, session still open, meal still eligible, source revision unchanged and lock owner still current.
- An `UPDATE` affecting zero rows is not a SQL error and does not automatically roll back subsequent statements. Every conditional mutation must explicitly prevent all dependent effects or use a tested SQL assertion/constraint that aborts the batch when the predicate fails. Map conflicts to the appropriate existing/client-understood error.
- Optimistic revisions and compare-and-swap guards are appropriate when planning a mutation requires async reads. Increment the relevant revision for every competing mutation, including routes that change session meal pools or Notion-linked meals. Document the participating routes; a lock held by one endpoint is insufficient if another ignores it.
- Prefer operation-scoped staging/guard rows and checked assertions over generic dynamic SQL magic. Test the exact guard mechanism on the real D1 binding. A guard CHECK/trigger failure must abort all writes; a no-op guard must not allow later inserts to commit.
- Separate definite rollback errors from an interrupted/ambiguous response after commit. Never promise “unchanged” merely because the HTTP response was lost. Preserve explicit ballot retry behavior; reconcile accepted state and use scoped idempotency keys/operation receipts for operations where retry could create duplicates. Bind any receipt to host/resource/request digest, never let a client key bypass authorization.

### Domain acceptance requirements

| Domain | Atomicity and concurrency requirement |
|---|---|
| Registration/preferences | Unique email enforced by DB despite concurrent register; proper API error rather than uncaught constraint failure; onboarding bool consistent |
| Quick session | Session, temporary options, pool rows and creator participant appear together or not at all; unique-code collision retries bounded and transactional; anonymous token remains secret |
| Authenticated session | Validate every option/type/owner/current archive state; session and fixed pool committed together; no half-created session |
| Join | Closed-session rejection and participant creation based on commit-time status; preserve invite/storage recovery behavior |
| Ballot replacement | Exactly one vote 0/1/2 per fixed pool option; validation before mutation; delete/insert/submitted state atomic; closing versus submitting yields one coherent ordering |
| Close | Cover both `POST /api/sessions/:id/close` and `POST /api/close-session/:sessionId`; preserve each route's applicable authorization, with commit-time checks and equivalent race protection. No voter identities to anonymous creators; closed state and result visibility consistent |
| Final selection | Closed session; selected option belongs to pool; same selection retry does not double count; conflicting selection rejects; selection, pick-count increment and one history row atomic |
| Meal CRUD | Owner/type checked in committing operation; ingredient order and null/omitted metadata preserved; parent/ingredients/onboarding changes atomic; referenced history preserved |
| Library import | Preserve preview, duplicates and invalid-row reporting. Existing parser selects valid/ready rows; keep that policy. The chosen ready set commits together or not at all; do not convert policy to reject-all or silently accept partial database writes |
| Plan/shopping | Host/week ownership, whole source snapshot and all generated rows committed together; copy/delete changes retain bought/already-have decisions exactly as existing behavior requires |
| Recurring groceries | Unique host/week/template application, including simultaneous apply; edits/deletes never rewrite existing shopping snapshots or resurrect cleared states |
| Notion | Validated entire refresh, connection/mappings/meals/ingredients/archive changes visible together; no stale sync overwrites a newer connection/library state |

Inspect every mutation, including ones that currently call `runQuery` repeatedly without a transaction. Async conversion can expose races that were less visible in synchronous handlers. This phase is responsible for making the migrated behavior coherent, not preserving an unsafe write ordering.

### Large payloads and D1 limits

Do not implement one remote query per ingredient or assume one giant `IN (?,...)` works. Current contracts include library transfers of up to 1,000 options under a 5MB body limit, selection of up to 500 recurring templates, and Notion limits of 100 recipes, up to 1,000 ingredients per recipe, plus aggregate read/block/time limits. Determine their combined accepted envelope from code; the per-recipe maximum is not an aggregate maximum.

At research time D1 permits 100 bound parameters per statement, 100KB SQL text, 2MB individual value/row size, and 1,000 queries per Paid invocation. Batch use does not erase per-statement limits. Use bounded prepared statements, supported JSON/set-based SQL and, where necessary, hidden operation-scoped staging chunks. Chunk ingestion is not permission to expose partial library updates. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

For staged imports: validate all content; store chunks tied to a unique owner/operation; verify completeness/digest/current authority; atomically publish to live tables using a bounded final batch; mark completion/receipt; garbage-collect abandoned staging later. Live reads must exclude staged data. Fence cancellation/expired locks before activation. If a whole accepted request fits one proven atomic batch, prefer that simpler path. If it does not, prove staging scales to the existing accepted envelope or document a specific unresolved incompatibility; do not silently lower accepted limits or split the visible commit.

## 8. Phase D — authentication, private data and Notion

### Sessions and secrets

Keep existing account IDs and bcrypt password hashes. Implement an async D1-backed `express-session` Store with correct `get/set/touch/destroy` callback completion and errors, expiry indexing and bounded cleanup. Preserve 30-day rolling behavior and touch throttling; avoid writing on every polling request. Test simultaneous touches/logout so stale touches do not recreate a revoked login.

Regenerate the session identifier on successful authentication where needed to avoid session fixation, and await session persistence before reporting a usable successful login. Confirm logout clears/revokes the right session. Do not add a separate identity provider.

Production must reject a missing/default `SESSION_SECRET`; remove reliance on the development fallback. A missing Notion key must prevent connection/decryption with a clear private error, while ordinary non-Notion app use can remain available. Read secrets from Worker bindings; do not use local key files or put secrets into Vite variables, assets, manifest, build output, logs or URLs. Keep development and staging credentials separate from production.

| Setting | Source/handling |
|---|---|
| `DB` | Environment-specific D1 binding; IDs/names are config, not authentication secrets |
| `SESSION_SECRET` | Strong stable Worker secret; preserve existing value only when preserving same-origin cookies is intended |
| `NOTION_ENCRYPTION_KEY` | Stable original base64 32-byte key for imported ciphertext; scoped secret, privately backed up |
| Cloudflare account identifier | CI/config metadata, confirm intended account |
| Cloudflare deployment API token | Minimal needed account permissions, stored in secret manager/CI; never frontend or repository |
| Environment/version/maintenance settings | Nonsecret values; explicit staging/production configuration |

Do not rotate the Notion key during migration. Its current AES-GCM AAD includes the host ID, so copying encrypted data requires retaining host IDs and key together. Use synthetic compatibility tests first, then an approved private copied-data check. If the original key cannot be recovered, preserve ciphertext and recipe data; report the precise reconnect requirement. Never replace it and claim connections survived.

Same-origin cookies should remain HttpOnly, Secure on HTTPS, SameSite=Lax, with deliberate proxy handling. Do not trust client-supplied forwarded headers blindly. Verify actual Worker adapter behavior, not Express assumptions about Railway. Use standard same-origin protections for authenticated mutations, preserve intended public API usage, and avoid treating CORS as authorization. Private API responses and errors use `Cache-Control: no-store`; no CDN caching of authenticated state or token-bearing quick-session responses.

### Notion refresh

Preserve direct per-account read-only Notion access, supported recipe format, source badges/edit links, Notion/Regular tabs, explicit Refresh, useful format errors, unchanged cached data on validation failure, and no AI dependency. Do not schedule automatic recipe refresh as part of hosting migration.

Replace the process-local `busy` Set with a D1 lease or equivalent durable concurrency guard per host, with unique operation token, expiry, conditional release, and commit-time fencing. Expiry must exceed the bounded operation or be safely renewed; an old request must never commit after a newer request acquires the lease. Connect, refresh and disconnect all participate. Avoid holding a database transaction during upstream network requests. Recheck connection revision and open-session eligibility inside final activation; creating a session concurrently must not bypass the changed-recipe guard.

Keep the reader's actual deadline, request count, total/per-response byte limits, retry-after handling, source-change checks and ordered parsing. Include parser, serialized data and staging memory in the Worker memory budget. Waiting for Notion and consumed CPU are different limits. Test cancellation and upstream slowness; `waitUntil` is not an unlimited durable job runner. If the synchronous supported workflow cannot be preserved under measured platform limits, checkpoint the specific issue before introducing Queues/Workflows and a changed UI contract.

## 9. Phase E — frontend, PWA, origin and runtime delivery

Serve Vite's built assets directly, with `/api/*` forced to the Worker before SPA fallback. Add an explicit API not-found handler. Test top-level `/api` and missing subroutes too: HTML returned to the JSON client can look like an authentication or parsing bug. Exclude asset requests from session middleware when possible to avoid unnecessary D1 access.

Keep hashed assets cacheable; make HTML, service worker and manifest refresh appropriately. Preserve the existing service worker's public-only cache: no recipes, library exports, credentials, account data or API results in Cache Storage. Test both a new install and update from a previous service worker. Maintain manifest scope/start URL/icons and deep-link refresh on a phone-sized viewport.

An origin change cannot automatically carry host-only cookies, localStorage, sessionStorage, service-worker installation, swipe drafts or existing installed PWA identity. Database import alone cannot preserve them. Determine whether an existing hostname can be retained before choosing the final URL. If hostname changes, explicitly communicate one-time sign-in/bookmark/PWA reinstall and new invite URLs; prefer finishing active voting sessions first. Do not promise draft continuity across origins or copy secrets between origins through URL parameters. Preserve storage keys/contracts on the same origin. Any optional draft-transfer feature is separate scope.

Default to a stable provider URL without buying a domain. Existing custom-domain reuse may be preferable for continuity if ownership/routing is known. A domain choice is only required before final launch, not to build and test the migration locally.

## 10. Phase F — verification migration and release gates

All new verification must exercise the actual Worker bundle and real local D1 implementation. SQL mocks alone cannot establish transaction rollback, FK behavior or concurrency. Keep pure parser/ranking tests fast. A suitable approach is the Workers Vitest integration for binding-level tests plus isolated Wrangler/Miniflare HTTP servers for browser/production checks; prove chosen tool versions work with the repository's existing Vitest before upgrading deliberately.

Adapt, do not bypass:

- Root `npm test`, client lint, client production build, Worker/server type-check and production bundle.
- `npm run verify`: retain full suites, source-bound runner/handoff checks, isolated ports/state, no server reuse, report integrity, no missing/skipped/flaky tests/retries, cleanup checks and the under-120-second total budget.
- `scripts/production-smoke.mjs`: run built frontend plus shipped Worker with a fresh local D1 store; verify assets, deep links, JSON API, secure session behavior and durable state after restart. A Node server smoke is not proof of the Worker release.
- `scripts/audit-adversarial.mjs`: update exact source anchors to the migrated code and preserve mutation strength. Replace obsolete “skip filesystem rename” with a real D1 atomicity/durability failure mutation. A compile error or missing anchor is not a caught behavior defect.
- `server/src/test/setup.ts`, Playwright and runner fixtures: no inherited remote bindings, no developer DB, unique emulator state directory per run/file as appropriate; migrations applied to each fresh isolated store. Ensure worker process cleanup cannot kill a preview.
- `docs/verification.md`, `AGENTS.md` and scripts: replace filesystem-specific runtime invariants with D1 equivalents, while retaining the existing requirements for correct votes, privacy, ownership, atomicity and recovery.

Do not keep a passing legacy sql.js suite as a substitute for D1 coverage, or lower test floors to conceal dropped cases. Optimize fixture reuse, batching and bounded workers if the complete new suite misses the budget. Live network rehearsal and phone testing can be separate bounded release evidence because they are external; do not use that distinction to remove local behavioral gates. Seek a specific decision only if the required local budget truly cannot be met without changing policy.

### Required regression matrix

| Area | Required evidence |
|---|---|
| Data migration | Fresh schema and copied legacy schema; sentinel transformation; unknown orphan refusal; FK check; exact values/order; Unicode, quotes and multiline free text; partial import failure never used as production |
| Durability | Create/modify data, stop local Worker, restart using same emulated D1 state; all accepted data survives; successful remote staging write survives Worker redeploy |
| Accounts | Register/login/logout/reload; ownership across two hosts; default secret rejected; session survives redeploy; expiry/revocation; concurrent duplicate register; stale touch versus logout |
| Anonymous flow | Both modes; unique invite code; autojoin; wrong/missing/cross-session creator tokens rejected; null ownership not exposed as private-library access |
| Voting | 0/1/2 only; invalid/duplicate/missing/extra choices preserve accepted ballot; injected failure at a late statement rolls back; same-participant competing edits resolve coherently |
| Races | Submit/join versus each close endpoint (`/api/sessions/:id/close` and `/api/close-session/:sessionId`); simultaneous closes across both routes; select same/different winner concurrently; library edit/archive versus session creation; Notion refresh versus new session; concurrent import deduplication |
| Privacy | Host flag alone never exposes voters; anonymous close response private; notes/recipe/time/effort/Notion keys absent from all public payloads and caches; logs scrubbed |
| Planning | Copy/source snapshot integrity; concurrent changes do not lose unrelated rows; recurring apply twice/concurrently yields one snapshot per template; bought/already-have retained |
| Bulk limits | Existing valid large library and Notion fixtures; 500-template apply; >100 IDs where accepted; D1 query/parameter/row constraints measured; incomplete staging invisible; abandoned staging recoverable |
| Notion | Real staging connection/refresh with approved access; ciphertext compatibility; ordered recipes; malformed source preserves last accepted library; no failed replacement credential saved; lock expiry/fencing and disconnect races |
| Browser storage | Existing draft cursor/Back/edit recovery; accepted choices retained; retry explicit; authenticated navigation/polling; refresh on all routes; phone screenshot inspection |
| PWA | HTTPS install assets; existing service-worker update; public offline fallback; private APIs never cached; origin-change expectations documented |
| Pipeline | Failed verify prevents deployment; failed migration prevents code release; correct environment targeting; serialized release; exact candidate SHA; staging cannot mutate production |
| Recovery | Prior code version rollback with compatible schema; D1 export restored to isolated database and read through app; restore with original Notion key; no claim that code rollback restores data |

Add meaningful tests next to affected code. Extend adversarial checks for commit guards/concurrent duplicate effects when those risks expose coverage gaps. Keep a source-to-test migration checklist so historical tests are accounted for individually.

## 11. Phase G — Cloudflare resources and automated deployment

Prepare all config/workflows/runbooks locally before cloud setup. Use GitHub Actions as the single delivery authority, not both Git-connected Cloudflare auto-deploy and Actions. Do not assume branch protection, environment approval features or CI allowances are configured; discover actual repository/account capabilities. Do not buy CI minutes to finish a run.

### Resource isolation

- Distinct named staging and production Workers and D1 databases. Specify each binding explicitly; Wrangler environment settings/bindings do not all inherit.
- Local commands default to local D1. Every remote command carries an explicit environment and validated expected account/database identity. Show nonsecret target names before a mutation; never rely on an inherited default remote binding.
- A version-preview URL does not by itself give a separate database. Use the staging Worker/database for staging tests and explicitly protect preview data. Disable production version-preview exposure unless its binding/auth behavior is understood.
- Use synthetic staging data first. A private copy of family data is not appropriate on an anonymous public demo; maintain app auth and controlled staging access. Use Cloudflare Access only for staging if convenient, with documented testing access.
- Store deployment tokens in scoped CI secrets. Check provider permission granularity rather than promise per-database token isolation if unavailable. Restrict account scope and repository workflow access; keep untrusted fork/PR code away from deployment secrets and production.

### Pipeline behavior

PR checks run the complete local verifier. Only trusted code with applicable authority can deploy staging. Production releases use the exact verified commit/artifacts from the accepted production branch, currently master. After initial production deployment is authorized, proposed steady state is automatic releases of verified merged changes; configure that standing authority explicitly rather than requiring a new user click for each normal release.

Release order: verify/build once → deploy/migrate staging → staging smoke → record production recovery point/export → apply backward-compatible production migrations → deploy Worker/assets → bounded health/read-only smoke → report commit, deployment version and URL. Keep secrets out of build artifacts. Ensure bundle/static artifacts, binding configuration and migration files all correspond to the same SHA; changing config invalidates the relevant evidence.

Serialize releases per environment. Never cancel a release in the middle of a database migration to start a newer one. Safe cancellation of obsolete read-only test jobs is separate. Do not automatically retry a partially ambiguous write/import or migration without checking its ledger/state. Secrets commands may themselves create and deploy versions; bootstrap/release scripts must account for that rather than unexpectedly publish a partial configuration.

Use additive expand-then-contract schema changes so old/new code can overlap safely during deployments and code rollback remains possible. Avoid destructive migrations in the launch batch. Migrations run in the release job, not on requests. An intentional failing migration must prevent the Worker deployment and leave a clear recoverable state.

Health checks should establish Worker availability and DB/schema compatibility without leaking data. Keep public health output minimal; deployment metadata and diagnostics can be private. Use synthetic isolated records for write checks, with scoped cleanup; never modify family shopping or recipes as a smoke test. Test login and Notion writes in staging, then use approved minimal production checks.

### Reproducible commands to implement

The names below are proposed interfaces, not scripts that exist today. The implementing agent should supply and test them or document equally clear equivalents.

| Command/interface | Required behavior |
|---|---|
| `npm run dev` | Starts current app on local Worker + local D1 with predictable ports and no remote access |
| `npm run verify` | Full authoritative isolated verification under current project policy |
| `npm run build` | Reproducible frontend/Worker build without reinstalling dependencies implicitly |
| `npm run db:migrate:local` | Applies checked-in migrations to explicitly local state |
| `npm run migration:preflight -- --source <path>` | Read-only source inspection and private report; no upload |
| `npm run migration:rehearse -- --source <copy> --target <isolated-target>` | Transform/import/compare with source/target guards and recorded results |
| `npm run deploy:staging` | Explicit target, migrations and verified deploy; no production binding |
| `npm run deploy:production` | Validates authority/target/candidate and follows serialized release sequence |
| `npm run backup -- --env <name>` | Private portable export plus nonsecret manifest; never a public artifact |
| `npm run restore:rehearse -- --backup <path>` | Restore into new isolated target, compare and app-read validation |
| `npm run smoke -- --url <url>` | Bounded non-destructive checks; explicit staging-only options for synthetic writes |

Use structured arguments and proper Windows quoting. No secrets on command lines or commands built by interpolating untrusted paths. Never prescribe raw destructive reset/drop commands as routine recovery. Document actual remote-mutating commands and exact targets at handoff.

## 12. Phase H — data source selection, rehearsal and cutover

### Required facts before any real import

Discover whether Railway actually has a running deployment, its current source/version, URL, persistent volume, database path, real user data, billing and any scheduled/automatic deploys. Current planning has not inspected that account. “Configured for Railway” does not establish a running production app. If none exists, this is first cloud launch from an accepted local database, not a Railway production cutover.

Identify the authoritative data source with Zach or its current owner. The Notion preview database is a copy of family data plus real connection state and isolated QA accounts; do not automatically promote every preview/test record to production. Existing local databases and .notion-key files must not be guessed by filename, printed, overwritten or included in Git. Compare inventories privately; distinguish actual family records from QA and preserve all source backups. Removing QA data from an import requires an explicit, reviewable selection rule; do not clean the source.

Record chosen source path/service, consistent-snapshot method, file hash/time, schema fingerprint, source version, private backup location, needed secret provenance and expected transformations. Keep raw data/keys outside repository history and CI artifacts.

### Rehearsal

1. Copy a consistent source snapshot without changing the original. For the existing sql.js runtime, coordinate a short write pause/stop on that particular source to eliminate an export race; never kill unrelated preview processes. Where a live SQLite tool is used, follow its supported consistent backup method.
2. Preserve the original file and encryption key independently. Generate a portable private export; test that it can be read before relying on it.
3. Run the source preflight, transformation and import into disposable local D1. Record comparison/FK checks; source hash remains unchanged.
4. After hosted staging is authorized, repeat on isolated staging, with controlled access and secrets. Prove actual TLS cookies, persistence across redeploy, accepted data, phone deep links and the real direct Notion refresh. Never substitute the chat connector's credentials for MealMatch's integration token.
5. Restore a staging export into another isolated local/D1 database, compare it and open it through the app. Confirm encrypted Notion data can be read with the intended key without logging the token.
6. Record measured durations, critical CPU/query usage, memory/payload envelope, any data transformations and exact release SHA. Resolve every blocker before launch. No exact calendar estimate is promised before this rehearsal.

### Launch readiness package

Give Zach a concrete candidate URL, passed-verification evidence, source-data selection, comparison summary, expected origin/login/PWA effects, ongoing cost configuration, exact production actions and recovery plan. Account login/token authorization, any Paid upgrade, new service resources, DNS changes and first production publication need applicable explicit authority. Do local prep while missing account access; bundle the genuinely necessary user actions rather than repeatedly asking for routine choices. This plan itself does not authorize spending or publishing.

### Cutover sequence

1. Verify the frozen candidate and staging evidence still match. Check no newer source data/schema/code has appeared since rehearsal.
2. Establish a short maintenance window/write freeze on the authoritative source; finish active sessions if practical. Keep reads available only if their side effects (session touches etc.) are understood. Do not permit dual writes to old/new databases.
3. Take the final consistent backup, export, nonsecret manifest and original key custody record. Re-run preflight and data comparison on the final snapshot, not only yesterday's rehearsal.
4. Create/apply schema to the intended empty production database and import final data. If import fails partway, keep traffic off, inspect/quarantine the target and recover using the tested import procedure. Do not expose a partial target or restart by blindly dropping tables.
5. Verify schema/FKs/counts/canonical hashes, key compatibility and user-owned data. Record production recovery information.
6. Deploy the approved Worker/assets with stable secrets and correct DB binding. Keep it in maintenance/restricted mode until validation passes; import/maintenance paths are administrative only, never anonymous public endpoints.
7. Switch the chosen hostname/URL or publish the first cloud URL. Enable writes at only the new authoritative origin; keep the old source frozen. Allow for DNS propagation if applicable. Old QR/invite links and installed PWAs must have an intentional transition.
8. Run bounded smoke checks, log in, view plan/shopping/recipes, confirm no token/recipe leakage, and perform the agreed minimal live Notion check. Report actual URL, release SHA/version, migration version and any one-time login/PWA action.
9. Observe the first real family use and subsequent deploy for regressions. Proposed acceptance window is seven days including a routine meal/shopping cycle; adjust to actual use rather than declare success on elapsed time alone. This document does not configure a watcher or recurring chat task.

## 13. Rollback and recovery runbook requirements

Distinguish four situations:

| Situation | Action |
|---|---|
| Before public switch or before new writes | Keep source authoritative/frozen as appropriate; disable new target traffic, diagnose, and retry from verified snapshot; no data reconciliation required if new target had no accepted user writes |
| Code/config defect, compatible D1 schema | Deploy known-good Worker/assets/config version against current D1, preserving all new writes; re-run smoke |
| Data corruption or incompatible schema | Freeze new writes, take a forensic/export copy and current recovery bookmark, identify last good point; prefer forward repair, or restore into isolated target first; quantify data written since recovery point before any production restore |
| Desire to return to old source after Cloudflare writes | Do not simply switch back: old data is stale. Reconcile/export all accepted new data first or explicitly obtain a reviewed data-loss decision; preserve both stores and secrets |

A code rollback does not roll back D1 data. Time Travel restores database state, not encrypted secret keys or browser storage. Backup exports contain private data, including session material/ciphertext; protect them accordingly. Keep the stable Notion key separately with tested recovery instructions. Define who can recover it and where, without embedding its value in the runbook.

Do not auto-restore production on a failed smoke check. A health failure after deployment can be a configuration problem; blindly reverting data may destroy legitimate new writes. Back up current state before a repair. Retain original source snapshots and migration manifests through acceptance; no source deletion or service cancellation unless separately authorized.

After acceptance and authorization, disable Railway auto-deploys and unnecessary paid services, remove active Railway configuration/instructions, revoke obsolete deployment credentials and report actual resulting charges. Verify what exists first. Preserve private recovery copies; do not destroy Railway volume/data to demonstrate completion.

## 14. Cost controls and ongoing operation

Use the selected Cloudflare account as the shared platform for future apps, each with its own Worker/database/secrets. Check current pricing/limits at execution: the research basis is Workers Paid $5/account/month minimum plus usage, not a guaranteed $5 total. Free has 10 D1 databases and tighter CPU/request limits, so it is not the assumed long-term portfolio configuration.

Configure supported usage alerts to the user's chosen channel with applicable authority, bounded CPU limits justified by measured auth/import needs, indexes, sane payload limits and throttling for expensive public endpoints. Billing alerts are not a universal hard spending cap. A per-invocation CPU cap cannot cap total account requests/spend. If a provider cannot enforce a requested hard dollar cap, state that plainly.

Avoid write amplification from session polling and N+1 library/ingredient queries. Read account/D1 usage after representative family use and after initial apps are added. Record CPU time, requests, rows read/written, storage, backup usage and failed requests; do not infer ongoing cost from build success. Keep logs small and redact secrets, cookies, private recipes, raw database errors and token-bearing request bodies. Retention changes may affect pricing; recheck current docs.

Portable exports: create one before every production schema/data migration and on a proposed daily schedule once an approved private destination exists. Prefer a bounded Cloudflare-only solution if unattended storage is required; use Time Travel meanwhile and document any portable-export scheduling gap honestly. Do not put exports in publicly retained CI artifacts or treat an unconfigured scheduled backup as present. Rehearse restoration after the first scheduled export actually runs.

If cleanup cron is added, bound deletes by age/limit and scope to expired sessions, operation receipts and abandoned hidden staging only. Preserve accepted business records/history. Jobs must be idempotent and safe to overlap/retry, with UTC schedules and explicit America/New_York user-facing descriptions. No automatic Notion sync or notifications are included.

## 15. Reusable pattern for the next app

Once MealMatch works, extract a small checked-in starter/runbook or template copy procedure: React/Vite assets, Worker API entry, D1 migrations, account/cookie scaffolding where appropriate, isolated local tests, environment config, CI release, backup/restore, secret names and basic operational checks. Keep it separate from MealMatch's private data and product schema. Remove app-specific domains, DB IDs, credentials and fixtures before copying.

Do not build a multi-tenant platform, centralized user directory or deployment control panel as part of this migration. Future apps can share infrastructure conventions without sharing databases or accounts. First prove the pattern with MealMatch; extract what was actually useful.

## 16. Milestones and completion evidence

| Milestone | Deliverable / exit condition |
|---|---|
| M0: source and data inventory | Accepted complete code baseline, isolated worktree, source-data candidates recorded, no original changes |
| M1: compatibility | Local Express Worker + D1 + cookies/bcrypt/crypto/static/API proof; rollback/guard/bulk/FK strategy demonstrated |
| M2: schema and tooling | Versioned migrations, nullable anonymous ownership design, preflight/import/compare/restore tooling passing representative fixtures |
| M3: application migration | All routes/services converted; durable sessions, atomic operations, large imports and Notion fencing implemented; API/browser contracts maintained |
| M4: complete verification | Actual Worker/D1 full verifier under120s, all regression areas and meaningful adversarial gates pass; independent review clean |
| M5: hosted rehearsal | Authorized staging, copied-data comparison, real Notion access, TLS/phone/PWA/deploy-persistence and restore evidence |
| M6: first production launch | Authorized account/billing/hosted actions; final frozen-source import, comparison, URL switch and smoke pass; recoverable copies retained |
| M7: acceptance and simplification | Real family cycle and later release pass; usage observed; approved Railway retirement; reusable runbook/template extracted |

M0–M4 should proceed locally when implementation is requested, without waiting for optional domain or account preferences. Account access may be gathered in parallel; M5/M6 remain dependent on it and applicable authorization. Review/test each milestone proportionally, then run the full verification on the integrated candidate; do not repeat unchanged full gates just to consume time.

Do not promise a fixed duration yet. The dominant unknowns are current source integration, real-data FK quality, large atomic import compatibility, actual Worker middleware behavior and access/cutover logistics. Report milestone progress and concrete blockers rather than vague percentages.

Final delivery record must include exact branch/commit/PR/merge state; actual production URL and deployment ID; database/migration identifiers without secrets; check results and timing; source-data transformation/comparison result; original backup and secret-recovery location references; measured usage; known origin/phone limitations; recovery commands; CI and backup schedule status; whether Railway is truly retired. Keep implemented, tested, merged and deployed distinct.

## 17. Handoff start instruction

The next agent should first restore project context, inspect current branch/worktree/source and Notion delivery state, read this plan and report its M0 baseline. If asked to execute, continue through local migration milestones with the smallest coherent implementation and independent review. Prepare hosted changes as a concrete verified candidate, then resolve only missing account/spending/publication authority. Keep Cloudflare as the single chosen destination. Preserve all existing data/previews and do not re-open a Railway-first strategy.

## 18. Official references and evidence limits

Checked during this planning conversation; re-open relevant pages at implementation because runtime/tool behavior changes.

- [Express on Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/): framework compatibility and Node adapter starting point; does not certify all current MealMatch middleware.
- [D1 binding and batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/): async queries and batch rollback; not an interactive transaction API.
- [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/): enforcement is on; deferral only permits temporary violations resolved within a transaction.
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/): numbered SQL files/ledger; explicit database names help prevent target confusion.
- [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/): supported SQL migration/export process.
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): request/query/payload/CPU/memory constraints to measure against actual accepted inputs.
- [Static Assets SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/): explicitly run the Worker first for API paths so navigations cannot fall through to HTML.
- [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/): environment bindings must be deliberately separated.
- [Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/): preview URLs must not be mistaken for isolated database environments.
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/): secret mutation commands can publish a version; bootstrap carefully.
- [GitHub Actions deployments](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/): official CI deployment integration.
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/): shared usage model and recovery windows.

Independent Sol-high planning review found no material gaps; its clarification to name both close endpoints and cover races across them is incorporated. No application migration, data export/import, provider account inspection, paid purchase, cloud resource creation or deployment was performed in preparing this plan. Source inspection and official documentation establish design requirements, not a passing compatibility proof. Planning notes are locally validated with `node scripts/check-brain.mjs`; app verification belongs to execution.
