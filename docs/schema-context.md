# Database Schema Context

## Target requirements versus current baseline

The target product requirements are the preserved PDFs indexed by [source-of-truth.md](source-of-truth.md). This file documents the **currently implemented** database baseline; it must not override newer product requirements.

Known target gaps include Library Staff/Student Assistant authorization, Archived accounts, renewals, expanded reservation states, richer catalog/research data, and dynamic QR attendance. Cash fine collection, fine caps and infractions, operating-calendar calculation, print revenue/supply history, and archive/clearance audit trails now have additive schema support. Add remaining gaps through versioned, backward-safe migrations before depending on them in application code.

The structural catalog migration [20260816_002_book_research_management.sql](../database/migrations/20260816_002_book_research_management.sql) supplies the active four-table `titles`, `authors`, `research_records`, and `physical_copies` model used by the API. `physical_copies.material_id` is the explicit compatibility mapping to the existing `materials.material_id` value. Deployments with legacy material rows still require a separately reconciled data backfill.

## Canonical executable schema

The authoritative database baseline is [database/mysql56-schema.sql](../database/mysql56-schema.sql). It is deliberately compatible with MySQL 5.6 and newer versions and uses:

- InnoDB tables
- `DEFAULT CHARSET=utf8`
- Explicit primary and foreign keys
- Named indexes and relationship constraints
- MySQL 5.6-compatible `ENUM`, numeric, date/time, and text types
- Triggers for rules that MySQL 5.6 cannot enforce with `CHECK` constraints

When this context and the SQL script differ about what is currently executable, the SQL script is authoritative. When the SQL script differs from the preserved product PDFs, the PDFs define the target and the difference is migration work.

## Modeling decision

Each row in `materials` represents one individually barcoded physical library item. If the library owns three copies of the same title, the database stores three material rows with different barcodes. This matches the capstone's requested Material ID and Barcode workflow and keeps circulation scanning simple.

If the project later needs MARC-style cataloging or large multi-copy collections, introduce separate title-level and copy-level tables through a planned migration rather than changing the current meaning of `material_id` in place.

## Relationship map

```text
roles --< users
           |--< borrow_transactions >-- materials >-- categories
           |          |
           |          +-- fines --< fine_adjustments
           |                       |-- fine_infractions
           |                       +--< fine_payment_allocations >-- fine_payment_receipts
           |
           |--< reservations >---------- materials
           |--< attendance_logs
           |--< print_requests
           |-- clearance_statuses
           |--< notifications
           +--< paper_replenishments >-- bond_paper_stocks

printers --< ink_repository
```

## Table ownership

### Identity and access

- `roles`: currently System Administrator, Librarian, Student, and Faculty. The target model also requires restricted Library Staff/Student Assistant access.
- `users`: institutional ID, JWT-compatible `school_id`, profile, normalized `role_id`, JWT-facing `user_role`, hashed password, education data, and activation state. `System Administrator` maps to `Admin` at the JWT boundary.
- `accounts`: normalized credential identity keyed by unique `school_id`, with contact number, bcrypt password hash, explicit JWT-facing role, and Active/Deactivated/Archived lifecycle. A nullable unique `user_id` is the backward-compatible bridge for identities imported from `users`.
- `student_profiles`: one-to-one student academic extension containing first/last name, program or strand, and year/grade level. It never stores credentials or authorization state.
- `auth_sessions`: expiring server-side session payloads keyed by an opaque session ID.

Accounts should be deactivated through `account_status`; do not delete users with operational history.
Expired rows in `auth_sessions` are periodically removed by the API session store.
Migration `20260816_005_jwt_role_authentication.sql` adds the unique `school_id` and indexed four-value `user_role` compatibility fields without replacing normalized roles or server-side sessions.
Migration `20260820_007_normalized_accounts_authentication.sql` adds `accounts` and `student_profiles`, backfills existing user credentials into linked account rows, and leaves all operational `users.user_id` foreign keys unchanged. New mobile-style student registration writes only the normalized account/profile pair; downstream operational enrollment can link an account to a user through `accounts.user_id` when those workflows are introduced.

