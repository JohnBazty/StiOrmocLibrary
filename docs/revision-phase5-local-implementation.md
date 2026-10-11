# Revision Phase 5 — Scan borrowing, returns and in-library use

| Field | Value |
| --- | --- |
| Date created | 2026-10-11 |
| Date last updated | 2026-10-11 |
| Status | `built` |

## Why

The owner authorized Revision Phase 5. Replace routine manual identity lookup with QR/copy scans and enforce eligibility inside the transaction while retaining the authoritative take-home loan ledger and incident/override history.

## Approved decisions

- Regular books and reading-only physical materials may be used in-library. Digital research remains view-only.
- Hand back before the same operating day's attendance cutoff (currently 6:55 PM). In-library use does not consume take-home loan slots; it requires a seat-counted current visit.
- A copy not handed back remains assigned and is flagged for staff review. Attendance checkout never returns a physical copy. No automatic take-home overdue fine applies.
- Phase 2 enrollment validation is pending. Temporarily allow approved Active linked accounts and disclose **Enrollment not verified**; do not claim roster eligibility.

## How

Reuse signed attendance credentials, approved profile photos, the operating calendar, versioned borrowing policy, fine allocations, clearance overrides and existing loans. Add server-only scan confirmation receipts and a separate physical in-library ledger in reviewed Postgres file `023_revision_phase5_desk_circulation.sql`. Lock the shared operating profile before borrower/copy/queue rows; retain scan request IDs across retries. Returned queue copies enter preparation with no pickup deadline until staff marks ready. Legacy API checkout receives the same eligibility checks.

Applied reviewed Postgres `023_revision_phase5_desk_circulation.sql` and `024_revision_phase5_reading_materials.sql` individually. The latter links native `research_inventory` physical theses directly to in-library use without creating duplicate book inventory. Existing users, loans, reservations and copies retained. MySQL rollback reference stays 047 unapplied / next 048. Latest product Postgres file 024; next unused 025. No push or deployment.

## Implementation tracking

- [x] Read references and inspect current database/policies.
- [x] Confirm in-library rules and temporary enrollment behavior.
- [x] Add and verify additive schema.
- [x] Implement scan previews, atomic confirmation and eligibility.
- [x] Implement in-library hand-back and closing review.
- [x] Add desk UI and user history.
- [x] Verify restrictions, duplicate/concurrent writes, calendar and return/fine behavior.
- [x] Restart locally and update final work record.

## Verification and limits

- 298 API tests and 129 web tests passed; full API/web build and type checks passed.
- Isolated Postgres verification applies both actual DDL files in a disposable schema with UTC connections. Covers missing attendance, legacy checkout guards, approved due calendar, two-book limits/Faculty policy, reading-only books/native theses, competing operators, duplicate confirmations and returns, explicit holds/unpaid/inactive accounts, queue preparation with no pickup timer, closing review without implicit hand-back, late-return fines even before the overdue worker runs, and account-scoped history. Scratch schema removed; public loan count unchanged.
- Local HTTP checks: Librarian/Staff desk access 200; Admin/Student denied 403; anonymous denied 401. Student own in-library history 200. No active Faculty account exists for the live HTTP check; Faculty behavior is covered in isolated integration and role guards.
- Browser verified the three modes, disabled confirmation before scans, in-library notice/history, and return barcode entry. Disposable UI account removed after verification. No real checkout or inventory import performed for this browser check.
- Local web: http://localhost:5173/. Librarian desk: `/librarian/circulation`; Staff desk: `/staff/circulation`.
- Phase 2 enrollment roster validation remains pending; approved Active accounts temporarily pass this step with **Enrollment not verified** shown. This is the owner's accepted interim policy.
- QR/barcode camera and uploaded-code-image paths are available; physical camera/scanner hardware was not tested. Keyboard/paste verification and confirmation behavior are covered by UI tests.

## Change log

- 2026-10-11: Owner authorized Phase 5 and approved both policy questions. Implementation started locally; existing records retained.
- 2026-10-11: Completed locally; additive Postgres 023/024 applied. Automated, isolated database, live HTTP and browser acceptance passed. No push or deployment.
