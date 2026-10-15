# Dashboard pilot — prepared batch

2026-10-15, America/New_York. Batch ID: `dashboard-pilot`. Parent queue item: MM-I002. **Preparation complete; implementation and publication are not authorized.**

## Short answer

Propose one complete dashboard outcome: place session actions above the saved library and make both the library and Recent Sessions collapsible. This is the first pilot after [delivery setup](delivery-setup.md), not approval to consume the remaining backlog. Search remains a follow-up on MM-I002.

Original wording preserved: “Move the Create Session to the top above the Recipes, and have the Recipe section be collapsible. When there are a lot of recipes, you just have to scroll forever. Make the History collapsible as well. Searchable, too.”

## Scope and design defaults

Current `client/src/pages/Dashboard.tsx` renders saved options first, then Quick Session/Create Session, then Recent Sessions. The library supports Home meals/Takeout tabs and private recipe/edit/notes/transfer controls. Recent Sessions includes both open and closed sessions; collapse the existing section as a whole without changing membership or order.

Proposed milestone P1:

- Move the existing session-action section above the saved-options section. Retain existing action availability, empty-library guidance, mode-aware session dialog, quick-add behavior and Quick Session navigation.
- Add a keyboard-operable library disclosure and a separate Recent Sessions disclosure, each with visible labels, `aria-expanded` and `aria-controls`. Keep headings/toggles visible; hidden content must not remain keyboard focusable.
- Default both sections expanded for compatibility. Store collapse state only in React state for this mount; refresh/remount restores expanded. Keep each disclosure independent, and keep library collapse unchanged when switching Home meals/Takeout. Keep mode tabs accessible outside the collapsible library body so session creation can still use the chosen mode.
- Preserve parent-owned form/dialog, selection and editing state when hiding/reopening content. Reopening restores existing content. Closing a section must not submit forms, delete data, mutate session options, or reset unrelated state.

These are proposed routine defaults, not user decisions about search or persistent preferences. No new backend/API/schema/storage contract is needed.

## Acceptance and failure cases

1. With a long library, session actions precede it visually and in document/tab order at desktop and phone sizes. No horizontal overflow or obscured action/disclosure controls.
2. Each disclosure toggles with click, Enter and Space; accessible expanded state matches visible content. Collapsing one leaves the other unchanged and keeps focus on its toggle. Hidden controls cannot receive focus.
3. Empty library, empty history, many recipes, both modes, open/closed sessions, and library loading/error paths remain usable. An entirely empty library retains current Create Session availability and Quick Session guidance; no invented empty-session flow.
4. Collapsing/reopening preserves loaded data and selected mode; Create Session still offers the correct options even while the library is collapsed. Recipe viewing/editing, private notes, import/export, deletion, selected-winner recipe links, and session navigation keep working.
5. Refresh resets disclosure defaults without writing new browser-storage keys. Existing swipe/session recovery contracts and public/private payloads remain unchanged.
6. Add focused component regressions for ordering, independent disclosures, semantics, modes/empty states, and action behavior while collapsed. Add an isolated Playwright dashboard journey for keyboard behavior, phone layout and collapse-to-create navigation; inspect generated phone screenshots. Run full `npm run verify` on the final candidate; no skipped/flaky gates and elapsed time below 120 seconds. Chromium phone coverage is not a real iPhone/Safari certification.
7. Independent review, required hosted checks, protected merge, actual merge/tree reconciliation and full default-branch verification complete before calling the pilot delivered. A PR, auto-merge request, or mocked helper result alone is insufficient.

Stop on lost state, inaccessible controls, changed option pools, data/privacy regressions, failed checks, missing prerequisites, or exhausted budget. Fix within bounded attempts; otherwise preserve work and checkpoint. Do not expand into search to work around an unresolved pilot defect.

## Dependencies, ownership and budget

Repository `https://github.com/ZBugge/meal-matcher`, verified default `master` at preparation. Current canonical checkout `C:/Users/ZachBugge/food-app`, branch `codex/chief-of-staff`, is dirty; do not implement there. Future isolated branch/worktree: `codex/dashboard-pilot`, from the latest committed, verified setup baseline. Recheck live default/base and other writers first. Coordinator alone owns canonical notes; workers return scoped updates.

Requires delivery-setup baseline/CI/helper/protection, executable Chromium and approved local-server context, explicit pilot implementation authority, and separately recorded publishing/merge/deployment scope. Current authority is **prepare only; no publishing**. Railway automatic deployment remains unknown and blocks merge until resolved/accepted or explicitly decoupled.

Proposed ceiling: one pilot milestone, at most two merged milestones or 45 minutes active work, whichever comes first. No automatic second feature; search requires a separate scope. Setup has its own budget. Existing-plan economy, no API fallback/credit purchases. Maximum three implementation attempts and five delegated turns including follow-ups; one initial independent review and one consolidated recheck.

Use a Luna/high micro-builder only if the final assignment fits at most three files and the routing exclusions; otherwise coordinator or Sol/medium builds. Likely files are Dashboard.tsx, Dashboard.test.tsx, and one dashboard browser spec; more files/ambiguous state behavior moves the task to Sol. Sol/medium independently reviews; Sol/high only for a consequential issue. No scouts/nested workers/duplicate implementations. Capture elapsed work, turns, repairs, model requests and available total usage; mark unavailable usage honestly. Main-chat model remains selected in the UI.

## Exclusions and remaining parent work

No search, sorting/filtering, persistent collapse preferences, new navigation architecture, backend refactor, recipe/library redesign, meal planning/shopping, image/PWA work, dependencies, or orchestrator changes. Keep MM-I002 in Ideas.md after P1 merges because search remains unfinished; reconcile only the completed placement/collapse portion through its feature PR and canonical checkpoint. Backlog lanes are unchanged during prepare.

## Next invocation

After setup and authority are resolved: `Use $meal-match-delivery to check readiness for batch dashboard-pilot. Do not change anything.`

Then explicitly authorize the saved implementation/publishing/deployment scope before `run batch dashboard-pilot`. A local-only build request may authorize implementation/commits without publication, but cannot prove the protected delivery loop. No run or resume authority has been granted by preparing this brief.
