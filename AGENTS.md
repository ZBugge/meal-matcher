# MealMatch repository guide

## Purpose and sources of truth

MealMatch is a collaborative meal-decision app. A group creates a session, votes on the available meals with swipe gestures, and sees ranked results after the session closes.

- Treat the implementation, tests, and package scripts as the source of truth.
- `SPEC.MD` describes the original product direction and `CLAUDE.md` contains useful historical guidance, but both predate parts of the current implementation. Do not copy their API or schema examples without checking the code.
- Keep this file focused on durable repository facts. Update it when architecture, commands, or cross-cutting invariants change.

## Current product flows

- The public home page (`/`) creates an account-free quick session. It defaults to takeout categories, still supports home meals, auto-joins the creator, stores participant/session data in browser storage, and gives an anonymous creator a secret token that can close the session.
- Authenticated hosts can register or log in, manage separate home-meal and takeout-category libraries, create sessions, monitor participants, close sessions, view voter details, and select the final option.
- Authenticated hosts can keep private recipe instructions and ordered free-text amount/ingredient rows on home meals. They can fill the editable meal form through a validated full-recipe paste format and open a read-only recipe view from their library or session results; recipe data stays out of session participant payloads.
- A new authenticated takeout library starts with a one-time onboarding choice: select popular categories or add a custom category. The dismissal is stored on the host record, and creating any takeout category also dismisses it, so onboarding does not return when the library later becomes empty.
- Other participants join through a six-character invite code. The meal pool is fixed when a session is created, but a participant can update submitted choices while the session remains open.
- Votes are numeric across every layer: `0 = no`, `1 = yes`, and `2 = maybe`. Results treat yes and maybe as acceptable, treat only all-yes as unanimous, and rank tied acceptance percentages by fewer maybes.

## Repository map

- `client/`: React 18, TypeScript, Vite, Tailwind CSS, React Router, Framer Motion, Vitest, and Testing Library.
- `server/`: Express, TypeScript, asynchronous D1 persistence, durable cookie sessions, and Vitest. `cloudflare/worker.ts` adapts Express; Worker Static Assets serves the frontend.
- `cloudflare/migrations/`: numbered D1 migrations. `migration/` contains private, local administrative import/restore tools; sql.js is a development-only legacy-source reader.
- `e2e/`: Playwright coverage for quick sessions, authenticated hosts, meal management, session lifecycle, and maybe votes.
- `agents/orchestrator/`: a separate Node/TypeScript GitHub-issue orchestrator with its own dependencies, build, tests, state database, and Claude-oriented prompts. It is not part of the MealMatch runtime or root test command. Do not migrate or redesign it as part of an application change unless explicitly requested.
- `SPEC.MD`: original product specification.
- `CLAUDE.md`: legacy agent notes; useful context, not an automatically authoritative Codex instruction file.

## Setup and development

Use Node.js 22 or newer and npm. Preserve the root, client, and server lockfiles, plus the orchestrator lockfile when its package changes. The root install command does not install orchestrator dependencies.

```bash
npm run install:all
npm run dev
npm run db:migrate:local

# Only when working on agents/orchestrator
npm --prefix agents/orchestrator install
```

`npm run dev` builds and starts one local Worker at `http://127.0.0.1:5173` with assets and `/api` at the same origin. It uses isolated `.wrangler/dev` D1 state and generated private development secrets. Restart after source edits. It never imports or opens an existing preview database. `npm start` runs the built local Worker. Vite alone is not the complete application runtime.

Worker bindings are `DB`, `ASSETS`, a strong `SESSION_SECRET`, and `NOTION_ENCRYPTION_KEY` when Notion is used. The original Notion encryption key must be retained when importing ciphertext. There is no runtime filesystem database/key fallback. Never commit environment files, tokens, databases, or private exports. Hosted targets remain unconfigured until account identity and authority are supplied; local success does not establish deployment. See `docs/cloudflare-operations.md`.

## Verification

Run checks proportional to the change. The root unit-test command covers the server and client, but not Playwright or the orchestrator.

```bash
# Complete local verification, with isolated browser servers and a five-minute safety ceiling and a two-minute performance goal
npm run verify

# Server and client unit tests
npm test

# Complete verification, including browser, production, and adversarial checks
npm run verify
npm run audit:adversarial

# Client lint
npm run lint

# Production type-check/build without reinstalling dependencies
npm --prefix client run build
npm --prefix server run build

# End-to-end tests (starts the dev servers through Playwright config)
npm run test:e2e

# Separate orchestrator checks, when agents/orchestrator changes
npm --prefix agents/orchestrator test
npm --prefix agents/orchestrator run build

# Chief of Staff notes and validator checks, when brain/ or its tooling changes
node scripts/check-brain.mjs
node --test scripts/check-brain.test.mjs
```

