# MM-I022 mobile redesign

Acceptance contract: the 2026-10-15 mobile UX audit in the canonical checkout's `brain/briefs/mobile-ux-review-2026-10-15.md`. The concept is illustrative; production controls continue to call the existing authenticated and public APIs.

## Scope

- Plan, Shop, Recipes navigation and shared visual language; compact week agenda, Tonight, explicit dinner details, focused picker and visible choosing together.
- Compact shopping with original contribution amounts, purchase versus pantry states, editing, extras and copy fallback.
- Searchable home/takeout libraries, recipe editing and reading, transfers, voting, sharing, joining, results, cooking, authentication and system states.

No API/schema/storage contract changes, new services or dependencies, or unrelated capabilities are intended. Hosted deployment is deferred.

## Preservation checks

| Contract | Evidence required |
| --- | --- |
| Selected week across navigation, recipe reading and voting | Browser journeys assert URL and destination-week data |
| Flexible/multiple dinners, date assignment, Tonight only current week | Phone journeys plus persisted plan reads |
| Reusable dinner ideas and reviewed selective week copying | Existing family planning journey; source/target IDs and grocery states |
| Grocery-safe removal | Browser confirmation and retained purchased/kept contribution assertions |
| Exact amounts, source contributions, aisle, edits, extras, copy | Shopping journeys and unchanged consolidation unit tests |
| Distinct needed/have/bought and bulk pantry review | Persisted state assertions across reload and second household login |
| Private recipes, notes, ordered ingredients and paste | Existing library/privacy browser, API and mutation checks |
| Takeout onboarding, search and deletion | Existing library and food mode journeys |
| Versioned transfer preview/duplicates/export | Existing transfer browser and API tests |
| Anonymous voting, drafts, join/share, token secrecy | Existing quick-session and public API checks |
| No0/Yes1/Maybe2, Back/recovery/edit/retry | Existing swipe recovery and numeric vote suites |
| Host controls and public results boundary | Existing family voting, session lifecycle and privacy mutation checks |
| Cooking/shared login/PWA/offline fallback | Existing family and compiled production checks |
| 320/390/430px, long content, keyboard-height dialogs and focus | New mobile redesign browser coverage and inspected screenshot artifacts |

## Delivery evidence

The completed candidate passed `npm run verify` on 2026-10-16 in 75.5 seconds: 110 server, 140 client and 34 browser tests, lint, both builds, runner checks, compiled production runtime and all six privacy/persistence mutations. The first full run failed on obsolete CSS selectors for confirmations; the updated journeys use labelled native dialogs without weakening their behavior assertions.

One independent Sol-high review and a consolidated recheck found no material preservation/privacy regression. Its editor finding was corrected with a full-height editor, independently scrolling fields and persistent Save/Cancel actions. Browser evidence covers twelve ordered ingredients, exact amount edits, reordering, retained private instructions/notes, nested focus restoration, short viewports and selected-week continuity. Actual screenshots were inspected at 320, 390 and 430 pixels; a 390px case also checks 200% root text sizing.

This is Chromium evidence. Shortened viewports simulate reduced space; real mobile keyboards, iPhone/Safari, VoiceOver and TalkBack still need device testing. Cooking check progress retains its existing lifetime, and the online-first PWA does not promise offline synchronization. PR/merge and local preview status are recorded separately in the PR and canonical project memory. No hosted deployment is included.
