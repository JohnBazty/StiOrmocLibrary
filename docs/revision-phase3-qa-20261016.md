# Revision Phase 3 quality assurance — 2026-10-16

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` (QA run complete; four open findings; not release acceptance) |

## Why

The owner scheduled one Phase 3 QA run for 1:27 AM Asia/Manila, correcting the earlier Phase 1 schedule. Phase 2 is excluded. Check the current catalog, holdings imports, Maintenance and related reports against the approved Phase 3 scope.

## How

Read repository/source/schema instructions; run focused catalog tests; inspect the existing live verification tool before executing it; use disposable tagged identities/catalog/import/storage records for mutations. Inspect the local public and signed-in browser flows, public data and role boundaries, cover/availability display, filters, details, import review and exports. Preserve existing accounts/holdings/history and unrelated working changes, record reproducible defects and acceptance limits, and remove test fixtures.

No migration, push or deployment. Applied Postgres product migration 026 / next 027; MySQL rollback reference 048 / next 049.

## Implementation tracking

- [x] Read current Phase 3 requirements, implementation notes and fixture scripts.
- [x] Run focused API/web checks and type checks.
- [x] Verify real database import/digital workflows and permissions with disposable records.
- [x] Exercise public and signed-in browser catalog/Maintenance/report flows.
- [x] Record findings, cleanup evidence and limitations.
- [x] Disable the one-time schedule after this run.

## Findings and results

### Open product findings

1. **P3-01 — catalog-details keyboard behavior (medium).** Public book details sets `aria-modal=true` but focus stays on the underlying card. Pressing Tab moves to another underlying card control (`Harry Potter`), outside the open dialog; Escape leaves the dialog open. Reproduced through the actual browser at `/?q=Harry`. Expected: focus enters the dialog, stays inside while open, Escape dismisses it, and closing restores focus. Source: `apps/web/src/features/catalog/PublicCatalogPage.tsx` dialog; no focus management/Escape handler. Screenshot: `output/phase3-qa-dialog-keyboard.png` (focus escape is supported by the browser DOM observation, not inferable from a static picture alone).
2. **P3-02 — malformed pagination value (low).** At `/?page=abc#catalog`, the backend normalizes page to 1 and returns catalog data, but the frontend displays `Page NaN` and enables both pagination buttons after loading. The frontend converts the raw parameter with `Number()` and calculates navigation from NaN. Expected: normalize/validate once, show page 1 (or a clear validation message), disable Previous at the first page, and keep working numeric navigation. Screenshot: `output/phase3-qa-pagination-invalid.png`. Source: `PublicCatalogPage.tsx` page parsing and Previous/Next controls.
3. **P3-03 — corrupt digital PDF accepted (medium).** With a disposable title, Librarian actor and explicit distribution permission, upload a `.pdf` containing `%PDF-1.7` followed only by inert text, without document objects, a cross-reference table or trailer. `POST /api/v1/admin/maintenance/titles/:id/files` returned **200**, instead of rejecting a non-document upload. `uploadDigital` checks size, extension and the first five bytes but does not parse the PDF. This permits broken files to be listed as digital books; the test does not establish malware execution. Expected: validate PDF document structure before storing/publishing, return an actionable 422 for corruption and leave no active file entry. Evidence: `output/phase3-qa-digital-validation.json` and `output/phase3-qa-live.log`. The external Storage object was removed and its database entry rolled back with the other fixtures.
4. **P3-04 — stale import validation alert after successful review (low).** Attempt to confirm the fixture's bad year/copy row as New; a correct red validation alert appears. Change that row to Skip and confirm it, then successfully confirm the valid row and overlap reuse. The invalid row is now Skipped and the summary correctly shows two Ready rows/two additional copies, but the previous error still remains at the top. Reloading/resuming removes it. Expected: clear the prior alert on a new review attempt or after success. `RowReview.save` calls the parent's error setter only on failure and never clears it on success. Evidence: browser DOM observations and `output/phase3-qa-ready-review.png` / `output/phase3-qa-import-validation.png`. This does not corrupt the saved review decisions.

These are confirmed QA findings; no product repair has been applied in this scheduled testing run.

### Automated and live checks completed

