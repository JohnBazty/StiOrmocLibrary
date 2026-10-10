# Stocktake Sessions and Discrepancy Review — Implementation Plan

## Why

The inventory screen verifies individual barcodes and records condition changes, but it cannot say which items were expected for a count, which were missed, or how an exception was resolved. A stocktake needs a frozen starting list, an append-only scan record, a review step, and an export that can be reproduced later.

## Plan metadata

- **Date created:** 2026-10-10
- **Date last updated:** 2026-10-10
- **Status:** `planned`
- **Roadmap:** Release 3 in [next-implementation-roadmap.md](next-implementation-roadmap.md)
- **Active database:** Supabase PostgreSQL; MySQL remains the rollback reference
- **Migration reservation:** Supabase `018` / MySQL `048` are next in this checkout after renewal migrations `017` / `047`. Verify the target branch and hosted migration ledger before creating or applying stocktake files; never reuse a number.

## Objective, constraints, and assumptions

- Deliver an Admin-only workflow to start, scan, close, review, and export a stocktake of individually barcoded books and physically bound research/thesis items.
- Use the existing Express inventory module, React inventory area, barcode scanner hook, report renderers, and inventory audit services. Add no separately deployed service, dependency, or alternate inventory ledger.
- Keep circulation and reservations authoritative for loan/hold state. Closing a session only freezes findings; it never marks an item Lost, changes availability, moves a shelf, or charges a borrower.
- Treat `physical_copies` and `research_inventory` as separate asset kinds. Do not join them by title or create a shared inventory row. The optional `research_inventory.title_id` permits category filtering only when it points to a catalog title.
- Use one scope dimension per session: one managed shelf, one category, one published floor-plan area (called a room in the UI), or a collection-wide count. A separate `asset_kind` filter is `book`, `research`, or `both`. Collection-wide means all active assets of the selected kind.
- Room scope includes only shelves placed in that area on the **published** floor plan. Show unplaced shelves separately and exclude them from that room. Snapshot the resolved shelf IDs and labels at start so later map edits do not alter the count.
- A category's managed shelf remains the authoritative book home. Stocktake must not create a competing per-copy shelf override.

## Existing change points

| Area | Current behavior | Planned change |
| --- | --- | --- |
| `apps/api/src/modules/inventory/inventory.routes.ts`, `inventory.controller.ts`, `inventory.service.ts`, `inventory.repository.ts` | Admin-only per-copy reads, verification, and audited mutations | Add a `stocktake.*` route/controller/service/repository/validation set under the same module and mount at `/api/inventory/stocktakes`. |
| `apps/api/src/modules/inventory/thesis-inventory.service.ts` | Research condition/availability audit; no verify-only operation | Add transaction-compatible verify-only auditing for a recognized active research scan. |
| `apps/api/src/modules/inventory/physical-copy.service.ts`, `apps/api/src/modules/floor-plan/*` | Shelf changes and category/floor-plan rules are separate; direct `PATCH /copies/:copyId` is not a stocktake audit path | Use existing category/floor-plan operations for permitted location changes; do not write shelf columns directly from stocktake. |
| `apps/web/src/features/inventory/InventoryDashboard.tsx`, `inventory-api.ts`, `types.ts`, `useDesktopScanner.ts` | Current scanner immediately verifies one copy | Add session list/detail and a focused session scanning view. Scanner input in that view submits to its session, with explicit observed shelf/compartment. Preserve ordinary per-copy verification outside a session. |
| `apps/api/src/modules/reports/branded-table-pdf.ts`, `csv-integrity.ts` | Reusable PDF table and signed CSV output | Add stocktake discrepancy exports using those helpers and the frozen session findings. |
| `apps/api/src/core/schema-readiness.ts`, `docs/schema-context.md`, `docs/api-reference.md` | No stocktake contract | Declare the new tables and document the API and lifecycle. |

## How

### 1. Additive data model

Create the following five tables in one reviewed PostgreSQL migration and a matching additive MySQL 5.6 rollback-reference migration. Use repository naming and timestamp conventions. Add the MySQL baseline definitions, then update the migration tracker and schema context. No existing inventory, loan, or reservation IDs change.

