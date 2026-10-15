# Family meal planning product review — 2026-10-15

The core recipe → agreed menu → shopping → cooking loop exists. The largest opportunity is reducing everyday decisions and connecting the stages when plans change. All forty ideas are saved. Zach authorized original numbers 1–3,6–7,16–19,22 for the first delivery batch on 2026-10-15; remaining ideas stay proposed. [Selected delivery scope](family-week-shopping-delivery.md). Hosting remains deferred. The original review below did not change application code.

## Evidence and boundaries

Inspected current clean application worktree C:/Users/ZachBugge/food-app/.feedback-worktree at e85040b (PR #43 merged). Read WeekPlan, ShoppingList, CookingRecipe, Dashboard, AddToWeek, planning API/server routes and public service worker. Inspected four rendered phone screens using synthetic recipes/plans on isolated temporary API/Vite servers; those servers were stopped afterward. Existing preview and its data were untouched. Runtime evidence/screenshots: .feedback-worktree/.verification/family-product-audit/observations.json and week/library/shopping/cooking PNGs (ignored local artifacts). Independent fresh-context Sol-medium product reviewer supplied a read-only assessment (one delegated turn, no nested workers, usage totals unavailable).

Verified findings:
- Week renders meal cards with per-meal date selects, not seven day slots or a Tonight summary. Two dinners may share a date without a prompt. Home/takeout are the only plan kinds.
- Adding a home meal requires leaving week for library/results. The library opens collapsed and combines recipe management with voting/history. Voting results add one meal at a time.
- AddToWeek labels future-week additions as "this week"; its added indicator is transient and server permits repeated recipe entries.
- Shopping groups rows by recipe. Synthetic plan generated separate Rice and Onion rows across recipes; eight ingredients produced a roughly 2,100px phone page with per-item selects/edit/remove controls.
- Removing a planned meal deletes its linked shopping items, including purchased rows. Moving dates is restricted to the same week; no transfer/undo endpoint exists.
- Shopping is an ingredient snapshot at add time; cooking reads the current recipe. Editing a recipe later can leave shopping and cooking inconsistent.
- Week and shopping fetch on mount/week/retry, with no focus refresh or live sync. Independent-login persistence tests establish shared storage, not live freshness.
- Cooking ingredient checks are transient; instructions are a single text block; no cook-completion/leftovers state, serving metadata, timers or screen-awake control exists.
- Service worker caches public installation/offline assets only; saved private shopping/recipes are not available offline.
- Existing useful features retained: flexible nights, date assignment, recipe search/paste import/private notes, shopping edits/extras/have/bought/copy, multiple result additions, durable login, phone navigation. Separate accounts, full offline sync and grocery ordering were already deferred; ideas below do not change that authority.

## Idea menu

Numbers are discussion handles within this brief, not new MM-I IDs. Existing parent MM-I006 remains the family mission; related saved IDs remain unchanged.

Planning the week:
1. Tonight at the top: surface today's dinner and a large Cook button; let user pick from flexible meals if tonight is empty.
2. Seven-day overview plus flexible meals: show intentional gaps and two dinners on the same night; do not force filling all seven days.
3. Add a meal from the week: focused search/picker only when requested, keeping the main page limited to the agreed menu.
4. Leftovers, freezer meal, eating out and away nights: plan reality without inventing recipes or mislabeling everything takeout.
5. Move, swap and undo: move a dinner to tomorrow/next week or replace it without silently losing shopping progress.
6. Repeat a useful week: copy its menu/dates, optionally omit meals the family is tired of, rebuild a fresh grocery checklist.
7. Weekly staples: salmon/tofu/one easy night slots, then choose the particular recipes (existing MM-I007).
8. A realistic effort budget: mark busy nights and avoid putting three demanding dinners in a row.

Deciding together:
9. Family wording: "Choose this week's meals" and "Invite someone to choose" instead of session/host/participant vocabulary.
10. One week-linked decision round: start/resume it from the plan and return to the same plan, without hunting through history.
11. Add several agreed results at once: select useful meals then add them together; give disagreements their own secondary view.
12. Useful vote meanings: distinguish yes, okay if others want it, and hard no; keep all-yes different from acceptance including maybe.
13. Suggest during a vote: capture another idea without silently changing an in-progress ballot (existing MM-I003 needs its own design).
14. Remember preference patterns: family favorites and less frequent choices, while letting a person change their mind this week.
15. Low-energy tie breaker: pick from agreed meals that fit available time/ingredients; explain the suggestion and allow reroll.

Shopping:
16. Compact store mode: checkbox/tap rows, hide edit/remove menus and tuck completed items away; retain full editing elsewhere.
17. Consolidated ingredients: show onions/rice together with their source meals; combine only compatible amounts, never guess arbitrary unit conversions.
18. Aisle order: produce, dairy, dry goods, frozen and household extras, with an optional custom ordering.
19. Pantry pass: one quick review before shopping with bulk already-have actions; avoid requiring a maintained inventory system initially.
20. Remember staples: recurring milk/eggs/fruit or household extras offered each week, separate from recipe-derived groceries.
21. Refresh shared changes: focus refresh or simple live updates so two phones see purchases and plan changes promptly.
22. Protect groceries when plans change: keep bought items, explain what removal affects, and offer Undo or Keep groceries.
23. Use-it-up shortlist: start from an ingredient already at home and suggest saved recipes that use it.

Recipes:
24. Time and effort tags: prep/cook time, minimal cleanup, freezer-friendly and similar filters before choosing meals.
25. Servings and household portions: save baseline yield, select diners/leftovers, scale safe quantities and leave ambiguous amounts editable.
26. Sides with mains: assemble a full dinner and include its sides in the list (existing MM-I001).
27. Easier recipe capture: extend existing validated paste flow with link/image import and retain the original source; depends on chosen extraction approach.
28. Pictures where they help recognition: one image per saved meal, without making photography a prerequisite (existing MM-I005).
29. Recipe revisions that respect planned meals: review what changed and explicitly update this week's ingredients, keeping purchase decisions.

Cooking and learning:
30. Keep the screen awake during cooking, with a clear optional cooking mode.
31. Step mode: readable individual steps, checked progress and simple timers; original full instructions remain available.
32. Recover cooking progress: retain checked ingredients/steps after accidental navigation and reset for a new cooking occasion.
33. Made it / skipped it: complete a dinner and capture remaining portions, without equating planning or voting with cooking.
34. Dinner-specific notes: thaw salmon tonight, use the small pan, or partner handles rice; separate these from permanent recipe notes.
35. A tiny post-dinner verdict: repeat soon / tweak / retire, plus the one thing to change next time.

Household convenience and bigger bets:
36. Who is eating and who is cooking: lightweight names/assignments first, no separate-account system required to validate value.
37. Batch prep: highlight shared prep across dinners, e.g. cook rice once or chop onions for two meals.
38. Read-only offline shopping and tonight's recipe: narrowly scoped phone resilience before attempting full offline editing/sync.
39. Cost awareness: optional rough cheap/medium/treat labels or a weekly estimate, without building a grocery price database.
40. Broader household meal coverage: lunch leftovers, packed lunches and breakfasts as optional future views if dinner-only use feels incomplete.

## Recommended first picks and tradeoffs

Coordinator recommends 1/2 (Tonight + readable week), 3 (direct intentional adding), 16/17 (store shopping), 5/22 (safe plan changes) and 7 (weekly staples). Independent reviewer prioritizes 22,17,4. Merge those perspectives by fixing the daily path and safe changes before speculative automation. Shared refresh (21) rises in priority once both partners use the app concurrently.

Do not interpret the missing features as all necessary: repetition and a simple leftovers note may beat an inventory/AI system. Consolidation/scaling must respect the existing free-text ingredient contract. A new direct picker must preserve the user's request that the week show agreed meals rather than a permanent dump of library candidates. The review alone authorized no build; Zach subsequently selected the first ten items listed above. Ideas.md is the delivery queue; the numbered catalogue remains the full reference.