### Catalog

- `categories`: unique category name, physical shelf-location tag, and creation/update timestamps. The table uses `utf8mb4_unicode_ci`; category names are case-insensitively unique.
- `materials`: barcode, title, author, ISBN, year, category, shelf, type, and availability.

The `department_or_program` and `abstract_text` fields support thesis/manuscript analytics and discovery.

Category shelf locations are trimmed, non-empty administrator-defined labels up to the existing `VARCHAR(100)` boundary. They are intentionally not restricted to a Shelf/Aisle pattern, so values such as `Cabinet 4-B` and campus-specific free-form locations remain valid. Bulk book entry accepts only category IDs and book locations currently present in Category Management; both selectors are populated from the live category query.

The additive Book and Research/Thesis target model is defined by migration `20260816_002_book_research_management.sql`:

- `titles`: one bibliographic title/edition or research work, linked to `categories`.
- `authors`: ordered, normalized author credits owned by a title.
- `research_records`: one-to-one thesis metadata including adviser, abstract, program, code, and viewing state.
- `physical_copies`: accession, barcode, shelf, condition, availability, scan timestamp, and lifecycle per copy.
- `book_titles`: a read-only compatibility view added by migration `20260823_013_book_catalog_compatibility.sql`. It exposes the requested `id`, `title`, aggregated `author`, `isbn`, `publisher`, `publication_year`, and `category_id` contract while keeping `titles`, `authors`, and `physical_copies` authoritative. Catalog-focused composite indexes are added to the normalized source tables; application writes must never target this view.
- `inventory_audit_events`: append-only barcode verification, condition-change, manual availability-change, and lost-override history, including before/after condition and availability values, the physical copy, verifier, barcode snapshot, and timestamp. Migration `20260820_006_inventory_audit_events.sql` creates the table; migration `20260820_008_inventory_condition_availability_policy.sql` expands the audited event and condition contracts without changing `physical_copies.material_id` compatibility.

`physical_copies.material_id` is the backward-compatibility bridge to legacy circulation. Preserve existing `materials.material_id` values during backfill. Archive lifecycle records that have history; do not hard-delete a borrowed, overdue, or historically circulated copy.

Inventory conditions are `Good`, `Fair`, `For Repair`, `Damaged`, and `Lost`. Good, Fair, For Repair, and Damaged changes preserve the copy's current availability exactly; condition and availability are separate audited actions. A librarian may manually toggle an idle copy between `Available` and `Unavailable`. Active loans or assigned reservations block that manual toggle. `Lost` is the sole automatic exception: a transaction forces both normalized and legacy availability to `Unavailable`, releases unclaimed accession assignments back to the pending queue, and records a `Lost Override`. Database triggers preserve this invariant if application code is bypassed. Changing a Lost copy to another condition does not restore availability automatically. `physical_copies.last_scanned_at` supplies the latest verification display, while `inventory_audit_events` preserves the full audit history.

Migration `20260820_009_research_thesis_inventory.sql` adds the independent physically bound research ledger:

- `research_inventory`: thesis title/authors/adviser/year plus a unique accession, barcode, shelf, condition, availability, last-audit timestamp, and row version. It intentionally has no foreign key to `titles` or `physical_copies`.
- `research_inventory_audit_events`: append-only verification, condition, manual availability, and Lost-override history.

Migration `20260821_012_inventory_removal_lifecycle.sql` adds an Active/Archived lifecycle to bound research inventory and extends both book-copy and thesis audit histories with Archived/Deleted events and action reasons. Hard deletion is limited to never-used inventory rows; audit snapshots survive deletion through nullable `ON DELETE SET NULL` parent references. Any circulation, reservation, or audit history requires archive fallback, while active loans and reservations block both operations.