| Table | Required data and constraints |
| --- | --- |
| `stocktake_sessions` | ID; name; `scope_kind` (`shelf`, `category`, `room`, `collection`); scope reference and readable label; `asset_kind`; JSON/text scope snapshot (resolved shelf IDs/labels, room/map revision, selected category); status (`in_progress`, `closed`, `reviewed`, `cancelled`); started/closed/reviewed/cancelled timestamps and actor IDs/labels; timestamps and row version. Index status/start date. |
| `stocktake_expected_items` | Session ID; `asset_kind` and source item ID; immutable barcode, accession, title, category, home shelf ID/label/column/row, condition, availability, lifecycle, row version, and loan/reservation state at start; closure-state snapshot for loan/lifecycle/row version. Unique `(session_id, asset_kind, source_item_id)` and index `(session_id, barcode)`. Keep these snapshots even if the source is later archived/deleted. |
| `stocktake_scans` | Session ID; unique per-session request key for retry safety; entered barcode; resolved asset kind/ID if any; observed shelf ID/label/column/row; scan source (`scanner` or `manual`); actor and time; lookup snapshot (home, condition, availability, lifecycle, loan state, row version). Every distinct scan is retained, including unknown and duplicate barcodes. Index session/time and session/barcode. |
| `stocktake_discrepancies` | Session ID; expected-item ID or scan ID as applicable; finding code; frozen evidence JSON/text; status (`open`, `resolved`, `dismissed`, `blocked`); creation/update timestamps and row version. Unique deterministic finding key per session to make close/retry idempotent; index session/status/code. Multiple independent findings may refer to one item. |
| `stocktake_resolution_events` | Discrepancy ID; previous/next status; action, required reason, actor and time; before/after operational snapshot; nullable reference to the resulting inventory or floor-plan audit event where an automated correction was applied. Append-only; index discrepancy/time. |

Use ordinary numeric IDs and explicit checks/foreign keys supported by each database. Snapshot source identifiers without a cascading foreign key so an old report remains readable. Update book/research deletion guards so an item with stocktake history takes the existing archive path instead of being hard-deleted. No automatic backfill is needed: old per-copy audit events are not retroactively called sessions.

### 2. Session lifecycle and scope snapshot

1. `POST /api/inventory/stocktakes` validates name, scope, asset kind, and published-room membership; starts one database transaction, captures the scope definition and every active matching item, then returns the session and counts. Reject an invalid/missing shelf, category, or room, and reject a room with no placed shelves. An empty valid collection/shelf can be counted and closed with an explicit zero-item result.
2. `GET /api/inventory/stocktakes` lists sessions with filters and counts; `GET /:id` returns metadata and expected/present/missing/exception totals, while the item, scan, and finding lists paginate independently. Expected items are immutable after start; new items and category/shelf changes after start appear as out-of-scope or changed-state evidence, never silently join the baseline.
3. Only `in_progress` accepts scans. `POST /:id/close` locks the session, captures current loan/lifecycle state for expected items in a consistent read, and writes deterministic frozen findings. Repeating close returns the same result. `POST /:id/cancel` is available before close with a required reason; it preserves scans and the snapshot.
4. Closed sessions stay available for review and export. Move to `reviewed` only when every finding has a recorded resolution or dismissal. Never reopen or rewrite the closed finding set; start a new session for a recount.

### 3. Scan and classification rules

- `POST /api/inventory/stocktakes/:id/scans` takes `{ requestKey, barcode, observedShelfId, observedColumn?, observedRow?, source }`. The UI keeps one observed shelf selected while scanning and offers manual entry. Require a managed shelf for physical scans; validate compartment against that shelf's grid. For a collection-wide count, the observed shelf is still required to detect misplacement.
- Look up both asset ledgers by exact normalized barcode. If neither matches, record `unknown`. If both match, record an ambiguous `unknown` finding and require manual review; never choose one silently. Do not use ISBN or title as item identity because multiple copies can share them. The UI may search by ISBN/title to help staff find a barcode, but counting remains accession/barcode based.
- Preserve each unique request key exactly once. A second physical scan with a new key remains a `duplicate` event rather than increasing present count. Count one first scan per asset; subsequent scans are visible in history.
- An active first scan of an item in the **frozen expected set** counts present, even if its live category or home shelf changed after start. Produce separate findings, when applicable, for `wrong_location` (observed shelf/compartment differs from snapshotted home), `borrowed_but_found` (open loan at scan), and `lost_but_found` (condition Lost/lost). A recognized archived item is `archived`; an active item outside the frozen expected set is `out_of_scope`. Unknown and duplicate scans are never discarded.
- At close, an expected item with no first scan is `missing` only if it is still active, not already known Lost, and not on an open loan. A currently borrowed unscanned item is shown as `borrowed_out`, not missing; an unscanned item already marked Lost is shown as `known_lost`. A newly archived unscanned item receives an `archived` finding. Preserve start and close state snapshots so the classification is reproducible; flag changes to business fields or loan state for review. Ignore row-version increments caused solely by this session's verification scans.
- A successful first scan of an active recognized item also records ordinary `Verified`/`verified` history and updates the corresponding last-scanned/last-audited timestamp in the **same transaction** as the stocktake scan. This is an explicit verification action, not a condition/availability/location correction. Unknown, archived, and duplicate scans do not touch inventory rows.

