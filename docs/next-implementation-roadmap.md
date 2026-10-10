# STI ILMS Next Implementation Roadmap

## Why

STI ILMS already implements much of the foundation described in the feature review: circulation, reservations, calendar-aware due dates and fines, in-app notifications, barcode labels, account lifecycle controls, inventory audit events, and catalog/inventory exports. The next work should close the operational gaps around those foundations before starting large standalone modules such as acquisitions or MARC cataloguing.

## Plan metadata

- **Date created:** 2026-10-10
- **Date last updated:** 2026-10-10
- **Status:** `planned`
- **Active database:** Supabase PostgreSQL
- **Next migration numbers:** Supabase `016`; MySQL rollback reference `046`

## Objective

Deliver a reliable, policy-controlled circulation workflow first, then add complete stocktake and exception-management workflows. Every decision that blocks, warns, overrides, renews, charges, or changes inventory must be explainable and auditable.

## Constraints and assumptions

- Preserve the Node.js/Express modular monolith and React web application.
- Keep Supabase PostgreSQL as the active database and MySQL as the rollback reference.
- Reconcile the known Supabase migration-ledger gaps before any whole-directory replay.
- Preserve current API behavior while new policy and audit fields are introduced additively.
- Reuse existing `borrow_transactions`, `reservations`, `fine_policy_versions`, `notifications`, `inventory_audit_events`, account lifecycle, and label-generation code.
- Do not add live registrar integration. The approved product scope supports controlled file import, while live synchronization remains out of scope.
- Do not automatically charge long-overdue or damaged items without librarian review.

## Current baseline: do not rebuild these

- Student two-book capacity checks and Faculty exemption already exist, but the limits are hard-coded.
- Due dates already roll past Sundays and configured closed dates, but loan duration and cutoff are hard-coded.
- Fine rates and caps already have versioned policy storage.
- Reservation states, pickup handling, and queue advancement already exist.
- Due, overdue, reservation, printing, closure, and announcement notifications already exist in-app.
- Book and research barcode/QR label generation and batch copy registration already exist.
- Account activation, deactivation, archiving, and management audit events already exist.
- Inventory barcode verification and condition/availability audit events already exist.
- Catalog and inventory CSV/PDF exports exist; broad operational reporting does not.

## Recommended delivery order

### Release 0 - Make background work reliable

**Outcome:** Existing reminders, overdue processing, reservation expiry, and future review queues run reliably in production.

1. Finish the durable scheduled-job foundation already identified in `docs/system-fixes-and-features-plan.md`.
2. Move notification generation, overdue escalation, and reservation expiry out of in-process timers into authenticated scheduled endpoints or an equivalent durable runner.
3. Add a job-run ledger with job name, scheduled time, start/finish time, status, processed count, error summary, and idempotency key.
4. Add locking so two overlapping runs cannot process the same work twice.
5. Add an administrator health view showing the last successful run and any failure requiring attention.

**Primary areas:** `apps/api/src/modules/notifications`, `apps/api/src/modules/circulation`, `apps/api/src/modules/reservations`, deployment configuration, and a new additive Supabase migration.

**Done when:** Re-running the same schedule window creates no duplicate notifications, fines, expirations, or queue transitions; failures are visible and retryable.

### Release 1 - Versioned circulation policy and preflight decisions

**Outcome:** Checkout and return decisions are consistent, configurable, and understandable to staff.

1. Add `circulation_policy_versions` with effective dates and immutable historical versions.
2. Start with the policies already enforced in code: borrower role, maximum active titles, loan duration, due cutoff, renewal allowance, reservation limit, grace period, and whether a material/category may leave the library.
3. Keep fine rates in the existing `fine_policy_versions`; reference the effective fine policy instead of duplicating it.
4. Introduce one circulation decision service used by cart submission, counter checkout, return, reservation claim, and later renewal.
5. Return structured decisions:
   - `blocker`: action cannot continue;
   - `warning`: authorized staff may continue with a required reason;
   - `alert`: information only.