Research conditions use lowercase `good`, `fair`, `for_repair`, `damaged`, and `lost`. Non-Lost changes preserve availability. Lost alone is forced to `unavailable` by both the transactional service and MySQL triggers. Manual availability accepts only `available` or `unavailable`; a Lost record cannot be republished until its condition is changed. Before any condition or availability mutation, the service resolves and locks the optional legacy `materials` row through the unique barcode, then blocks Borrowed/Overdue transactions with 422. Migration `20260820_010_research_inventory_circulation_sync.sql` synchronizes Lost/manual availability to that circulation row without adding a title-table foreign key; Lost also cancels pending/approved/ready pickup assignments. Student catalog reads use `availability_status='available'`. Thesis summaries, registers, CSV, and PDF reports query only `research_inventory`; book reports remain separate.

New publication requests now write `titles`, `authors`, `research_records`, and one independently accessioned `research_inventory` row in the same transaction. Migration `20260820_011_backfill_published_research_inventory.sql` makes older publications visible by retaining their unique `research_code` as the initial accession and barcode; it does not delete or reinterpret their normalized catalog metadata.

Migration `20260823_014_research_catalog_search.sql` adds the nullable `research_inventory.title_id` bridge, backfills older bound-copy rows, and indexes the normalized title/author/research ownership boundaries for student repository searches. `titles`, `authors`, and `research_records` remain the authoritative metadata model; `research_inventory` supplies copy-level shelf and access state. Student and faculty research APIs are GET-only and always return `viewOnly: true`; these records cannot enter borrowing carts or reservation workflows.

Category deletion is blocked while active physical copies, research records, or unbackfilled legacy materials remain assigned. The category reassignment service updates normalized `titles.category_id` and transitional `materials.category_id` in one transaction before deleting the old category.

### Circulation

- `borrow_transactions`: pending, borrowed, returned, and overdue activity.
- `reservations`: material waiting list and expiry status.
- `fines`: one fine record per borrowing transaction.
- `clearance_statuses`: one current standing row per user.

Borrowing triggers enforce:

- One active borrower per material.
- A maximum of two Borrowed/Overdue materials for Student users.
- No active-count limit for Faculty, Librarian, or System Administrator roles.
- Due time at 8:59 AM on the calendar day following `borrowed_at`.
- Material availability updates when borrowing and returning records change.

The reservation migration expands the queue lifecycle to `pending`, `approved`, `ready_for_pickup`, `claimed`, `cancelled`, and `expired`. `material_id` remains the requested catalog/circulation material and nullable `accession_id` identifies the physical `materials` row held for pickup. Ready reservations have a pickup deadline; expiration clears the accession and restores Reserved inventory to Available in one transaction.

Migration `20260823_015_cross_portal_circulation_sync.sql` adds the normalized cross-portal links without removing compatibility identifiers:

- `reservations.book_title_id` and `assigned_physical_copy_id` link queue entries to the authoritative title and accessioned copy.
- `borrow_transactions.physical_copy_id` links circulation history directly to the scanned copy.
- `book_titles` and `borrow_records` are read-only compatibility views; writes continue through `titles`, `physical_copies`, `reservations`, and `borrow_transactions`.
- `admin_notifications` is the shared operational inbox appended in the same transactions as reservation, checkout, cancellation, and return events.
- `library_closed_days` supplies configurable campus closures to the next-operating-day due-date calculation.

Normalized login accounts are linked to operational `users.user_id` values during the migration. New Student registration now creates and links both records transactionally, allowing the JWT account identity to participate in foreign-key-protected circulation workflows.

Checkout locks the borrower, copy, open transactions, and first waiting reservation before writing. Students are capped at two distinct active book titles across loans and reservations; Faculty bypass this cap. Successful checkout fixes the due time at 8:59 AM on the next operating day and synchronizes both normalized and legacy availability rows. Cancellation compacts later queue positions. Return either restores the copy to Available or assigns it to the first waiting request as Ready for Pickup and emits the user/admin notifications in the same commit.

