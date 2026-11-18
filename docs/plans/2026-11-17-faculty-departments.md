# Faculty departments and report filters

- Why: filter Faculty transactions by their reviewed department.
- Date created: 2026-11-17
- Date last updated: 2026-11-17
- Status: built
- Authorization: implement it also; host it all after. No push.

## How

Add private department assignments, without guessing from Student programs or research departments. Librarian edits a Faculty account department with review, optimistic conflict checks and existing account audit history. Reports use current assignments, not historical affiliation. A separate Faculty department filter is mutually exclusive with Student program and unavailable for Student-only clearance, attendance and inventory snapshots.

## Implementation tracking

- [x] Confirm no existing Faculty department source.
- [x] Tests first, private additive 060 and implementation.
- [x] Verification, review, migration and hosting.

## Change log

- 2026-11-17: Owner authorized Faculty department implementation and hosting. Baseline059; reserve060, next061. Existing records stay unassigned.

## Verification and hosted release

- Hosted and promoted `dpl_7Vdg3Rao8iF2WqrHosSTRamVx6WX` at https://sti-ormoc-smart-library.vercel.app. Canonical health200, healthy/schema ready. Department and filtered report routes return401 unsigned. Public entry index-Byzo9-Jq.js, CatalogReportsPage-BfW3B35a.js and AdminUsersPage-C8PgOdfI.js contain the new department controls.
- Full API: 794 tests passed. Full web: 128 files, 564 tests passed. Typecheck and production build passed. Initial concurrent runs had a failed auth worker and a frontend thread termination timeout; bounded sequential reruns passed completely. No test assertion was weakened to hide a failure.
- Focused real-Postgres-engine tests cover explicit assignment, clearing, audit history, stale-write conflicts, wrong target role, unauthorized actor, browser-role refusal and unchanged accounts. Report SQL tests select only assigned Faculty, combine filters before pagination and export all25 matching rows from page2. CSV/PDF carry department criteria. Focused API coverage ran; imported unrelated modules explain the low whole-import-graph coverage and are not claimed covered by these feature tests.
- Native browser exercised the actual editor using local synthetic API responses: input, review from Not assigned to Computing, confirmation, success message and unchanged-save disabling. This created no live Faculty assignment. Synthetic two-page PDF generated successfully and department criteria were checked in extracted text. Local harness is archived under ignored output.
- Applied only owner-approved060 after verifying059 checksum against the live public ledger. Before/after fingerprints of12 existing tables matched exactly. The new assignment table was empty, RLS enabled, anon/authenticated reads denied. Existing accounts, profiles, holdings, requests, fines and payments were unchanged. Applied060/next061.

## Use and limits

Librarian: Library users, open a Faculty account, enter the school-confirmed department, select Review department, then Confirm department. Blank marks Not assigned after the same review. Audit history retains the before/after department. Concurrent edits reject stale expectations. Department changes do not reset credentials or modify academic, borrowing or financial records.

Reports: enter an exact Faculty department (case-insensitive). Student program and Faculty department are separate, mutually exclusive filters. Department applies to transaction reports, including fines, payments, requests, circulation and printing. Student-only clearance, attendance and inventory/supply snapshots reject this unsupported filter. Unassigned Faculty remain visible in unfiltered reports and exact borrower searches. Existing affiliations are never guessed from research classifications or Student courses. Current assignments filter earlier transactions; historical affiliation at transaction time is not reconstructed.

## Review and handoff

Reviewed server authorization, CSRF integration, SQL parameters, row locking, audit size limits, role validation, report row ceilings, export parity and React async state. New schema readiness includes all four assignment columns. The release overlays only feature paths onto the prior hosted package, preserving hosted-specific readiness behavior. No dependency, GitHub push, unrelated commit or live synthetic record was added.

Configured wiki vault unavailable. Dated handoff for wiki/hot.md and wiki/entities/StiOrmocLibrary.md: Faculty department setup/filter hosted2026-11-17;060 applied/061 next; Faculty assignments intentionally empty until Librarian review; tests794API/564web; no push.

## Final change log

- 2026-11-17: Owner explicitly approved live060 and hosting. Completed implementation, preservation checks, automated/browser/export verification, review and canonical promotion. The earlier Phase7 statement that Faculty departments were unimplemented is superseded by this release.
