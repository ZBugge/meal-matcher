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
- `server/`: Express, TypeScript, `sql.js` SQLite persistence, cookie sessions, and Vitest.
- `e2e/`: Playwright coverage for quick sessions, authenticated hosts, meal management, session lifecycle, and maybe votes.
- `agents/orchestrator/`: a separate Node/TypeScript GitHub-issue orchestrator with its own dependencies, build, tests, state database, and Claude-oriented prompts. It is not part of the MealMatch runtime or root test command. Do not migrate or redesign it as part of an application change unless explicitly requested.
- `SPEC.MD`: original product specification.
- `CLAUDE.md`: legacy agent notes; useful context, not an automatically authoritative Codex instruction file.

## Setup and development

Use npm and preserve the root, client, and server lockfiles, plus the orchestrator lockfile when its package changes. The root install command does not install orchestrator dependencies.

```bash
npm run install:all
npm run dev
npm run dev:client
npm run dev:server

# Only when working on agents/orchestrator
npm --prefix agents/orchestrator install
```

Development defaults are client `http://localhost:5173` and API `http://localhost:3000`; Vite proxies `/api` to the server. In production, Express serves `client/dist` and owns the SPA fallback.

The normal production environment needs `SESSION_SECRET` and may set `PORT`, `NODE_ENV=production`, and `DATABASE_PATH`. Railway should mount persistent storage and set `DATABASE_PATH` to the mounted database. Never commit environment files, tokens, database files, or production data.

## Verification

Run checks proportional to the change. The root unit-test command covers the server and client, but not Playwright or the orchestrator.

```bash
# Server and client unit tests
npm test

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
```

Prefer the two direct package builds during routine verification. Root `npm run build` invokes `build.sh`, which runs `npm install` inside both packages and requires a Bash-compatible shell.

Playwright writes to `playwright-report/` and `test-results/`. Those paths are ignored, but `test-results/.last-run.json` is still tracked from older history. Preserve any pre-existing change to that file and do not include generated test output in a feature diff.
Playwright starts its server with a per-run database under `test-results/` and does not reuse an existing development server unless `PLAYWRIGHT_REUSE_SERVER=1` is explicitly set. Keep this isolation so end-to-end tests do not pollute a developer's persistent local database.

## Cross-layer invariants

- SQLite booleans are numbers (`0` or `1`). Convert them to booleans at API boundaries where the client type is boolean. In JSX, do not render a raw numeric database flag with `flag && ...`, because `0` is renderable text.
- Keep the vote domain synchronized in server types and validation, matching logic, client API types, local-storage progress, swipe components, results UI, and tests. Search all vote usages before changing it.
- A session has one mode: `home` or `takeout`. Stored options have a separate type: `meal`, `category`, or the reserved future `restaurant`. Home sessions currently accept only meals, takeout sessions accept only categories, and the server must reject mixed or mismatched IDs. Do not change matching behavior based on mode.
- Host preferences stored as SQLite flags must be converted to booleans in authentication API responses. Keep their fresh-schema columns, additive migrations, API types, and client callers aligned.
- Keep `createTables` and `runMigrations` in `server/src/db/schema.ts` aligned. The project has a small additive migration mechanism rather than a migration framework.
- `runQuery` persists the full `sql.js` database after each write. Be conscious of write ordering and partial updates in multi-step handlers.
- Protect authenticated host routes with both authentication and resource ownership checks. Anonymous close operations must validate the creator token without returning or logging it.
- Express session storage currently uses the package default memory store. Do not assume login sessions are durable across server restarts or multiple production instances.
- Public result responses must not expose voter identities. Host voter detail is allowed only after server-side host verification; a query-string flag alone is not authorization.
- Recipe instructions and ingredients are private host-library data. Reject them for takeout categories, preserve ingredient order and free-text amounts, never add recipe fields to public join, swipe, session, or result payloads, and load host recipe views through an authenticated ownership-checked meal route.
- Private library notes are host-only data for both meals and categories. Keep them out of public join, swipe, session, and result payloads, and expose them only through authenticated ownership-checked meal routes.
- Library transfers are authenticated, versioned JSON for active meals and categories. Preserve private recipe data, ingredient order, and notes, assign fresh IDs on import, and never transfer ownership, tokens, counts, history, archived records, or internal IDs.
- Browser recovery uses both `sessionStorage` for join/session context and `localStorage` for in-progress swipes. Preserve the storage contracts when changing join, share, swipe, edit, or result flows.
- Declare React hooks before conditional returns and keep effect dependencies accurate. Add regression coverage for async navigation, polling, and storage behavior.

## Change workflow

- Check `git status` before editing and preserve unrelated or pre-existing work.
- Accepted backlog-only grooming in `Ideas.md` may be committed and pushed directly to `master`; keep feature-completion cleanup on that feature's branch and PR.
- Make the smallest coherent change; avoid new production dependencies unless they materially simplify the requested behavior.
- For an API contract change, update the route, `server/src/types.ts`, `client/src/api/client.ts`, all consumers, and tests together.
- For a schema change, update fresh-database creation, existing-database migration, server types, queries, and tests together.
- Add or adjust tests next to the affected code. Use Playwright when behavior spans browser storage, multiple participants, authentication, or the client/server boundary.
- Do not hand-edit generated output in `dist/`, Playwright reports, test results, coverage, databases, or installed dependencies.

## Code review priorities

Give extra scrutiny to authorization and ownership, creator-token secrecy, vote-value consistency, partial database writes, session-close races, voter-detail privacy, browser-storage recovery, and client/API response-shape drift. Report behavior and security risks before style-only observations.