`npm run build` typechecks both packages and builds the frontend and Worker without installing dependencies. Direct package builds do not produce the authoritative Worker candidate. `npm run build:worker` packages current source and rebuilds stale frontend assets. Candidate receipts bind source, assets and Worker bytes.

`npm run verify` runs full suites, lint, builds, runner regressions, migration/compatibility checks, actual Worker smoke, mutation checks and every browser scenario in parallel with bounded workers. It allocates independent ports and fresh D1 state beside existing previews. Logs, timings, screenshots and reports live in ignored `.verification/`; `.verification/latest.json` points to the current run summary. Missing/skipped/flaky tests, gate failures, cleanup errors and elapsed time of 300 seconds or more fail verification; exceeding two minutes is reported as a performance miss, not a failed correctness check. See `docs/verification.md`.

Server and browser tests use disposable local D1 state and the compiled Worker. Never point a test at development, preview, staging or production state. The historical server assertion inventory in `docs/cloudflare-test-baseline.json` requires explicit one-to-one mappings for deliberate test renames.

Playwright writes to `playwright-report/` and `test-results/`. Those paths are ignored, but `test-results/.last-run.json` is still tracked from older history. Preserve any pre-existing change to that file and do not include generated test output in a feature diff.
Playwright always starts its own built Worker with per-run D1 state under `.verification/`; it never reuses a development server, including when `PLAYWRIGHT_REUSE_SERVER=1` is inherited. Keep that isolation.

## Cross-layer invariants

- SQLite booleans are numbers (`0` or `1`). Convert them to booleans at API boundaries where the client type is boolean. In JSX, do not render a raw numeric database flag with `flag && ...`, because `0` is renderable text.
- Keep the vote domain synchronized in server types and validation, matching logic, client API types, local-storage progress, swipe components, results UI, and tests. Search all vote usages before changing it.
- A session has one mode: `home` or `takeout`. Stored options have a separate type: `meal`, `category`, or the reserved future `restaurant`. Home sessions currently accept only meals, takeout sessions accept only categories, and the server must reject mixed or mismatched IDs. Do not change matching behavior based on mode.
- Host preferences stored as SQLite flags must be converted to booleans in authentication API responses. Keep their fresh-schema columns, additive migrations, API types, and client callers aligned.
- Schema changes require a new reviewed SQL migration; migrations run administratively before code release, never on a request. Keep old/new code compatible during rollout.
- All runtime database calls are asynchronous. Dependent mutations belong in a single guarded D1 batch. Zero-row CAS updates must abort the whole operation before dependent writes; never compensate with a stale application snapshot.
- Planning/session POST retries use scoped persistent operation receipts in the same atomic mutation. Keep the browser capability across failed responses and reload; clear it after acknowledged success. Anonymous quick-session retries require a random 256-bit capability; never expose receipt/token lookup through a public endpoint.
- Completed ballots contain exactly one numeric vote per session option. Validate the entire ballot before mutation and atomically replace choices/submitted state with an open-session guard. Failure preserves accepted state.
- Protect authenticated host routes with both authentication and resource ownership checks. Anonymous close operations must validate the creator token without returning or logging it.
- Login sessions use private D1 login_sessions with rolling 30-day cookies and revocation tombstones. Persistence needs the same database and SESSION_SECRET. A late set/touch must never revive a revoked or expired session. HTTPS cookie security derives from the actual Worker request URL.
- Family plans and shopping lists are authenticated host-owned data under /api/plans/:week (Monday ISO date). Adding a recipe snapshots its ordered ingredients. Removing dinner always retains purchased groceries as standalone rows and may retain all its groceries when explicitly requested; unrelated items stay intact. Mutations commit and persist once, restoring accepted state on disk failure. Quick-session options may be planned only by their authenticated owner.
- Repeating a week copies only the selected owner's dinners and their ingredient snapshots into fresh entries/items, shifts scheduled weekdays, resets grocery states to needed, and appends without replacing the destination. Bulk pantry/purchase changes validate every item before any write. Household dinner staples are private recurring ideas, distinct from shopping extras; preserve them on failed saves and across schema migrations.
- Consolidated shopping preserves source rows and free-text amounts. Sum only understood compatible units; ambiguous amounts and different units remain explicit. Persist user aisle overrides separately from inferred grouping.
- The family v1 uses one shared login across devices. /week, /shopping and /cook/:mealId are private. The installable PWA is online-first; its service worker caches only public installation/offline assets, never API responses or private recipe pages.
- Public result responses must not expose voter identities. Host voter detail is allowed only after server-side host verification; a query-string flag alone is not authorization.
- Recipe instructions and ingredients are private host-library data. Reject them for takeout categories, preserve ingredient order and free-text amounts, never add recipe fields to public join, swipe, session, or result payloads, and load host recipe views through an authenticated ownership-checked meal route.
- Optional recipe total time and effort are also private home-meal metadata. Keep fresh schema/migrations, nullable API fields, editing, filters and versioned library transfers aligned; omitted updates preserve metadata and explicit null clears it. Preserve compatibility with older transfers lacking these fields.
- Recurring groceries are host-owned templates explicitly applied to a selected week. Keep application atomic and idempotent per host/week/template; later template edits or deletion must not rewrite shopping snapshots or reset bought/already-have states. Validate every selected template before mutation and restore accepted state after persistence failure.
- Private library notes are host-only data for both meals and categories. Keep them out of public join, swipe, session, and result payloads, and expose them only through authenticated ownership-checked meal routes.
- Library transfers are authenticated, versioned JSON for active meals and categories. Preserve private recipe data, ingredient order, and notes, assign fresh IDs on import, and never transfer ownership, tokens, counts, history, archived records, or internal IDs.
- Notion recipes use a direct read-only REST connection per host, with encrypted server-only credentials; the app uses no AI. Keep source/page mappings private and stable across refreshes, reject local linked-recipe edits, validate a complete source before atomic updates/removals, preserve planning/shopping snapshots and freeze affected updates during open voting. See docs/notion-recipes.md for format, encryption-key and testing requirements.
- Browser recovery uses both `sessionStorage` for join/session context and `localStorage` for in-progress swipes. Preserve the storage contracts when changing join, share, swipe, edit, or result flows.
- Swipe drafts preserve the actual cursor, including Back navigation. Successful submissions retain accepted choices in the existing session context for later editing. Hydrate storage keys before mounting the deck, and require explicit retry after a failed submission.
- Voting defaults to a compact list with explicit submission: unselected options become No, while existing Maybe votes stay Maybe until explicitly changed. List and optional Swipe views share choices and the actual swipe cursor; reopening a completed Swipe view must not submit automatically. Details expose only the existing public description, and submission controls must remain reachable above authenticated navigation.
- Declare React hooks before conditional returns and keep effect dependencies accurate. Add regression coverage for async navigation, polling, and storage behavior.