### 4. Review and corrections

- `GET /:id/discrepancies` supports code, status, asset kind, and search filters. The detail shows the frozen expectation, observation, current live state, other scans, and previous decisions. Exports use the frozen findings plus resolution history, not live inventory values.
- `POST /:id/discrepancies/:discrepancyId/resolve` accepts an expected row version, action, and nonblank reason. Admin may `dismiss` with an explanation; `confirm_found_at_home` after physically returning an item; or request an allowed operational correction. A dismissal never changes inventory.
- Re-read and lock the live item, loan/reservation, and discrepancy before any write. If the item or policy state changed since review, return `409` with refreshed state and leave the finding open. Never auto-mark a missing item Lost or a found Lost item Available. Condition and availability changes go through the existing inventory/thesis rules and append their normal audit event in the same transaction as the stocktake resolution event. Preserve the Lost-to-Unavailable rule and active-loan/reservation blocks.
- For wrong location, the default resolution is physically returning the item to its recorded home. A database correction must use the existing category-managed shelf or floor-plan compartment workflow. If the requested shelf conflicts with the category home, block it and point Admin to Category Management; a stocktake resolution cannot bypass that rule. Record the existing floor-plan/category audit reference and final stocktake decision after a permitted change.
- Location changes made in Category Management or the floor-plan screen may be separate transactions. On return to stocktake review, verify the resulting live location and audit event before recording the resolution. If that recording fails, leave the finding open for retry; do not claim it was resolved.
- `POST /:id/review` marks the session reviewed only when no findings remain open/blocked. Keep all resolution events and review actor/time.

### 5. UI and exports

- Add a **Stocktakes** entry within Admin Inventory: session list with scope/status/date/counts; create form with shelf/category/room/collection selectors and an expected-count preview; session page with scan input, selected observed shelf/compartment, immediate scan feedback, counts, history, close confirmation, and discrepancy review queue. Manual ISBN/title/accession search may retrieve candidates, but staff must select the exact accession/barcode before recording a scan.
- Show unknown, duplicate, out-of-scope, archived, borrowed-but-found, lost-but-found, wrong-location, and missing results as text with icons, not color alone. Display the chosen observed shelf at all times to prevent a batch of scans being assigned to the wrong location.
- `GET /:id/discrepancies.csv` and `.pdf` stream the same frozen filtered result: session/scope/as-of metadata, item identity, expected and observed location/state, finding, resolution/action/reason/actor/time. Reuse CSV formula escaping and integrity footer, branded PDF table, authenticated download, and `private, no-store` headers. Do not substitute the existing current-inventory export for this historical report.

### API behavior

All new routes require `requireCatalogManager`, so only the canonical `Admin` role can use them through session or JWT authentication. Validate IDs, scope, barcode, shelf, compartment, request key, reason, and pagination server-side. Use `422` for invalid input, `404` for absent resources, `409` for stale/closed/conflicting state, and the existing `403` authorization response. Keep current `/api/inventory/scans` and inventory exports unchanged.