6. Re-run the decision service inside the final database transaction so a stale preflight cannot bypass a new loan, reservation, fine, or policy version.
7. Add `circulation_decision_events` to record action, result code, severity, policy version, actor, override reason, borrower, copy, and transaction.
8. Update the Admin circulation screen to show grouped blockers, warnings, and alerts before confirmation.

**Primary areas:** `apps/api/src/modules/circulation`, `apps/web/src/features/circulation`, `database/supabase/016_*`, MySQL rollback migration `046`, schema context, and API documentation.

**Done when:** The same borrower/copy state produces the same result through online request and counter checkout; warnings cannot be overridden without an authorized actor and reason; old loans retain the policy snapshot that created them.

### Release 2 - Complete renewal management

**Outcome:** Students can request the single-day renewal defined by the product requirements, while the API makes the final decision.

Behavioral plan: [Complete Renewal Management Implementation Plan](complete-renewal-management-plan.md).  
Build plan: [Renewal Management Implementation Plan](renewal-management-implementation-plan.md).

1. Add append-only `loan_renewal_requests` (reuse `circulation_decision_events` or preflight audit when available); do not hide history in `borrow_transactions.due_at` alone.
2. Use the shared decision service to check due status, active reservations, unpaid fine blocks, renewal count, material eligibility, account state, and the effective policy.
3. Compute the new due date using the operating calendar and save the old due date, new due date, policy version, requester, decision source, reason, and timestamps.
4. Add a Student/Faculty request action and Admin/Librarian renew-on-behalf (immediate API decision; no staff approval queue).
5. Notify the borrower on approval or rejection and the new due time; make due-reminder dedupe keys renewal-aware.

**Done when:** Duplicate requests and retries are idempotent; a reserved or overdue item cannot be renewed; every due-date change has a visible reason and actor.

### Release 3 - Stocktake sessions and discrepancy review

**Outcome:** Inventory scanning becomes a controlled session with a reviewable result, not only a last-scanned timestamp.

1. Add `stocktake_sessions`, `stocktake_expected_items`, `stocktake_scans`, `stocktake_discrepancies`, and `stocktake_resolution_events`.
2. Scope a session by shelf, category, room, or collection and snapshot the expected active inventory at session start.
3. Record unknown barcodes and duplicate scans without aborting the session.
4. Classify missing, wrong-location, borrowed-but-found, lost-but-found, archived, unknown, duplicate, and out-of-scope results.
5. Require librarian review before applying any location, condition, or availability correction.
6. Write approved corrections through the existing inventory services so existing audit events and safeguards remain authoritative.
7. Export the discrepancy report to CSV and PDF.

**Done when:** A completed session can be reproduced from its snapshot and scan history, and finishing a session never silently changes inventory state.

### Release 4 - Long-overdue and damage case management

**Outcome:** Exceptions are handled through queues with explicit human decisions.

1. Add a configurable long-overdue threshold to circulation policy.
2. Create a long-overdue review case when the durable job runner finds an eligible transaction.
3. Support contact logged, deadline extended, returned, reported lost, confirmed lost, and closed outcomes.
4. Route loss confirmation through the existing lost-book report and charge workflow; never create a replacement charge merely because the threshold elapsed.
5. Add damage assessments with type, severity, notes, protected image references, discovery date, borrower-at-time, assessor, repairability, costs, amount charged, and final resolution.
6. Reuse fine adjustments/payment records for any approved borrower charge rather than creating a second money ledger.

**Done when:** Every case has one current state, a complete event history, and no automatic financial consequence without staff confirmation.

### Release 5 - Patron import, operational reports, and audit consolidation

**Outcome:** Librarians can maintain official patron data and answer routine operational questions without direct SQL.

