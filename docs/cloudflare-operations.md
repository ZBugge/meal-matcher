# Cloudflare release and recovery

This branch contains the local migration candidate. No Cloudflare account, resources, paid plan, hosted secrets or deployment has been configured. `docs/cloudflare-migration-progress.md` records measured evidence; the current `.verification/latest.json` summary establishes whether full local verification passed. Merged and deployed status must be reported separately from implementation and local tests.

## Local commands

Use `npm run install:all` once and install Playwright Chromium. `npm run dev` builds the application and starts Worker Static Assets plus the API at `http://127.0.0.1:5173`. Its D1 state and generated development secrets stay under ignored `.wrangler/dev`; restart after edits. `npm run db:migrate:local` only applies local migrations. Neither command selects a hosted database. Preserve this directory if its local accounts matter.

`npm run build` performs both package typechecks, builds the frontend and packages the Worker without reinstalling packages. `npm run verify` exercises the actual packaged Worker and D1, with fresh state and the project's 120-second budget. `.verification/latest.json` identifies the latest report. `npm run test:e2e` also builds and starts an isolated Worker. Tests never reuse previews.

The release candidate receipt in `.verification/release-bundle/candidate.json` binds Git commit, source/config/migrations, frontend inputs, asset bytes and Worker bytes. Source changes invalidate it. An implicit root/client/server `.env` file is refused during packaging; preserve the file and build from a clean isolated checkout. Private values belong in runtime bindings, never Vite build variables. A direct package build is insufficient release evidence.

## Source and data custody

The migration base is master `e02b38d` plus the explicitly preserved 23-file Notion overlay. That feature was uncommitted/unmerged when captured. The original canonical and Notion worktrees, five source databases and original encryption key remain untouched. Recovery copies, hashes and source manifests live in private ignored `.verification/migration/` directories in the implementation checkout. Copies on this machine are not off-device backups.

`npm run migration:preflight -- --source <copied-database>` is read-only. `npm run migration:rehearse -- --source <copied-database> --target <new-label>` creates a new unpublished local D1 target. Baseline portable restores require `--backup <private-json> --sha256 <recorded-hash> --target <new-label>`. A failed target is quarantined and retained; do not empty/reuse it. The baseline exporter refuses live revisions/chunks/runtime state and must never be used as a production backup.

No database is automatically selected for launch. The Notion preview contains real connection state and QA records. Agree a reviewable selection rule before importing family data; preserve the full source. Retain the original Notion encryption key separately from the export. Replacing that key makes existing credentials unreadable. Do not print tokens to demonstrate decryption.

## Hosted setup remains a separate step

Cloudflare Workers + D1 is the single destination. Local top-level Wrangler bindings are placeholders. Staging and production have explicit distinct Worker/DB names and placeholder IDs; version previews are disabled. `cloudflare/targets.json` deliberately says `UNCONFIGURED`. Remote guards reject unconfigured, shared or mismatched targets. Account/resource provisioning and spending require the user's applicable authority after the local candidate is ready.

Before hosted setup, confirm the account ID, existing resources, billing/Paid authority, scoped token capabilities and the actual GitHub repository/CI capabilities. Determine whether any Railway deployment/automatic release actually exists. Retain its recovery source if it does; do not deploy to Railway first. Merging changed start/build scripts could trigger an existing Railway integration, so establish its state before publishing to an auto-deployed branch. Legacy `railway.json` and `build.sh` are retained until launch is proven.

Use one GitHub Actions release authority; disable any parallel Cloudflare Builds automatic deployment. Untrusted PR code receives no deployment secrets. Local tests use synthetic data. Authorized staging uses its own D1 and controlled access; never expose copied family records as a public demo. Configure a scoped Cloudflare CI token, explicit account ID, and separate `SESSION_SECRET`/`NOTION_ENCRYPTION_KEY` runtime secrets. Inspect the pinned Wrangler secret command before bootstrap: some secret updates publish a version immediately. Do not bootstrap a half-configured production Worker by blindly running `secret put`.

Initial acceptance must measure real TLS cookies, Worker CPU/query usage, Notion direct API refresh with the intended token/key, persistence across redeploy, phone/PWA behavior and a full restore read through the app. Local HTTPS Request simulation and wall-clock bcrypt timing do not establish hosted TLS or CPU. The configured 1,000ms per-request CPU ceiling is a proposed Paid guardrail requiring staging measurement, not a claim that every accepted bulk request fits.

## Release order and recovery

Freeze and verify one commit/artifact set. Deploy/migrate isolated staging, run bounded read-only smoke and the authorized synthetic integration checks. Record production's previous code version, D1 Time Travel recovery point and a private portable export before production migrations. Apply only compatible additive migrations, then deploy the exact verified Worker/assets; a failed migration must stop deployment. Serialize releases without cancelling an active database mutation. Never automatically retry an ambiguous import/write.

After release, run `npm run smoke -- --url <explicit-https-origin>`: database/schema health, API JSON/no-store handling and SPA deep links. This command creates no synthetic accounts or meals. Authentication/Notion write checks belong in authorized staging.

Keep the original source read-only during cutover. Establish one authoritative writer, take a final consistent source backup, import into an empty unpublished target and compare all records/FKs before switching traffic. Stop if source data changes after rehearsal. Do not clean QA records from the original or publish a partially imported target.

Code rollback does not roll back D1. A previous Worker can be redeployed only while its schema remains compatible. For data recovery, restore into a new isolated database, compare schema/table hashes/FKs, use the intended original encryption key and read restored recipes/plans/login through the app before approving any production binding switch. Preserve failed targets for investigation. Record actual recovery duration and retained backup location; do not promise a restore time or retention that has not been measured/configured.

An origin change requires login again and leaves browser session/swipe storage and the installed PWA on the old origin. Communicate the new URL, finish active sessions when possible, and reinstall/update the PWA deliberately. D1-backed login rows alone do not move browser cookies across origins.

## Pattern for another app

Copy the conventions only after MealMatch passes: one Worker per app/environment, assets and API at one origin, one private D1 per app/environment, numbered additive migrations, runtime secrets, isolated local fixtures, source-bound verified artifacts, serialized staging-first release and demonstrated restore. Reuse the scripts selectively; choose new names/account bindings and independent keys. Do not share MealMatch's database, accounts, secrets or deployment token by default. No monorepo, infrastructure framework, shared auth service or extra Cloudflare product is needed for this pattern.