| Method | Path under `/api/inventory/stocktakes` | Contract |
| --- | --- | --- |
| `GET` | `/scope-preview` | Validated scope parameters; current expected count and shelf coverage. Advisory only: create re-queries in its transaction. |
| `POST`, `GET` | `/` | Create from `{ name, scopeKind, scopeId?, assetKind }`; list with page/status/scope/date filters. |
| `GET` | `/:id` | Session metadata and summary counts. |
| `GET` | `/:id/expected`, `/:id/scans`, `/:id/discrepancies` | Independently paginated history and findings with search/filter parameters. |
| `POST` | `/:id/scans`, `/:id/close`, `/:id/cancel` | Append a scan; freeze findings; or cancel with a reason. |
| `POST` | `/:id/discrepancies/:discrepancyId/resolve`, `/:id/review` | Record an authorized decision; mark the fully resolved session reviewed. |
| `GET` | `/:id/discrepancies.csv`, `/:id/discrepancies.pdf` | Export frozen findings and current resolution history with the selected finding filters. |

## Build order and implementation tracking

- [ ] Confirm renewal `017` / `047` and the hosted migration ledger on the target branch; reserve the actual next PostgreSQL and MySQL numbers.
- [ ] Add the five tables, indexes, constraints, deletion-history guard, and schema-readiness entries; test both migrations on disposable databases.
- [ ] Implement scope resolution and immutable expected-item snapshot, including room shelf mapping and research category links.
- [ ] Implement idempotent scan writes, recognized-item verification audit, classification, close/cancel/review transitions, and read APIs.
- [ ] Implement review decisions with row locking, transaction-compatible inventory corrections, and append-only resolution events.
- [ ] Add the React session workflow and API types/client using the existing scanner hook.
- [ ] Add matching signed CSV and PDF discrepancy exports.
- [ ] Update `docs/schema-context.md`, `docs/api-reference.md`, migration trackers, and this plan's status/change log when building begins and ends.

## Verification and acceptance

1. **Migration/data:** apply on disposable PostgreSQL and MySQL databases; verify constraints, indexes, exact expected counts for shelf/category/room/collection, research with and without catalog links, and preserved reports after archive. Confirm no old inventory rows are rewritten.
2. **API:** test Admin versus Student/Faculty, invalid scope/compartment, empty count, unknown/ambiguous barcode, duplicate physical scan, repeated request key, concurrent scans/close, close retry, post-close scan rejection, and cancellation. Verify each item counts present once.
3. **State changes:** simulate a loan, return, archive, category/shelf move, and new item during an open count. Confirm frozen baseline plus saved close state explains every result, borrowed-out is not missing, and finishing never changes condition, availability, shelf, or loan state.
4. **Review:** test missing/Lost/borrowed/wrong-location cases; stale row versions; active loan/reservation blocks; failed correction rollback; one normal inventory audit and one stocktake resolution event for an approved correction; no inventory writes on dismissal.
5. **Reports/UI:** compare filtered UI findings against CSV/PDF row counts and detail; verify CSV signature and formula escaping, PDF pagination, scanner plus manual entry, shelf context, keyboard use, and Admin browser flow. Run API/web tests, typechecks, and production builds. Verify with disposable hosted records if a safe test environment is available, then remove them.

**Done when:** An Admin can count either asset kind in each supported scope, close a session into reproducible findings, resolve or dismiss every exception with an actor and reason, and export the same historical discrepancy set in CSV and PDF. The close/review operations never silently alter authoritative inventory or circulation state.

## Risks / notes

- **Migration numbering:** renewal `017` / `047` exist in this branch, but hosted acceptance remains open. Verify the target branch and hosted ledger before naming migrations; do not assume `018` / `048` if another migration lands first.
- **Location authority:** the direct physical-copy shelf patch does not express category-home or floor-plan audit rules. Do not use it as a shortcut for stocktake corrections.
- **Long counts:** snapshot and close must batch reads/writes while keeping a consistent transaction view and limiting response page sizes. Index session/item and session/barcode lookups.
- **Concurrent operations:** scan, close, and resolution require session/discrepancy locks and request-key uniqueness. Recheck live restrictions immediately before corrections.
- **Scope limit:** this release counts accessioned books and bound research/theses. Printing consumables, registrar imports, alert automation, and cross-session trend analytics belong to their existing or later roadmap releases.

## Change log

- **2026-10-10:** Created build-ready Release 3 plan from the product PDFs, roadmap, current inventory/floor-plan code, and migration state. Status `planned`.
- **2026-10-10:** Corrected the migration note after verifying renewal `017` / `047` are committed on `feat/renewal-management`; their hosted acceptance remains open.
