# Guided book-file import

- **Why:** The owner still cannot confidently use the holdings importer. Replace technical setup and repeated review controls with a clear file, book-list and save flow.
- **Date created:** 2026-10-17
- **Date last updated:** 2026-10-17
- **Status:** built

## How

Rename the entry point to **Add books from Excel/CSV**. Offer a blank three-column template (Title, Author, Copies) and show a small example. Recognize existing supported headings automatically. Show category/shelf questions only when needed; preselect a sole active option, never choose among multiple options without the user. If all required information is available, open the book review automatically after file inspection. Keep optional file/worksheet settings collapsed and ask plain questions about missing required columns.

Show ordinary books in a compact list with a clear book-entry count and physical-copy count. Repeated titles are not mislabeled as unique titles. Put corrections and possible duplicates in a separate visible questions section. The final Add button is the explicit confirmation for ordinary books; remove the redundant confirmation checkbox. Preserve explicit overlap/extra-copy decisions, server validation, version checks, missing-copy counts, source identifiers, progress, saved results and safe retry/resume.

Keep content previews available, avoid sample records in the downloadable template and never commit school holdings while testing. Retain existing backend import APIs and schema.

The new `HoldingsFileQuestions` component presents plain questions before review only when setup is incomplete. Unrecognized extra headings pause automatic progression and show a notice so identifiers or other supplied columns are not silently overlooked. Optional mappings, header lines and worksheet program/category/shelf overrides remain in a collapsed File options section. Only active single category/shelf choices can be preselected; multiple choices remain explicit.

Ready books use the existing responsive table and open their editor only on request. Questions appear separately; a single exception opens automatically. The final button states the exact number of physical copies being added. If unanswered questions remain, the screen explicitly explains that only ready books will be saved and the others remain for later. Completion shows books/copies added rather than zero ready-to-add totals. Saved-list history failures do not turn an otherwise successful staging/save into an import failure.

## Implementation tracking

- [x] Plain entry point, example and three-column template.
- [x] Automatic review for recognized files; focused missing-information questions.
- [x] Compact book list, visible exception questions and one final Add action.
- [x] Keep resumable saves and existing validation/overlap safeguards.
- [x] Focused tests, production build and desktop/mobile sample verification.

## Verification and limits

Follow-up: [automatic formatting cleanup and category/shelf recognition](book-import-auto-cleanup-20261017.md) adds safe correction details and explicit suggestions to this guided flow. Its verification supersedes the counts below for the current importer.

- Applied the owner's UI/UX, frontend developer and baseline UI skills: familiar labels, fewer default controls, a reusable question component, semantic steps/statuses, responsive tables, readable neutral surfaces and meaningful success/warning colors.
- **25 tests passed in two files**: 19 import tests and six shared-preview tests. Covered automatic review without catalog writes, explicit multi-option category/shelf selection, no archived defaults, missing copy-count questions, unknown optional heading review, preserved accession/barcode mappings, duplicate decisions, zero-copy choices, validation/stale-version failures, correction and retry, partial saves, history failure and safe continuation. The downloaded template contains headings only, exactly Title/Author/Copies.
- Frontend TypeScript/production build passed. The pre-existing main-bundle size warning remains. No backend or schema was changed.
- Browser checks used the actual import component with disposable CSV data and in-memory API replacements. Verified file selection, automatic recognition, two book entries/five copies, one final Add action, completion and reopening the completed list without offering another Add. No real catalog or import records were written.
- Checked the normal desktop viewport and 390 × 844 phone viewport, including dark mode. Phone page width did not exceed the viewport; table values become readable cards. Browser warning/error logs were empty during the sample check.
- Evidence is under ignored `output/guided-book-import-20261017/`: `start-desktop.png`, `review-desktop.png`, `review-mobile.png`, `review-dark-mobile.png` and `build.txt`. Temporary HTML/TSX fixtures, sample CSV and agent tab were removed, and the viewport was restored.
- Limits: these checks use mocked APIs, not a new live-database acceptance run or a physical phone/scanner. Existing server file/row/sheet/size limits, role permissions and reference validation remain authoritative. The school workbook was not imported, and nothing was pushed or deployed.

## Change log

- 2026-10-17: Owner approved the simpler approach. Implementation started. No migrations planned; applied Postgres 027, unapplied draft 028 and MySQL reference 048 / next 049 remain unchanged.
- 2026-10-17: Owner explicitly requested the UI skills. Completed guided selection/review/add screens, entry-point rename, compact list, exception questions, optional settings, automatic safe defaults, identifier recognition safeguards and independent saved-list error handling. Verified tests/build and light/dark desktop/mobile sample flows; cleaned fixtures.
