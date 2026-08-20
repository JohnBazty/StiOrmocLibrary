# Database Schema Context

## Target requirements versus current baseline

The target product requirements are the preserved PDFs indexed by [source-of-truth.md](source-of-truth.md). This file documents the **currently implemented** database baseline; it must not override newer product requirements.

Known target gaps include Library Staff/Student Assistant authorization, Archived accounts, operating calendars and configurable policies, renewals, fine caps and infractions, cash/GCash payment verification, expanded reservation/printing states, richer catalog/research/inventory data, dynamic QR attendance, print revenue/supply history, and archive/clearance audit trails. Add these through versioned, backward-safe migrations before depending on them in application code.

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
           |          +-- fines
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

The additive Book and Research/Thesis target model is defined by migration `20260816_002_book_research_management.sql`:

- `titles`: one bibliographic title/edition or research work, linked to `categories`.
- `authors`: ordered, normalized author credits owned by a title.
- `research_records`: one-to-one thesis metadata including adviser, abstract, program, code, and viewing state.
- `physical_copies`: accession, barcode, shelf, condition, availability, scan timestamp, and lifecycle per copy.
- `inventory_audit_events`: append-only barcode verification, condition-change, manual availability-change, and lost-override history, including before/after condition and availability values, the physical copy, verifier, barcode snapshot, and timestamp. Migration `20260820_006_inventory_audit_events.sql` creates the table; migration `20260820_008_inventory_condition_availability_policy.sql` expands the audited event and condition contracts without changing `physical_copies.material_id` compatibility.

`physical_copies.material_id` is the backward-compatibility bridge to legacy circulation. Preserve existing `materials.material_id` values during backfill. Archive lifecycle records that have history; do not hard-delete a borrowed, overdue, or historically circulated copy.

Inventory conditions are `Good`, `Fair`, `For Repair`, `Damaged`, and `Lost`. Good, Fair, For Repair, and Damaged changes preserve the copy's current availability exactly; condition and availability are separate audited actions. A librarian may manually toggle an idle copy between `Available` and `Unavailable`. Active loans or assigned reservations block that manual toggle. `Lost` is the sole automatic exception: a transaction forces both normalized and legacy availability to `Unavailable`, releases unclaimed accession assignments back to the pending queue, and records a `Lost Override`. Database triggers preserve this invariant if application code is bypassed. Changing a Lost copy to another condition does not restore availability automatically. `physical_copies.last_scanned_at` supplies the latest verification display, while `inventory_audit_events` preserves the full audit history.

Migration `20260820_009_research_thesis_inventory.sql` adds the independent physically bound research ledger:

- `research_inventory`: thesis title/authors/adviser/year plus a unique accession, barcode, shelf, condition, availability, last-audit timestamp, and row version. It intentionally has no foreign key to `titles` or `physical_copies`.
- `research_inventory_audit_events`: append-only verification, condition, manual availability, and Lost-override history.

Research conditions use lowercase `good`, `fair`, `for_repair`, `damaged`, and `lost`. Non-Lost changes preserve availability. Lost alone is forced to `unavailable` by both the transactional service and MySQL triggers. Manual availability accepts only `available` or `unavailable`; a Lost record cannot be republished until its condition is changed. Before any condition or availability mutation, the service resolves and locks the optional legacy `materials` row through the unique barcode, then blocks Borrowed/Overdue transactions with 422. Migration `20260820_010_research_inventory_circulation_sync.sql` synchronizes Lost/manual availability to that circulation row without adding a title-table foreign key; Lost also cancels pending/approved/ready pickup assignments. Student catalog reads use `availability_status='available'`. Thesis summaries, registers, CSV, and PDF reports query only `research_inventory`; book reports remain separate.

New publication requests now write `titles`, `authors`, `research_records`, and one independently accessioned `research_inventory` row in the same transaction. Migration `20260820_011_backfill_published_research_inventory.sql` makes older publications visible by retaining their unique `research_code` as the initial accession and barcode; it does not delete or reinterpret their normalized catalog metadata.

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

Reservation creation counts distinct active Student books across reservation states (`pending`, `approved`, `ready_for_pickup`, `claimed`) and borrowing states (`Pending`, `Borrowed`, `Overdue`). Students stop at two; Faculty bypass the cap. A user cannot hold concurrent reservations for the same material, ISBN, or normalized title.

### Attendance

- `attendance_logs`: attendance date, time in/out, visit reason, and optional QR reference.

### Printing

- `print_requests`: file metadata, copies, print type, price, queue status, and processors.
- `printers`: named physical printer assets and locations.
- `ink_repository`: per-printer cartridge/color levels and thresholds.
- `bond_paper_stocks`: current paper quantities by Short, A4, and Long size.
- `paper_replenishments`: normalized history of quantities and expenses.

Uploaded file binaries must remain outside MySQL. Store only the file name and storage path.

### Notifications

- `notifications`: due dates, penalties, reservation arrivals, and printing updates.

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

Fine records store the basis, overdue units, rate, and resulting amount.

- After the 8:59 AM cutoff on the due date: PHP 2.00 per overdue hour.
- Starting the following day: switch to PHP 10.00 per overdue day.

The application service calculates the fine and writes the audit inputs. The database does not calculate elapsed operating hours because campus holidays and operating-day rules belong in a configurable policy service.

## Schema-change procedure

1. Update `database/mysql56-schema.sql` with MySQL 5.6-compatible syntax.
2. Preserve table and column meanings used by the API.
3. Add a migration script for existing databases instead of asking users to rerun the complete baseline.
4. Test the migration against a disposable database.
5. Update this context and the API documentation.
6. If Prisma is introduced later, confirm that the selected Prisma version still supports the project's required MySQL server version before making it the migration authority.

Applied migrations are tracked in `schema_migrations` by filename, SHA-256 checksum, and application timestamp. Run `npm run db:migrate -w @sti-library/api`; never edit an already-applied migration—add a new versioned file instead.
