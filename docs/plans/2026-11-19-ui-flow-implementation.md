# Implement the 16-point UI flow review

Why: Give library staff one clear home for catalog work and remove duplicated tables, misplaced controls and unnecessary steps while preserving all current capabilities.

Date created: 2026-11-19  
Date last updated: 2026-11-19  
Status: inprogress

## Authorization and baseline

Owner explicitly requested implementation of `tmp/audits/2026-11-19-ui-flow-review.md` and hosting on the existing live version. This authorizes the UI work and deployment after verification. It does not authorize applying unrelated borrowing migrations or changing operational records.

Preserve verified production `dpl_4kU9qECe6XJTnJhq7A58fTq669j1`, including live Dewey and notifications. Reconstructed and SHA-1 verified 1,131 source files in ordinary isolated folder `C:/Users/JOHN/AppData/Local/Temp/sti-ui-flow-20261119`, with branch `feat/ui-flow-review` from a recorded production baseline. The active checkout has unrelated edits and is preserved. No worktree, symlink, environment-file copy or destructive cleanup is used. Current recorded migration 069; unrelated drafts 070/071 remain unapplied, next unused file 072. No schema change is planned.

## How

Use existing React components, routes, permissions and SQL/API contracts. Implement URL-controlled task tabs and canonical catalog/title details; preserve old deep links through redirects or contextual links. Move existing operations instead of deleting capabilities. Add regression tests before changing behavior, then run focused and full suites, typecheck, build and coverage. Inspect desktop/mobile screens locally with browser tools, perform plan verification and combined security/correctness/React review, then deploy a protected candidate, recheck the serving baseline and activate only after candidate checks. User has already requested hosting; no extra deployment permission is needed.

## Implementation tracking

- [x] 1. Separate retention controls from Printing Refresh; give active/history/retention clear scopes.
- [x] 2. Single-source setup section URL state, including default and browser navigation.
- [x] 3. Canonical Catalog sidebar destination and clear Accession register label.
- [x] 4. One title catalog; physical-copy operations live in Inventory and title details.
- [x] 5. Contextual title details for overview, copies/location, metadata, files/cover and history using existing capabilities.
- [x] 6. Compact grouped Library setup with daily catalog tools moved to Catalog.
- [x] 7. Books / Research & thesis inventory tabs with preserved filters/exports/stocktake.
- [x] 8. Student clearance / Lost-book reports / Schedules tabs, person lookup first.
- [x] 9. One schedule editor and one clear editing entry point.
- [x] 10. Reports naming, report-family tabs and readable headings.
- [x] 11. Consistent Refresh and scoped Export choices on changed screens.
- [x] 12. Supply Delete under item menus; type management secondary; keep restock/use distinct.
- [x] 13. Add-book optional details collapsed and explicit review of copies/metadata before saving.
- [x] 14. One password-visibility control, responsive sign-out access, compact/contextual scanner controls.
- [x] 15. Reservation/cart counter handoff links and consistent task language.
- [x] 16. Accurate loaded-result counts/pagination and loading/error/empty states in affected screens.
- [ ] Verify feature tests, full suites, typecheck, build, coverage and browser behavior; record any baseline failures precisely.
- [x] Separate plan-verification and combined review; fix findings before deployment.
- [ ] Commit explicit feature paths in isolated branch, deploy, verify candidate and public alias/source preservation.

## Change log

- 2026-11-19: Owner approved implementation and requested live hosting. Prepared isolated exact-production baseline, preserving newer releases and unrelated checkout changes. Apply existing repository builder, verifier and combined-review roles; no live database changes.

## Verification on 2026-11-19

All 16 implementation items are built. Catalog covers reuse the existing bulk-cover workflow; no new individual-cover endpoint was added. Title history links to existing filtered borrowing and archive records.

Final bounded web suite: 676 passed, 6 failed across 150 files / 682 tests. All six also fail in the unchanged notification production baseline: CirculationDashboard (one), CollectionReviewPage (one), UploadPreviews (one), StudentQrRosterPage (one), PasswordRecoveryPage (two). Full bounded API suite: 1,016 passed, 3 failed / 1,019 tests. The same three reproduce on the unchanged baseline: job-runner handler assertion, printing cash and printing payment projection fixtures missing documents_expired_at. Full suites are not green. Root npm test and coverage were attempted; unbounded resource use prevented complete root coverage. Focused web coverage: 103 tests across 19 files passed. Regression tests for the review fixes: 16 passed. Final typecheck and build passed. Native browser automation was unavailable, so desktop/mobile visual acceptance remains unverified.

Plan-verification evidence: items 1/11/16 printing queue, retention and validation tests; 2/6 CatalogSetupFlow and CatalogMaintenanceArchive; 3/14 navigation, PortalLayout, AuthenticationPages and AttendanceFab; 4/5 CatalogManagementFlow, CatalogTitleDetails and CatalogDetailsViews; 7 InventoryDashboard; 8 AdminClearancePage; 9 LibrarySchedulePage and ClearanceScheduleEditor; 10 CatalogReportsPage.flow and OperationalReports; 12 AdminPrintSuppliesPage; 13 AddMultipleCopiesModal and AutoCover; 15 AdminReservationQueuePage. No schema or migration files changed. Tracker independently advanced to applied 072 in another approved repair; next unused 073. This UI release makes no database changes.

Combined security/correctness/React review found two medium defects: stale manual catalog reads could overwrite a newer search, and leaving the legacy digital-file editor could discard the pending file. Both fixed with failing-then-passing regression tests. Final manual review confirms server validation of printing scope, parameterized user filters, scoped counts before pagination, existing role checks, preserved export scope and unsaved-change handling. No unresolved release-specific medium or higher finding. Verdict: implementation checks pass; whole-suite and visual acceptance remain limited as stated above. Status stays inprogress rather than claiming every required check passed.

Wiki handoff, 2026-11-19, targets wiki/hot.md and wiki/entities/StiOrmocLibrary.md: exact-production isolated UI release implements the approved 16-point audit. No database changes. Final live deployment evidence will be appended below. Configured Ethan vault unavailable; no wiki write performed.