- **84 API catalog/category tests passed**; **46 web catalog/category tests passed across 21 files**. Both API/web TypeScript checks passed. Logs: `output/phase3-qa-api.log`, `output/phase3-qa-web.log`, `output/phase3-qa-api-typecheck.log`, `output/phase3-qa-web-typecheck.log`.
- **Rollback-only Postgres and actual Storage gate passed.** Workbook mapping, invalid-row rejection, explicit overlap reuse, stale review/detail versions, resumable/idempotent commit, two physical copies with one Lost/Unavailable, explicit copyright/publication years, program/course filters, private public DTO, all five role boundaries, PDF distribution-permission gate, public download, archive withdrawal and RLS/browser-role grants checked. The real five-sheet reference workbook was parsed read-only; no real holdings imported.
- The old Phase 3 verifier predates Phase 7's collection-review refresh. Its initial deletion-based cleanup encountered `collection_age_status` references after test import. The new QA wrapper runs the real service transactions as savepoints inside an outer transaction that is always rolled back, so catalog changes and derived collection caches never commit. External test Storage files are still explicitly removed. All **15 selected source/cache tables' full-row fingerprints** matched afterward, including accounts/users, titles/copies/materials/loans, details/foundations/imports, collection age and alerts. Test identity roles are uncommitted disposable accounts. Log: `output/phase3-qa-live.log`; wrapper: `apps/api/scripts/verify-phase3-qa-isolated.js`. Savepoint testing does not certify separate-process concurrency or durability after a real process crash.
- **Seven read/API acceptance groups passed on the running local API**: public DTO/covers/count bounds, title/ISBN/kind/category filtering, empty search/server page normalization, anonymous denial, and Librarian/Staff/Student/Faculty Maintenance/import/report/export boundaries. Student/Faculty viewer role and own-profile scope remained unchanged when another account ID was supplied in the query. Librarian-filtered CSV contained Harry Potter and exported PDF parsed with at least one page; other roles received 403. Logs: `output/phase3-qa-read-boundaries.log`, `output/phase3-qa-api-results.json`. The filtered PDF's first page was rendered with Poppler and visually inspected: title, filters and the two copy rows/columns were present without clipping (`output/phase3-qa-holdings-preview.png`). This sample does not certify every report, long-text wrapping or every paper/printer size.

### Browser checks

- Public catalog loaded 19 entries. Hero search reduced results to Harry Potter; collection/category controls changed the query and returned research results. Book cards showed actual loaded cover images, explicit available/total copy counts and fallback text for missing covers.
- Public book details showed copyright as Not recorded rather than inventing a year, individual Borrowed/Good and Unavailable/Damaged copies and shelf location. Public details contained no edit controls.
- Normal form login with a disposable Student and `catalogTitleId=21` continued to `/student/library?titleId=21&request=1`, opened Harry Potter and showed the same 0 of 2 copy count as public browsing. APA reference generation displayed the book's recorded author/year/title/publisher. Student direct `/librarian/maintenance` redirected to `/student/dashboard`. No borrowing request was submitted against a real book.
- Librarian Maintenance exposed labeled Books & research, Catalog information, Holdings import, Categories, Locations, Resource types, Programs and Courses. The disposable resource type was added and archived through the editor; a duplicate name was rejected with an actionable alert. Existing resource types were not edited.
- Browser workbook upload/read detected both fixture sheets and separate copyright/publication mappings. Default category/shelf were selected before staging; three review rows were created, overlaps explicitly flagged, and a bad year/non-numeric copy count rejected. The bad row was skipped, the first valid row marked Ready with generated accessions, and the second occurrence marked Ready as Reuse. The total remained two additional physical copies, not four. Reload/resume retained both Ready decisions and the Skipped row. Save was disabled without confirmation and enabled when checked; it was then unchecked and no browser commit performed. Actual import writes were exercised separately inside the rollback-only gate.
- Reports was separate from Maintenance; the browser holdings filter/search preview showed two matching copy records for Harry Potter. The actual CSV and PDF buttons completed downloads to `Downloads/sti-holdings.csv` and `Downloads/sti-holdings.pdf`. No source holdings were edited or imported. Screenshot: `output/phase3-qa-reports.png`.
- At a measured browser viewport of **390 × 844**, the import view's document width was 382 pixels (no page-level horizontal overflow). Screenshot: `output/phase3-qa-import-mobile.png`. The initial desktop viewport was 1280 pixels wide; Student catalog document width was 1271. This is browser emulation, not physical-phone acceptance.
- Temporary Staff login succeeded and direct `/librarian/maintenance` access returned to `/staff/dashboard`. Temporary Faculty login succeeded; `/faculty/library` displayed catalog cards with Request book / Join waitlist controls, while direct Librarian Maintenance returned to `/faculty/dashboard`. No request button was submitted. At 390 pixels, Faculty catalog document width was 390; public dark-theme document width was 382 at the same 390 × 844 viewport. Screenshots: `output/phase3-qa-faculty-mobile.png`, `output/phase3-qa-public-mobile-dark.png`. Original light theme was restored, viewport override reset and the QA tab closed; the owner's other tabs were left alone.

