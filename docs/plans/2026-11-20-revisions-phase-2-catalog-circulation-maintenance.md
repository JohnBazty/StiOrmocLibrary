# New revisions Phase 2: Catalog and circulation maintenance (migrations from 078/079)

- **Date created:** 2026-11-20
- **Date last updated:** 2026-11-20
- **Status:** inprogress (all 7 slices built and committed locally on their branches; migrations 079-082 written, not applied; reviews, live migrations and PRs wait for Ethan's go-ahead)
- **Integration branch (local only):** `chore/revisions-phase-2` = phase 1 integration + all phase 2 slice branches, for whole-suite checks.
- **Source:** Ethan's `new-revisions.docx` (2026-11-20). Other phases: `2026-11-20-revisions-phase-1-fixes-and-cleanups.md` `2026-11-20-revisions-phase-3-policies-accounts-payments.md`
- **Migrations:** next unused number is **078** (see `.cursor/agent-protocol.md`); numbers are assigned when each slice is built.

## Why

Ethan's `new-revisions.docx` lists about 45 changes from user testing: bugs ("does not work"), wording and UI cleanups, and new maintenance screens. I mapped every item to its code. They group into three phases, ordered by risk:
1. Fixes and cleanups with no schema change, to ship first.
2. Catalog and circulation features that need migrations.
3. Policies, accounts, payments and printing, the largest group.

**Decisions already made:**
- Payments: make the hosted practice mode (Xendit test keys) work end to end. No real money.
- Faculty get no overdue fines and no violation fines. Warnings are still recorded.
- Registration rejects an ID that isn't on the roster, with a clear message and a tight per-IP rate limit.
- An imported copy with no shelf is stored as **Unassigned** (shelf is nullable) and shows up in shelf suggestions.

**Rules for every phase (CLAUDE.md and agent-protocol):**
- **Plan doc:** each phase gets a plan doc in `docs/plans/2026-11-2x-revisions-phase-N.md` with the standard shape and status `planned`.
- **Branches:** one `fix/` or `feat/` branch per slice listed below.
- **Build flow:** tests first, then `library-builder` → `plan-verifier` → `security-reviewer`. Add `database-reviewer` when a slice has a migration.
- **UI work:** use the `sti-vaadin-design-system` and `sti-ux-qa-critic` skills.
- **Migrations:** start at **078**, one file per schema change under `database/supabase/`, and update the tracker in `.cursor/agent-protocol.md`.
- **Go-ahead:** no push, merge, deploy or live migration without Ethan's go-ahead.

## How

**2a. Reservation calendar for the current semester (`feat/reservation-semester-calendar`)**
- API: `borrowing-schedule-calendar.ts` `scheduleDates()` returns the open days from today to the end of the active semester. Reuse the semester resolution in `clearance/clearance-schedule.service.ts:7`. Reject dates outside it on the server.
- Web: `ScheduleBorrowingForm.tsx:158` uses a calendar button, reusing `features/clearance/ClearanceDayPicker.tsx`.
- No schema change.

**2b. Book condition maintenance (`feat/copy-condition-maintenance`)**
- Migration: a `copy_conditions` table seeded with the current values, following the `074_violation_categories.sql` pattern.
- API: a CRUD service. Replace the hardcoded lists in `catalog.validation.ts:6`, `inventory.validation.ts`, `thesis-inventory.validation.ts` and `stocktake.service.ts:11,83`.
- Web: a "Book conditions" tab in `CatalogMaintenancePage.tsx`. `StocktakeConditionDialog` and `InventoryDashboard` read their values from the API.
- Retire a condition that is in use rather than deleting it.

**2c. Import without a shelf (`feat/import-unassigned-shelf`)**
- Migration: `physical_copies.shelf_location` becomes nullable.
- API: `holdings-parser.ts:322` and `bulk-book.validation.ts:110` no longer require a category or shelf.
- Web: remove the category and shelf dropdowns in `HoldingsFileQuestions.tsx:24-25` and the "Shelf needed" check in `HoldingsImportPage.tsx`.
- Make inventory, stocktake and the floor plan handle no shelf, shown as "Unassigned".

**2d. Shelf transfer and suggestions (`feat/shelf-ddc-transfer`)**
- Migration: shelves (`catalog_locations`) get a category link and an optional DDC range.
- API:
  - A suggestions query lists the copies whose category or DDC belongs on a shelf but that sit elsewhere or are Unassigned, ordered by call number.
  - A bulk move by filter reuses `shelf-copy-placement.service.ts` and `shelf-capacity.service.ts`, inside a transaction.
- Web:
  - `ShelfManagement.tsx` gets a "Suggested books" panel with Move selected / Move all, and shows the shelf's contents sorted by call number.
  - `CategoryManagementPage.tsx` gets a "Manage category & shelves" button that opens the same suggestions.

**2e. Lost book: replace or pay (`feat/lost-book-replace-or-pay`)**
- Migration: a `Replaced` resolution and an admin-entered price on `lost_book_reports`, plus `replacement_copy_id`.
- API (`clearance.service.ts` `decideLost` and `resolveLost`):
  - The admin chooses Replace copy or Pay book price, and enters or confirms the price before confirming the loss.
  - Replace adds a "Replace copy" action that registers the new copy and closes the report.
- Web: `ReportLostDialog.tsx` and `AdminClearancePage.tsx`.

**2f. Research: bulk import and remove Research groups (`feat/research-bulk-import`)**
- **Bulk import:** a file import for research records that reuses the holdings parser and batch tables (`064_catalog_import_automation.sql`), with a template download and a row-level error report.
- **Remove the Research groups tab** from `CatalogMaintenancePage.tsx` and `ResearchCatalog.tsx` (the filter), plus the `?section=research-groups` deep links.
- The `research_group_id` requirement is dropped from `catalog.validation.ts:265-303` and `catalog-management.service.ts:85`; department or program covers it.
- The table and column stay (no destructive migration). If the column has a NOT NULL constraint, a migration relaxes it.
- Update `schema-readiness.ts` and the three tests.

**2g. Event occupancy (`feat/event-occupancy-auto`)**
- In `LibraryOperationsPanel.tsx`, the "Remaining library seats" field is calculated automatically: base seats from `library_profile_settings.seat_capacity` minus the event's seats, shown read-only.
- Confirm the event affects occupancy only between `starts_at` and `ends_at` (`attendance-operations.service.ts:30-36`), and add a test for it.

## Verification

- `npm test`, `npm run typecheck` and `npm run build` from the repo root. Each slice has new failing-first tests next to the code: `node --test` with supertest for the API, Vitest for the web.
- Migrations are checked against a PGlite or local test database. They are applied to live Supabase only with Ethan's go-ahead, then verified read-only.
- Check each slice in the browser with `npm run dev:api:stable` and `npm run dev:web` (the root dev script is broken), signed in as Admin, Librarian, Staff, Student and Faculty as relevant, on desktop and mobile. Specific checks:
  - The borrower barcode scans with the webcam.
  - The ISBN lookup fills and clears the fields.
  - The reservation calendar stops at the semester end.
  - A notification time matches the borrow time.
  - A DOCX upload produces a page count.
- `plan-verifier` before each PR. Each phase's plan doc moves `planned` → `inprogress` → `built` with a change log entry.

## Implementation tracking

- [x] 2a. Reservation calendar for the current semester (`feat/reservation-semester-calendar`). Open days from tomorrow to the current semester's last day (started enrollment semester, else active academic term); no semester, no dates. `components/CalendarDateButton`. No migration.
- [x] 2b. Book condition maintenance (`feat/copy-condition-maintenance`). Ethan chose custom conditions. Migration `079_copy_conditions.sql`: library conditions behave like one of the five base conditions; `physical_copies.condition_detail_id` + guard trigger, `condition_status` unchanged so lending/returns/stocktake logic is untouched. Library setup -> Book conditions; inventory condition dialog offers them (books only; returns and stocktake still use the base five).
- [x] 2c. Import without a shelf (`feat/import-unassigned-shelf`). Migration `080_unassigned_copy_shelf.sql`. No shelf or an unmatched shelf imports as Unassigned; category still required per book (file column or row review). File-wide category/shelf question removed.
- [x] 2d. Shelf transfer and suggestions (`feat/shelf-ddc-transfer`). Migration `081_shelf_ddc_range.sql`. Suggestions by category shelf or DDC range (Unassigned included, lent/lost excluded), shelf contents in call-number order, move via the existing move dialog; categories get Manage category & shelves.
- [x] 2e. Lost book: replace or pay (`feat/lost-book-replace-or-pay`). Migration `082_lost_book_replacement.sql`. Confirm-loss dialog: Pay book price (entered/confirmed price becomes the charge) or Replace copy ('Awaiting Replacement', blocks clearance); Replace copy returns the copy under its barcode and offers it to the waitlist.
- [x] 2f. Research: bulk import and remove Research groups (`feat/research-bulk-import`). Research groups tab, select and filter removed (API/table kept, no migration); Add Research asks for department or program; research titles can change category. Bulk import: check file, then import ready rows (each on its own, re-checked server-side).
- [x] 2g. Event occupancy (`feat/event-occupancy-auto`). Form asks for seats the event uses; remaining seats calculated from library capacity. Library-state rules ignore an event outside its start/end. No migration.
- [ ] Reviews (security-reviewer; database-reviewer for 079-082), then Ethan's go-ahead for push/PRs and for applying 079-082 to live Supabase.

## Change log

| Date | Change |
| --- | --- |
| 2026-11-20 | Plan drafted from `new-revisions.docx` and a code map of every item; Ethan approved the 3-phase split. Status `planned`. |
| 2026-11-20 | Ethan said proceed with phase 2; all 7 slices built tests-first on separate branches. 2b scope chosen by Ethan (custom conditions behaving like a base condition). 2c: an unmatched shelf name imports as Unassigned instead of blocking. 2e: entered price replaces the fixed book-price rule; Awaiting Replacement blocks clearance. Status `inprogress`. |