1. Add staged CSV import batches for registrar files: upload, validate, preview, apply, and retain errors.
2. Match primarily by official school ID; reject ambiguous duplicates.
3. Create or update students, deactivate absent/inactive records only after preview approval, and never delete historical patrons.
4. Record batch actor, source filename, row counts, changes, failures, and before/after values.
5. Add reports in small groups using stable filters and shared export infrastructure:
   - circulation and overdue;
   - fines, balances, and clearance blockers;
   - inventory discrepancies, lost, damaged, and archived items;
   - active/inactive patrons and import changes;
   - demand, usage, and collection age.
6. Consolidate staff-facing audit search across circulation decisions, account management, inventory, fines, stocktake, and imports without replacing their authoritative module ledgers.

**Done when:** An import can be previewed and safely retried, and each listed report can be reproduced with date filters in both the UI and CSV/PDF export.

### Release 6 - Lower-priority collection and administrative modules

Implement only after Releases 0-5 are stable:

1. Catalog authority management and bulk correction/import/export.
2. Collection review and weeding recommendations with librarian approval.
3. Acquisitions: requests, suppliers, quotations, budgets, purchase orders, receiving, invoices, and copy creation.
4. Backup/restore runbooks, retention, privacy review, and tested restoration evidence.
5. Optional serials, MARC, Z39.50/SRU, RFID, SIP2, offline circulation, interlibrary loans, and multi-branch transfer only when STI confirms a real need.

## First implementation slice

Build Release 0 and the smallest vertical part of Release 1 together:

1. Reconcile the hosted Supabase migration ledger and reserve migration `016`.
2. Add the durable job-run ledger and scheduled execution endpoint.
3. Move the three existing workers to that runner.
4. Add the versioned circulation-policy table with seeded values matching current behavior.
5. Extract current checkout rules into a shared decision service without changing outcomes.
6. Add a read-only preflight endpoint and grouped Admin display.
7. Add warning override reason and decision audit only after the read-only results match current behavior.
8. Run unit, integration, type, build, migration, scheduled-retry, and browser checkout tests.

This slice produces visible staff value while keeping risk contained: policy defaults match today's rules, checkout behavior remains backward compatible, and scheduled work becomes dependable before renewals and review queues rely on it.

## Verification checklist for every release

- Success, invalid input, unauthorized role, duplicate/retry, stale-state, and rollback tests.
- PostgreSQL migration tested on a disposable database; MySQL rollback migration remains additive.
- API tests, web tests, type checking, and production build pass.
- Browser verification for both Student and Admin/Librarian paths.
- Hosted scheduled jobs, database writes, notifications, and audit entries verified with disposable records.
- Temporary test records removed and cleanup confirmed.
- Documentation, API reference, schema context, plan status, and migration trackers updated.

## Risks and controls

- **Policy drift:** seed the new policy tables with values identical to current hard-coded behavior and compare old/new decisions in tests.
- **Race conditions:** calculate and enforce decisions inside the same transaction with row locks.
- **Duplicate scheduled work:** use unique idempotency keys and a job-run lock.
- **Audit fragmentation:** keep module-specific ledgers authoritative and provide a read-only combined search view.
- **Scope growth:** defer acquisitions and professional-library integrations until core circulation and inventory operations are stable.

## Implementation tracking

- [x] Current code, schema, active plans, and source-of-truth requirements reviewed.
- [x] Existing capabilities separated from true gaps.
- [x] Recommended delivery order defined.
- [ ] Roadmap approved by Ethan.
- [ ] Release 0 moved to `inprogress`.
- [ ] Release 1 implemented and verified.
- [ ] Later releases scheduled after acceptance of the preceding release.

## Change log

- **2026-10-10:** Initial roadmap created with status `planned`. Prioritized durable production scheduling, versioned circulation policy, structured preflight decisions, renewals, stocktake, and exception queues before acquisitions and optional Koha-style integrations.
- **2026-10-10:** Release 2 aligned with the approved renewal plan: immediate API decisions, `loan_renewal_requests` only (no staff queue / `loan_renewal_events`), and link to the build-ready implementation plan.
