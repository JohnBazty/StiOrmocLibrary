# Shelf dimensions, capacity, and copy placement

## Why

Keep physical assignments within staff-configured compartment limits, with practical copy counts rather than guessed physical measurements.

Date created: 2026-11-18  
Date last updated: 2026-11-18  
Status: inprogress

## Approved behavior

- Shared shelf editor in Managed shelves and Maintenance → Locations: name, 1–12 columns/rows, positive copies-per-compartment default, and individual compartment exceptions. No invented capacity.
- Show compartment and shelf usage, remaining capacity, and Nearly full at 80%, Full, Over capacity, or Capacity not configured.
- Require configuration before new placements. Preserve existing records; initial setup may honestly record an overfilled compartment. Reject subsequent reductions below usage and removal of occupied/default coordinates.
- Count active physical books and research copies once. Borrowed/damaged copies reserve space. Archiving physically removes holdings; restoration rechecks capacity.
- Categories provide defaults only. Category edits/reassignment and title category changes preserve existing physical placements.
- Staff choose one compartment per batch. Full groups fail atomically with an actionable shortage message. Explicit moves preserve circulation/category history. Imports remain retryable.
- Recheck under transaction locks across entry, imports, moves and restore. No live migration without separate owner approval.

## How and implementation tracking

- [x] 046 migration: catalog_locations dimensions/default capacity, compartment overrides, preservation/backfill and API-only protections, real-SQL tests.
- [x] Shared capacity service: canonical locations, usage, validation, transactions, setup and movement APIs.
- [x] All catalog write paths and category-default semantics; focused regression tests.
- [x] Shared shelf and placement UI, inventory moves, import coordinates; focused UI tests.
- [x] Full tests, type checking, build, and focused shelf coverage. Live browser shelf pass blocked here (this checkout has no `apps/api/.env`, so the API cannot start). Combined security review still pending before PR.
- [x] Schema/workflow documentation and migration tracker updated with results.

## Execution ledger

- 2026-11-18: Owner approved the plan in chat. Work starts on `codex/shelf-capacity`; pre-existing payment changes and earlier category-dialog corrections are preserved. Migration 046 is the next unused number; no hosted application is authorized.
- Ruling: Serialize capacity mutations with one transaction-level advisory lock (734046), acquired before category/title/copy locks. This is simple and appropriate for the campus library; it prevents competing requests claiming the last slot without introducing a counter cache.
- Ruling: Preserve existing label fields for API compatibility while resolving placement through catalog_locations IDs. Shelf dimensions become authoritative there; historical floor-plan rows remain unchanged.
- Ruling: One submitted copy group occupies one selected compartment. Staff reduce quantities and submit another group when multiple compartments are needed; there is no automatic redistribution.
- Pre-flight: UI and integrations consume the shared managed-shelf/placement contract; the migration provides its canonical columns and override table. File ownership is split between UI, placement integration, migration/testing, and the primary shared service/routes to prevent conflicting edits.
- 2026-11-18 verification resume: fixed placement integration fixture material-id clash; research moves/restores now sync legacy `materials` rows by barcode when `material_id` is absent. Focused shelf API tests pass (21). Full API suite 755/755. Full web suite 503/503 after a contended first run. API/web typecheck and builds pass. Focused shelf coverage: `shelf-capacity.service.ts` ~98% lines, `shelf-copy-placement.service.ts` 100% lines. Schema notes for 037/038 reconciled to current default-only category behavior. Hosted migration still unauthorized.

## Verification

Local automated verification done: focused shelf API 21/21; full API 755/755; full web 503/503; typecheck and builds pass; shelf service coverage ~98% lines. UI grids already use horizontal scroll (`overflow-x-auto`) for narrow widths. Live Managed shelves / Locations browser pass was not possible in this checkout because `apps/api/.env` is missing and the API exits before listen. Migration remains unapplied to the hosted database. Latest applied stays 045; next unused 047.