Migration `20260823_016_book_cart_checkout.sql` adds grouped online checkout requests without creating a second writable circulation ledger. Each cart item becomes a `borrow_transactions` row in `Pending` state with a shared UUID `request_group_id`; the `borrow_records` compatibility view exposes that state as `pending_claim`. Submission locks all candidate copy rows, assigns exactly one available, active, non-Lost/non-Damaged book copy per title, changes normalized and legacy availability to `Reserved`, and appends one `borrow_request_submitted` administrative alert in the same transaction. Student capacity is calculated across distinct pending/active loans and pending/approved/ready reservations before insertion; Faculty bypass the two-book cap. At the counter, scanning an assigned barcode converts the existing Pending row to Borrowed instead of creating duplicate history.

Migration `20260823_017_book_circulation_material_bridge.sql` backfills `physical_copies.material_id` for normalized books created without their required circulation compatibility row. New book publication now creates or reuses the matching `materials` Book row in the same transaction before inserting the physical copy. Student catalog availability counts copies with an active lifecycle, an Available state, and a material bridge. Condition is separately audited and does not hide or block Good, Fair, For Repair, or Damaged copies while a librarian keeps them Available. Lost remains the sole automatic exception and is forced to Unavailable before catalog or checkout selection.

Migration `20260823_018_bulk_copy_labels.sql` adds Base64 QR image storage to each normalized physical copy and a year-scoped `barcode_sequences` ledger. Bulk registration locks the current year row, reserves one contiguous serial range, and creates a separate `materials` compatibility row and `physical_copies` row for every requested copy under the same `titles.title_id`. Institutional identities use `STIORMOC<year><six-digit sequence>` barcodes and `STI-ACC-<year>-<six-digit sequence>` accession numbers. The existing `physical_copy_id` remains the canonical primary key; exact unique indexes `idx_unique_barcode` and `idx_unique_accession` are the final storage-level collision barrier.

Migration `20260823_019_existing_book_asset_code_backfill.sql` adds `physical_copy_asset_code_history`, preserving the prior barcode and replacement mapping whenever legacy book copies receive institutional codes. Run `npm run db:backfill:book-codes -w @sti-library/api -- --apply` after migrations. The operation obtains a database advisory lock, locks every normalized book-copy row in one transaction, reserves a contiguous year sequence, synchronizes the linked legacy `materials.barcode`, generates the Base64 QR payload through the production label renderer, and rolls back the complete batch if any copy fails. Running without `--apply` is a read-only preview; already compliant copies are left unchanged.

QR label data is an administrative inventory attribute. Admin/Librarian asset queries may read it and download a rendered PNG; catalog/cart copy queries are barcode-only and exclude `qr_code_data` from both SQL selection and JSON serialization. Both paths use the indexed physical-copy primary key or unique barcode lookup.

Reservation creation counts distinct active Student books across waiting states (`pending`, `approved`, `ready_for_pickup`) and borrowing states (`Pending`, `Borrowed`, `Overdue`). A claimed reservation is represented by its authoritative open borrowing transaction so it is counted once and stops consuming capacity after return. Students stop at two; Faculty bypass the cap. A user cannot hold concurrent reservations for the same material, ISBN, or normalized title, and cannot reserve a title already present in their pending checkout, borrowed, or overdue transactions. The same-title guard is repeated during administrative approval and ready-for-pickup transitions so a stale queue row cannot advance after the user obtains the book through another path.

Migration `20260902_030_clearance_notifications_announcements.sql` adds the nullable `titles.purchase_price` acquisition value and the lost-book reporting workflow. Borrowers may report only their own Borrowed/Overdue transaction. Confirmation snapshots the acquisition price as the replacement charge, marks the copy Lost/Unavailable, stops further overdue escalation for that confirmed loss, and preserves the report and payment state in `lost_book_reports`. Legacy titles without a price require staff to enter the replacement charge during confirmation. Rejection restores the ordinary active-loan path. No report or charge row is deleted.