## Change workflow

- Explicit `$meal-match-delivery` or “MealMatch delivery” requests load `.agents/skills/meal-match-delivery/SKILL.md` directly, even if the skill picker has not refreshed. A bare invocation checks readiness; check, prepare, run and resume have distinct scopes. Report loaded mode/scope and evidence-backed readiness. Loading a skill does not grant publishing authority.

- MealMatch planning, idea capture, status, and coordinated delivery use the project skill at `.agents/skills/meal-match-chief-of-staff/SKILL.md`. Read `brain/README.md` and `brain/STATE.md` first; checkpoint meaningful outcomes before ending. Save and organize thoughts by default; investigate or build when requested. The installed `meal-match-idea-review` skill handles the feature-delivery path.
- For requested research or implementation, delegate independent investigations, bounded implementation, and review to subagents when useful. Keep one coordinator responsible for shared memory and integration; give workers explicit scope and file/worktree ownership. Capturing a thought alone does not start research or a build. Follow the ownership and worktree rules in `brain/README.md`.

- Check `git status` before editing and preserve unrelated or pre-existing work.
- Accepted backlog-only grooming in `Ideas.md` may be committed and pushed directly to `master`; keep feature-completion cleanup on that feature's branch and PR.
- Make the smallest coherent change; avoid new production dependencies unless they materially simplify the requested behavior.
- For an API contract change, update the route, `server/src/types.ts`, `client/src/api/client.ts`, all consumers, and tests together.
- For a schema change, update fresh-database creation, existing-database migration, server types, queries, and tests together.
- Add or adjust tests next to the affected code. Use Playwright when behavior spans browser storage, multiple participants, authentication, or the client/server boundary.
- `npm run verify` also checks the compiled production runtime and six isolated API/persistence mutations after successful prerequisites. Keep its five-minute safety ceiling, informational two-minute performance goal and meaningful failure assertions; extend adversarial checks when consequential regressions reveal a gap. See `docs/verification.md`.
- Do not hand-edit generated output in `dist/`, Playwright reports, test results, coverage, databases, or installed dependencies.

## Code review priorities

Give extra scrutiny to authorization and ownership, creator-token secrecy, vote-value consistency, partial database writes, session-close races, voter-detail privacy, browser-storage recovery, and client/API response-shape drift. Report behavior and security risks before style-only observations.
