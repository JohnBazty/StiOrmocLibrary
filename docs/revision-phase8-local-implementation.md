# Revision Phase 8 — Dashboards, Reports, usability and acceptance

## Why
Bring live operational and account work together, centralize authorized reports, and verify complete revision workflows without fabricating activity or altering actual records.

| Field | Value |
| --- | --- |
| Date created | 2026-10-12 |
| Date last updated | 2026-10-12 |
| Status | `inprogress` |

## How
Extend the existing dashboard and reporting modules. Librarian sees library/account/clearance/collection tasks; Staff sees only desk operations. Student/Faculty summaries remain owner-scoped. Replace the sample report overview with live, filtered source records and reusable CSV/PDF exports. Keep reports separate from Maintenance and retain compatible endpoints and individual payment/document access.

The active database remains Supabase Postgres through the current API. Latest applied product migration is 026, next unused 027; MySQL rollback reference 048, next 049. No schema change, actual-record cleanup, roster import, GitHub push or deployment is planned. Semester verification (Phase 2) and school-approved collection criteria remain pending; preserve the owner's temporary active-account checkout policy.

## Implementation tracking
- [x] Read repository/product/schema authorities and the Phase 8 scope.
- [x] Build live actionable role dashboards with honest unavailable states.
- [x] Build filtered report previews and exports from actual source records.
- [x] Confirm Maintenance/report separation and permission boundaries.
- [x] Verify isolated end-to-end workflows and regression gates.
- [x] Record local checks and remaining school inputs; prepare the human trial checklist.
- [ ] Conduct the human Librarian trial, resolve feedback and record sign-off.

## Delivered locally

- Librarian: 17 live task cards, account/clearance and approval work, preparation/pickup deadlines, overdue returns/handbacks, printing/supplies and collection review. Existing operational totals/charts remain available. Cards link to the authorized detail pages.
- Staff: seven desk-operation counts, earliest pickup deadlines, operating conditions and assigned-task shortcuts including Announcements. Account administration, reports and policy controls remain denied.
- Student/Faculty: actionable owner-scoped summary cards, borrowing/request/notice links and clearance calculated with the same service as the clearance page. Dashboard reads do not update the clearance cache. Missing account links show Needs verification rather than a fabricated Cleared result.
- Reports: 13 live source reports: holdings, take-home borrowing, returns, requests/pickups, in-library use, attendance/usage, fines/obligations, fine payments, printing requests, printing cash revenue, restock expenses, current supplies, and student clearance. Existing Phase 7 collection reports and current dashboard-summary PDF remain on Reports.
- Custom date ranges or academic-term dates apply to transaction reports. Current holdings, supplies and clearance explicitly describe current snapshots. Attendance includes concurrent seat peak, visit counts and completed-visit durations. Report criteria and Asia/Manila timestamps accompany CSV/PDF output.
- Preview pages show 20 rows; exports contain all matching rows. More than 20,000 matches produces an explicit narrowing request. Literal search and exact status are applied before the bounded SQL fetch; no silent truncation. CSV formula protection and integrity sealing are retained; PDFs embed Unicode fonts.
- Loading, request failure and actual empty results are distinct. Dashboard task refresh failures label retained data as the last successful load. Reports clear stale previews when filters change. New controls use responsive grids, scrollable previews and keyboard-accessible links.
- No export controls were added to Maintenance. Individual printing documents and payment records remain accessible through their existing authorized flows. Archived invoices, reviews and interactive maps remain deferred.

## Verification recorded 2026-10-12

| Check | Result |
| --- | --- |
| API tests | 344 passed, 0 failed |
| Web tests | 157 passed across 57 files |
| Type checks / production build | Passed; existing bundle-size advisory remains |
| Live report source reads | All 13 loaded from the current database |
| Live CSV/PDF checks | All 26 exported; CSV integrity and PDF signatures verified |
| Running HTTP/proxy checks | Active Admin, Student, Librarian and Staff permissions; all 13 previews; CSV/PDF downloads; invalid-date 422; anonymous 401 |
| Isolated Phase 8 workflow | Public catalog -> real login -> request -> Staff readiness -> signed QR attendance -> scanned checkout -> scanned return; owner-only summaries, in-library clearance and report reconciliation/date filters passed |
| Phase 5 regression | QR eligibility, legacy guards, policy/calendar, duplicate/concurrent checkout, return/preparation, in-library separation and closing review passed |
| Phase 6 regression | Request race/retries, exact Manila pickup deadline, multi-copy pickup, attendance/barcode guards, cancellation/return/expiry advancement and email recovery passed |
| PDF visual review | Report tables and named fixture QR/barcode labels rendered and inspected |
| Public browser check | Anonymous catalog reloaded with covers, availability/copy counts and borrow-to-login links; mobile rendering inspected |
| Human Librarian acceptance | Pending; automated checks are not a substitute for this review |

The isolated verifier clones table structure only into a uniquely named disposable schema, creates independent fixture identities/sequences, performs service workflows, and removes that schema in `finally`. Before/after fingerprints confirm public accounts, users, titles, copies, loans and requests are unchanged. No test email is sent. Generated test passes belong only to those disposable fixtures and cannot authenticate in the actual library.

Repeat the automated acceptance with `node apps/api/scripts/verify-phase8-acceptance.ts`. Local logs and rendered test artifacts are under ignored `output/`; the source verifier and this work record are reviewable in Git.

## Remaining acceptance and school inputs

Use [the Librarian trial guide](revision-phase8-librarian-trial.md) to record actual usability feedback and device scanning checks. Phase 8 remains `inprogress` until this required human review is completed. Revision Phase 2 enrollment/semester roster validation is still pending; checkout retains the owner's approved temporary active-account policy and its visible warning. Collection minima and course mappings still need school approval; these reports do not certify CHED compliance. Authenticated mobile screens have component/build checks; human device review remains part of sign-off.

Database tracker stays Postgres 026 applied / next 027, MySQL reference 048 / next 049. No DDL, actual-record cleanup, GitHub push or deployment was performed for Phase 8.

## Change log
- 2026-10-12: Owner authorized implementation of the final revision phase. Began with existing uncommitted Phase 6/7 work preserved. Human Librarian usability feedback will be recorded separately from automated acceptance; no claim of school sign-off.
- 2026-10-12: Implemented role tasks, source reporting and canonical read-only dashboard clearance. Automated/live local verification passed; restarted the project. Required human Librarian acceptance remains open.