### Clearance

- `clearance_statuses` remains a refreshable current-standing cache and is never the sole source of truth.
- Live clearance reads derive blockers from Borrowed/Overdue transactions, unpaid `fines`, and unpaid confirmed `lost_book_reports` replacement charges.
- `clearance_overrides` preserves every documented Cleared/Not Cleared exception, its applying staff member, optional expiration, and any later revocation reason and actor.

Student clearance payloads expose the precise unreturned titles, due dates, computed overdue hours, fine calculation basis, lost-book replacement charge, and total outstanding amount. Admin/Librarian clearance reads use the same computation. Applying or revoking an override never changes or removes the underlying loan, fine, loss, or payment record.

### Attendance

- `attendance_logs`: attendance date, time in/out, visit reason, and optional QR reference.
- `academic_terms`: administrator-configured academic-year and semester date ranges used by semester attendance filters and reports.

Migration `20260828_024_admin_attendance_reporting.sql` expands attendance purposes and adds date/presence and purpose/date indexes. Attendance reporting remains read-only and treats `attendance_logs` as immutable operational history. Daily, weekly, monthly, and semester views share the same filter contract; semester ranges are resolved from `academic_terms` instead of hard-coded calendar assumptions. The Admin Active Users directory is derived from normalized `accounts` rows whose `account_status` is exactly `Active` and never exposes password hashes, tokens, or QR secrets.

### Printing

- `print_requests`: protected file metadata, copies, pages, paper size, server-calculated price, cash payment state, queue status, assigned printer, and processor.
- `printers`: named physical printer assets with manually controlled `Online`, `Offline`, or `Unavailable` operational state. No hardware telemetry is assumed.
- `print_pricing_rules`: active server-side price per page by print type and paper size.
- `print_status_history`: append-only request-state audit history.
- `print_cash_payments`: one counter-cash receipt record per print request. Online payment and GCash are not part of the current printing implementation.
- `ink_repository`: per-printer cartridge/color definitions whose authoritative stock is the whole-number `available_bottles` value. Legacy percentage columns remain only for backward compatibility.
- `ink_stock_movements`: append-only bottle restock, issue, adjustment, and reversal records.
- `bond_paper_stocks`: current paper quantities by Short, A4, and Long size. `unopened_reams` is authoritative for the manual physical-stock workflow; `remaining_reams` remains a legacy compatibility field.
- `paper_replenishments`: normalized history of quantities and expenses.
- `paper_stock_movements`: append-only restock and manual ream-opening records with activity codes and before/after balances. Historical fractional print allocations remain preserved as legacy audit rows.

Migration `20260828_025_printing_service_and_bottle_supplies.sql` supplies this contract. Uploaded PDF/DOCX binaries remain outside MySQL in protected server storage; only the sanitized original name and generated storage path are stored. Ink is updated manually by bottle and paper by ream. The application does not estimate ink remaining inside an opened bottle and never changes printer status from imagined consumable telemetry.

Migration `20260828_027_manual_printing_workflow.sql` removes printer hardware from the active request workflow without destructively dropping legacy printer references. `printing_service_settings` is the single administrative switch for accepting student requests and defaults to enabled, so a deployment with zero printer rows remains operational. Librarians download protected request files and print them manually; every download is recorded in `print_file_download_audit`. Ink remains manual whole-bottle inventory, and paper restocks are explicit whole-ream input movements. Legacy `print_requests.printer_id`, `printers`, and optional `ink_repository.printer_id` remain nullable compatibility fields and are not shown in the active interface.

