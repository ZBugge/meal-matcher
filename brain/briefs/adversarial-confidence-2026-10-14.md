# Adversarial confidence audit — 2026-10-14

## Verdict

The roughly 43-second workflow is a useful local regression baseline. Current assertions do not justify high confidence for broad autonomous family-app changes. The runner generally fails closed; coverage quality is the limiting factor. No product hardening was authorized or implemented during this assessment.

The most important evidence is a real false-green experiment and a reproduced existing data-loss bug. Preserve the fast command and strengthen its meaningful assertions before relying on it for wider changes. Counts alone do not establish confidence.

## Demonstrated findings

1. **Actual API regression passed every gate.** In the isolated `codex/fast-verification` worktree, temporarily changed `server/src/routes/swipes.ts` to allow numeric vote 3. The complete verifier passed all 35 server, 103 client, and 22 browser tests, lint, builds, and runner regressions in 40.4 seconds. A real request to that worktree's freshly built API returned HTTP 200 for vote 3. The canonical app rejected the same invalid value with HTTP 400. The mutation was restored, `git diff` confirmed no route changes, and the isolated worktree was rebuilt/reverified normally in 40.6 seconds. Experimental report: `.verification/run-1792009415076-98a13666/` in the feature worktree; restored run: `.verification/run-1792009545700-0c26f1e0/`. Canonical app source was never mutated.
2. **Rejected ballot update loses accepted votes in the unmodified app.** Real API reproduction on a separate temporary database: submit votes `[1, 2]`, then update with `[0, 99]`. The API rejects the update with HTTP 400, but persisted votes become `[0]` and `submitted` remains 1. `server/src/routes/swipes.ts:148` deletes prior votes before validating all replacements; each insert/delete is persisted separately by `server/src/db/schema.ts`. This is a confirmed current bug, not merely missing coverage. No real session/library data was used for the probes.
3. **13 server route tests do not call server code.** All eight checks in `server/src/routes/swipes.test.ts` and five in `quick-session.test.ts` assert local literals, arrays, or mocked response objects. Changing the actual validation rule cannot fail these assertions. The earlier description of these tests as API validation coverage was too generous. Other server matching/parser/schema/library tests exercise real implementation and remain useful.

The isolated audit script is under canonical `.verification/adversarial-api-probe.mjs`; it starts the built server with a unique port/database and reports only synthetic vote states. Generated audit artifacts are ignored and are not feature changes. The probe intentionally demonstrates an existing bug; its successful reproduction is not a passing product assertion.

## Additional source-backed gaps

| Gap | Evidence | A concrete check to add or strengthen |
| --- | --- | --- |
| Same-browser participant identities | Main scenarios use `context.newPage()` in `e2e/authenticated-host.spec.ts:63`, quick-session, lifecycle, and maybe tests; cookies and localStorage are shared | One complete couple flow with independent browser contexts, separate participant recovery, and appropriate controls |
| Vote editing not completed | `e2e/quick-session.spec.ts:37` ends after entering edit mode | Submit changed choices and verify changed persisted votes/results after reload |
| Polling/ranking assertions weaker than their names | `session-lifecycle.spec.ts:118` accepts any count; `maybe-swipe.spec.ts:47` checks meal presence rather than exact order | Assert count transitions and expected result order |
| Null assertions and unawaited async checks | `client/src/pages/SwipeSession.test.tsx:100` does not await `waitFor`; line 154 accepts null with `toBeDefined`; `SwipeCard.test.tsx:54` repeats null-permitting assertion | Await actual behavior and assert non-null elements/relevant props |
| Public/other-owner rejection cases | Current real recipe test checks anonymous access and omitted recipe/notes, but not another logged-in owner, `?host=true` voter detail, or wrong creator token | Real requests for rejection/privacy with state unchanged |
| Swipe recovery | Storage hook/API/deck/navigation are mocked in SwipeSession unit tests; current phone reload is a recipe/library reload | Partial swipe, reload/back, resume, submit, edit, and confirm results without duplicated/lost votes |
| Reopening durable data | Most browser persistence cases keep the same API process alive | Save a representative recipe/session, close and reopen the database, compare ingredients/order, notes, votes, selection, and counts |
| Production runtime | Browser suite runs source via Vite/tsx in development; builds only compile | A short smoke of the built server's deep link, assets, and anonymous session flow when deployment/runtime paths change |
| Actual phone behavior | Phone gate is Chromium at 390-by-844; screenshots are saved, not compared, and recipe creation uses API | Target-phone check for changed gestures/keyboard/layout and installed-PWA behavior when implemented |

Privacy and closed-session handling are not wholly untested: `e2e/meal-management.spec.ts:195` checks anonymous join has no private recipe/notes, line 221 checks anonymous recipe returns 401, and line 252 checks public results omit private recipe/notes; `session-lifecycle.spec.ts:4` exercises closed-session swipe rejection. The gap is adversarial edge cases and independent identities.

## Recommended minimal confidence pass

1. Fix ballot replacement to validate the whole request before mutation and commit replacement atomically. Add a real API regression asserting rejected updates leave prior state unchanged, alongside invalid votes/IDs, ownership, and token checks. Replace literal-only route tests with implementation-backed checks.
2. Strengthen the existing edit, polling, and ranking scenarios instead of adding duplicate screenshots or superficial count-based checks. Add one independent-two-context journey with partial-swipe reload and saved choice edits.
3. Add one save/reopen database round trip. Add a built-runtime smoke where changes affect serving/cookies/deployment. Test real target-phone behavior when changing phone-specific functionality.
4. For each new feature, identify its main user journey and a meaningful failure/recovery case; add assertions with the implementation, demonstrate the new regression check can fail on the broken behavior, then run full verification. Add data-preservation cases for plan/list edits, recipe changes, already-have exclusions, and cross-device state as those features arrive.

Keep the under-two-minute target and remeasure after expanding the suite; the current roughly 43-second runtime has headroom, but the expanded time is not yet verified. Do not promise universal correctness, shrink coverage to meet the timer, or add broad scale/compliance process. Prefer small changes with observable outcomes, fresh state, and independent review for persistence/sharing/schema risks.

## Review provenance and next action

Requested research only. Astra Specialist (`gpt-6-astra` / high / fresh context) audited API/data/ownership gaps; Sol Reviewer (`gpt-6.1-sol` / high / fresh context) audited assertions/runner/browser gaps. Both were read-only and completed; the coordinator reproduced the vote findings and restored all experimental source changes. No separate backend model telemetry was exposed.

MM-I008 in [Ideas](../../Ideas.md) captures the bounded hardening recommendation. Revisit before broad autonomous family-feature builds or on a direct implementation request. Existing roadmap lanes and publishing permissions are unchanged.

## Implementation checkpoint — 2026-10-15

Zach subsequently authorized implementing this audit, retaining the full passing suite below two minutes, and continuing adversarial checks (MM-D007). The confidence pass is now implemented and verified locally. Final complete command: 56.53 seconds; 81 server/110 client/24 browser tests, seven runner checks, lint, builds, compiled production smoke, and six caught mutations. Rejected ballots and save failures preserve accepted state; browser refresh/edit/Back and explicit failed-save retry are exercised. Original database/tracked test output unchanged. Independent reviews completed and findings fixed. See [current evidence](../digests/2026-10-15.md) and [verification instructions](../../docs/verification.md). No publication/deployment or family features started; real-device checks remain separate.