## Cleanup and preservation

- Rollback-only workflow completed with matching full-row fingerprints for 15 selected protected source/cache tables. Real title/copy/material/loan/account/user rows were not modified; collection-review cache changes generated by the trial were rolled back. ID sequences may advance normally during rolled-back inserts; the fingerprints cover records, not sequence counters.
- Browser-only cleanup removed all four temporary linked accounts/users, their sessions/profile/clearance rows, the disposable resource type and staged import batch/rows. Matching original full-row fingerprints for accounts, users, titles, copies and loans were confirmed after cleanup. `output/phase3-qa-cleanup.log` records successful cleanup.
- Final independent count check found **0** matching accounts, users, import batches and resource types for this browser run (`output/phase3-qa-final-counts.log`). The ignored temporary credential JSON and generated workbook file were removed. Report/screenshot/log evidence remains; real reference documents were read-only.
- Actual digital Storage fixtures, including the inert malformed PDF, were explicitly removed before the database rollback. No schema migration, RLS/grant change, real password reset, push or deployment. The existing local servers remain running.
- The one-time automation `continue-phase-1-qa-at-1-27-am` (display name **Phase 3 QA at 1:27 AM**) was updated to **PAUSED** after completing the run.

## Acceptance decision and limits

**Result: four confirmed product findings remain open (two medium, two low).** The scheduled QA run is complete; this is not a release sign-off. Product code was not repaired by this testing request. The older verifier's cleanup problem was corrected as QA tooling and is not counted as a fifth product finding.

The 130 focused automated tests, positive live workflow gate, running-server read/permission checks and sampled browser flows passed. The deliberately corrupt PDF probe is a negative validation finding even though the surrounding positive gate completed successfully; its 200 response must not be interpreted as acceptance.

Remaining limits: no actual school workbook import; no browser Save reviewed holdings against committed catalog data; service transactions/row replay were exercised under savepoints, not independent-process crash or concurrency testing. No real borrowing request on existing books, physical camera/scanner test, physical-phone/browser matrix, broad printing/report layout matrix or deployment test. Managed locations/programs/courses were exercised through the API/service gate; the browser create/archive/duplicate workflow sampled Resource types. Digital upload/download/archive was verified through the actual API and Storage, not a full browser digital-file workflow. Phase 2 enrollment and later circulation/collection policies are outside this Phase 3 QA acceptance.

## Reproduction tools

- `node apps/api/scripts/verify-phase3-qa-isolated.js` — rollback-only Postgres/Storage import and metadata trial, including corrupt-PDF probe. The underlying older verifier now requires this wrapper to prevent deletion-based cleanup from leaving Phase 7 references.
- `node apps/api/scripts/phase3-browser-fixtures.js` — temporary browser accounts and workbook; credentials remain only in ignored output. Always finish with the same script's `--cleanup` mode after closing test browser sessions.
- `node apps/api/scripts/verify-phase3-read-boundaries.js` — running local API read/permissions/export checks using the active browser fixture file. Must run before fixture cleanup. Its safe result file covers that scope only; UI and corrupt-PDF findings are recorded separately above.
- New script syntax and changed-file whitespace checks passed. No dependencies were installed.

## Change log

- 2026-10-16: Scheduled run started at 1:27 AM (trigger at 1:27:16). Confirmed local web/API listeners and reviewed the Phase 3 fixture's cleanup and reliance on existing role identities before running mutations.
- 2026-10-16: Passed 130 focused tests, API/web typechecks, rollback-only Postgres/Storage workflow checks and running-server read/export boundaries. Added isolated disposable actors to the verifier and updated cleanup handling for Phase 7 cache references. Confirmed P3-01 keyboard-modal and P3-02 malformed-pagination defects; browser Maintenance/import checks and final fixture cleanup remain in progress.
- 2026-10-16: Completed browser foundation/archive/duplicate, staged import validation/reuse/resume/confirmation, Student/Faculty catalog, Staff/Faculty URL-boundary and Reports download checks; rendered the sample PDF and inspected desktop/narrow/dark evidence. Confirmed P3-03 corrupt-PDF acceptance and P3-04 stale validation alert. Removed all trial database/Storage/browser fixture records and local credentials/workbook, verified preservation/zero remaining rows, restored browser settings, paused the one-time schedule and marked this QA run complete with four open findings.