Migration `20260828_028_printing_financial_overview.sql` records required `unit_cost_per_bottle` and `unit_cost_per_ream` values on restocks and adds reporting indexes. Restocking is allowed whenever supplies are needed, stock carries forward, and the server calculates quantity multiplied by unit cost.

Migration `20260828_029_printing_stock_audit_separation.sql` separates cash revenue from stock expenses and makes physical consumption explicit. Loading ink deducts exactly one unopened bottle; opening paper deducts exactly one unopened ream. Both actions use row locks and append the responsible staff account, timestamp, activity code, and before/after balance. Starting a print job no longer deducts fractional paper, preventing a manual ream-opening action from double-counting the same supply. Revenue reports use `print_cash_payments` and include paid requests, sheets, copies, and total revenue. Stock-expense reports use restock movements only and contain no revenue, net result, or profit-margin fields.

### Notifications

- `notifications`: per-user in-app delivery for due reminders, overdue penalties, reservation lifecycle changes, printing updates, library closures, announcements, and lost-book decisions. `dedupe_key` is unique per user so repeat worker executions cannot duplicate a milestone.
- `announcements`: Admin-authored immediate or scheduled campus posts. Only the JWT `Admin` role may create them; all active operational users receive the published notification.
- `announcement_revisions`: immutable initial publication snapshots and future recorded revisions.
- `library_operating_schedule`: Asia/Manila weekly opening hours; `library_closed_days` remains the dated exception ledger.

The notification worker runs within the modular monolith and uses database uniqueness rather than a message broker. It creates 12-hour and 1-hour due reminders, overdue alerts, one notification per reservation/print status, seven-day closure notices, and scheduled announcement fan-out. Read state is owned by the recipient and does not delete the notification.

## Referential-action policy

- Use `RESTRICT` for users, materials, borrowing records, attendance, and print requests whose history must remain.
- Use `SET NULL` for optional staff/asset references when the related staff account or printer can be removed without invalidating the record.
- Use `CASCADE` only for tightly owned child data such as clearance rows, notification rows, fine rows owned by transactions, and paper replenishments owned by a paper-stock definition.

## Money, dates, and booleans

- Money uses `DECIMAL(10,2) UNSIGNED`; never use floating-point types.
- Event timestamps use `DATETIME` or `TIMESTAMP` supported by MySQL 5.6.
- Store one application timezone policy consistently. The current campus display timezone is Asia/Manila.
- Booleans use `TINYINT(1) UNSIGNED` with `0` and `1`.

## Fine calculation contract

Fine records store the basis, overdue units, rate, policy cap snapshot, resulting amount, finalization time, and current derived payment status.

- After the 8:59 AM cutoff on the due date: PHP 2.00 per overdue hour.
- Starting the following day: switch to PHP 10.00 per overdue day.
- Daily calculations count configured library operating days and exclude campus closures.
- The active policy caps one overdue fine at PHP 500.00 unless a later policy version changes that amount.

The application service calculates the fine and writes the audit inputs. The database does not calculate elapsed operating hours because campus holidays and operating-day rules belong in a configurable policy service. Overdue fines continue accruing until the item is returned or its loss is confirmed; staff cannot collect or adjust a changing balance.

Migration `20260902_031_cash_fines_and_receipts.sql` implements the current cash-only fines scope:

- `fine_policy_versions` versions hourly, daily, and maximum-penalty policy values.
- `fine_infractions` documents non-circulation incidents and the staff member who issued them.
- `fine_payment_receipts` is an immutable cash receipt header with a unique receipt number, idempotency key, receiving staff member, and reversible audit state.
- `fine_payment_allocations` applies one receipt to fine or lost-book balances and snapshots each before/after balance. Fine payments may be partial; lost-book replacement charges require full payment.
- `fine_adjustments` preserves documented waivers, reductions, and voids without overwriting the assessed amount.

Online payment, GCash, and CSV fine export are intentionally outside the current implementation. Fine audit reports and student receipts are generated as PDF files from the database ledger. Reversing a receipt never deletes it; the reversal actor, time, and reason remain visible, the allocated balances are recomputed, clearance is refreshed, and the affected user is notified.

