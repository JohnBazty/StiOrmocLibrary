# Phase 7: filtered reports and acceptance

- Why: align preview and exports with authoritative operational records.
- Date created: 2026-11-17
- Date last updated: 2026-11-17
- Status: built
- Authorization: finish phase 7; host it after. No push.

## How

Extend existing reports with exact borrower IDs, Print/Photocopy service filters and loan date basis. Apply SQL filters before row ceiling. Remove the operational fine shortlist from report reads. Preserve private authorization, read-only transactions, Manila day boundaries, CSV formula protection and all-row exports. No migration; applied 059, next unused 060.

## Implementation tracking

- [x] Inspect current source and scope.
- [x] Add regression test and observe failure.
- [x] Build and verify report improvements.
- [x] Review, host and record remaining acceptance limits.

## Change log

- 2026-11-17: Owner authorized completion and hosting. Working in served main-sync checkout on feat/phase7-reports; existing dirty work preserved.

## Verification and release

Hosted and promoted deployment `dpl_8BKKeYrec8BLbZ8GYgsBbT8xcXFi` at https://sti-ormoc-smart-library.vercel.app. Canonical health returns 200, healthy/schema ready. Report preview and CSV export return 401 JWT_REQUIRED unsigned. Entry index-CHBYjI1Q.js; report asset CatalogReportsPage-BaFZNGaB.js. Release overlays four explicit runtime paths onto the previous hosted package. Existing unrelated dirty changes remain in the served checkout; no GitHub push or unrelated commit.

Full API suite: 789 passed. Full web suite: 127 files, 562 tests passed. After the final date-boundary/report review, 12 affected API tests passed, then seven final report tests passed. Typecheck and production build passed after final edits. Focused report/payment coverage ran; broader imported modules remain uncovered by that focused run. A PGlite integration test executes actual parameterized SQL for combined borrower/program/service/date filters, verifies fractional seconds at day end and excludes midnight of the next day. All 25 matching rows survive page=2 into CSV. CSV integrity/formula and role denial tests pass. Existing financial records are never changed by these report reads.

The actual React report form was rendered in the native browser with synthetic local responses. Borrower/program controls and Apply filters worked. This was a narrow panel visual check, not comprehensive device/high-zoom acceptance. A 45-row, two-page synthetic PDF was generated; first-page rendering was visually inspected for table/header alignment and complete filter criteria. Local harness and evidence remain ignored under output. No real borrower report, external email, push or payment was created during acceptance.

## Contracts and remaining acceptance

Date basis choices apply to take-home/return reports. Print/Photocopy applies to printing requests. Exact borrower IDs and exact Student program/strand apply to supported transaction reports and clearance. Programs use current saved profiles, not reconstructed historical enrollment. Attendance retains its existing search/status and concurrent-seat summary; unsupported borrower/program combinations are rejected to avoid inconsistent metrics. Holdings, supplies and clearance remain explicitly current snapshots. Acquisition-date inventory reporting and Faculty department classification are not added in this release. Reports exceeding 20,000 matching rows fail with a narrowing instruction rather than silently truncating. Fine reporting no longer inherits the operational 5,000-item shortlist; fine date ends are exclusive next-midnight.

Technical report implementation is built and hosted. Final roadmap acceptance remains open: actual school barcode/scanner/manual confirmation, real-device push and camera trials, final document/printer agreement, hosted payment/callback and librarian usability acceptance. Existing Phase 1–6 test evidence is retained; these external trials were not represented as passing in this phase. No new database migration: applied 059, next unused 060. No live operational write or schema change occurred.

## Review

Reviewed correctness, permissions, SQL parameterization, CSV formulas, React filter state and financial distinctions. Corrected attendance summary/filter mismatch by rejecting unsupported controls; rejected invalid date/service combinations and invalid semester dates. CSV/PDF share the service read and active filters; exports retain every matching row independent of preview pagination. PDF banner height now accommodates wrapped criteria. Outstanding fines remain debt, separate from issued principal and payment fees.

## Final change log

- 2026-11-17: Completed technical report release, automated/SQL/browser/PDF checks and authorized hosting. Kept broader human/device acceptance explicitly open. Wiki vault unavailable; dated handoff for hot.md and entities/StiOrmocLibrary.md: Phase 7 reports hosted; 059 applied/060 next; real-world acceptance still pending; no push.

- 2026-11-17 follow-up: Faculty department setup and filtering are now built and hosted with owner-approved060/next061. See [implementation and verification](2026-11-17-faculty-departments.md). Earlier unimplemented-department notes describe the previous release.
