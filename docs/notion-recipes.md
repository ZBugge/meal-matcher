# Notion recipes

MealMatch reads recipes directly through Notion's REST API. There is no AI or ChatGPT connection in the application. Each authenticated account has its own encrypted Notion credentials and selected recipe collection.

## Connect

1. Create an internal connection in the Notion developer portal with Read content capability. Grant it access to the recipe database or its parent page. See [Notion's setup guide](https://developers.notion.com/guides/get-started/internal-connections).
2. In MealMatch, open Recipes, then Notion recipes. Enter the database link and connection token, and choose Connect and refresh.
3. MealMatch validates the collection before saving the connection and recipes. Subsequent changes appear only when Refresh is pressed. Connection settings replaces/rotates credentials only after a successful read. Disconnect removes credentials while preserving the accepted recipe copies.

Recipes remains split into Regular recipes and Notion recipes. Linked recipes have an Edit in Notion link; local edits and archival are rejected by the server. Existing regular recipes retain their editing and transfer workflows. Library exports contain regular recipes and categories; linked recipes remain in their Notion source, avoiding loss when both collections contain the same name. Both recipe sources can be used for plans and home voting sessions.

## Recipe format

Use a database with one data source and a title property named Name. Each recipe page must contain these native Notion blocks, in this order:

- A level-two Ingredients heading.
- One native two-column table with Amount and Ingredient as its header row. Keep ingredient rows in display order. Amounts are free text, including fractions, ranges and unspecified amounts; ingredient names must be nonempty.
- A level-two Instructions heading followed by numbered preparation steps. Level-three subsection headings, paragraphs and bullets can preserve Sauce/Assembly groups and Recipe notes.

Nested or unsupported blocks, repeated/missing sections and incomplete pagination fail validation rather than discarding content. No additional recipe metadata is required. Guides/templates belong outside the recipe database. Reads are bounded to 100 recipes, 1,000 ingredient rows per recipe and 60 seconds, with request/body limits and bounded rate-limit retries. API version is pinned to 2025-09-03.

Format errors list the first problem in each invalid recipe, including its name, block position/type, section and repair guidance. Unsupported text and heading excerpts are limited to 100 characters. Keep yield and other notes below Instructions, rather than between Ingredients and its table. Fix the listed problems in Notion and refresh again; no recipes are imported until the entire collection validates.

## Refresh and preservation

The server reads every recipe and ingredient table, then repeats the content and inventory reads to detect observed concurrent edits. Notion offers no transactional snapshot; an edit after the final check appears on the next refresh. A failed/incomplete read leaves the entire accepted library intact. Page IDs, scoped by account and source, identify recipes; renames do not create duplicates. A complete successful read archives missing source recipes from future choices. Reappearing pages retain their MealMatch IDs. Switching collections archives prior-source choices after successful validation.

Existing dinner/shopping snapshots, bought/already-have states and recipe history are retained. Changed source recipes used by an open voting session cannot refresh until that session closes, so voters see stable card content. Cached recipe copies remain readable after removal or disconnect.

## Credential storage

Tokens travel only to the authenticated server endpoint, are encrypted using AES-256-GCM with their account ID as authenticated context, and are never returned, logged or stored in browser storage. API calls use a fixed Notion host and reject redirects.

Production requires NOTION_ENCRYPTION_KEY, a base64-encoded random 32-byte key, in addition to the normal persistent DATABASE_PATH and SESSION_SECRET. Preserve the same key across restarts and backups; losing it requires reconnecting Notion. Development automatically creates a private sibling file named DATABASE_PATH.notion-key. Keep it with the database backup and outside source control. The database path defaults to server/data/database.db. No hosted environment changes are made by this feature.

## Verification

Reader tests exercise native REST responses, table/section parsing, pagination, incomplete lists, observed concurrent changes and bounded failures. Credential tests cover persistence, tampering, account binding and configuration. HTTP tests cover account isolation, idempotent refresh, edits/removals, shopping preservation, open votes, local-edit rejection and recovery from disk-save failure. Component/browser tests cover the tabs, password input, explicit retry and accepted data after failure. Run npm run verify for all existing production/browser/adversarial gates.

A live test still requires a separate Notion credential and access to the selected collection. Mocked reads and this chat's Notion access do not establish that the app's connection works against the real service.