Migration `20260902_032_infraction_fine_trigger_compatibility.sql` updates the legacy fine-integrity triggers for the nullable transaction contract. Overdue fines with a `transaction_id` still derive and protect their user from the authoritative borrowing transaction. Standalone behavioral infractions have no borrowing transaction, so their explicitly selected Student/Faculty `user_id` is preserved instead of being replaced with `NULL`.

## Schema-change procedure

1. Update `database/mysql56-schema.sql` with MySQL 5.6-compatible syntax.
2. Preserve table and column meanings used by the API.
3. Add a migration script for existing databases instead of asking users to rerun the complete baseline.
4. Test the migration against a disposable database.
5. Update this context and the API documentation.
6. If Prisma is introduced later, confirm that the selected Prisma version still supports the project's required MySQL server version before making it the migration authority.

Applied migrations are tracked in `schema_migrations` by filename, SHA-256 checksum, and application timestamp. Run `npm run db:migrate -w @sti-library/api`; never edit an already-applied migration—add a new versioned file instead.

Migration `20260824_020_borrow_request_cancellation.sql` extends pending online-cart transactions with the terminal `Cancelled` state, cancellation timestamp, cancelling operational user, and reason. Student/Faculty owners and Admin/Librarian staff share `PUT /api/v1/circulation/requests/:id/cancel`; the service locks the request and copy, verifies ownership or staff authority, permits cancellation only from `Pending`, and restores usable copies in both `physical_copies` and `materials` within the same transaction.

Migration `20260824_021_reservation_desk_fulfillment.sql` adds the nullable, unique `borrow_transactions.reservation_id` link. Moving the queue head to `ready_for_pickup` reserves one accessioned copy and creates one linked `Pending` counter claim; it never creates an active loan. Only Admin/Librarian staff may call `POST /api/v1/circulation/fulfill-claim`, which locks the presented borrower, linked pending claim, ready reservation, and scanned barcode before atomically changing the transaction to `Borrowed`, the reservation to `claimed`, and the copy to `Borrowed`. The overdue worker evaluates the 8:59 AM cutoff, moves elapsed loans to `Overdue`, upserts their fine, marks clearance `Not Cleared`, and appends an administrative alert.

Migration `20260824_022_reconcile_stale_borrowed_copies.sql` repairs legacy `Borrowed` availability flags only when no authoritative Pending/Borrowed/Overdue transaction and no ready-for-pickup reservation owns the copy. It then synchronizes the compatibility `materials` row. Active holds and circulation history are never removed.

Migration `20260824_023_research_asset_qr.sql` adds `research_inventory.qr_code_data`. New research/thesis publications have no category, always begin in `good` condition, select a shelf from the currently managed location list, and reserve one value from the shared year-scoped barcode sequence. The API generates both `STIORMOC<year><sequence>` and `STI-RES-<year>-<sequence>` identities and stores the high-density QR payload. Research remains view-only and never receives a `materials` circulation row. The publication response provides printable/downloadable QR and barcode labels.

Physical book and research/thesis removal requires the copy condition to be `Lost`. Borrowed/Overdue transactions and active reservations remain stronger locks and must be resolved first. A Lost copy with circulation or inventory audit history is archived rather than hard-deleted so its historical references remain intact; the student catalog and active inventory queries exclude the archived row. Student-safe catalog, cart/history detail, and reservation payloads expose condition text without exposing administrative QR data. Reservation condition follows the specifically assigned physical copy when available and otherwise reports the source copy condition while assignment is pending.

Book title covers remain file-backed metadata through `titles.cover_image_path`. Administrative bulk entry accepts a validated JPEG, PNG, or WebP image up to 2 MB, writes it beneath the controlled API assets directory, and student catalog responses expose only its public path.
