# Book register review and local payment integration

- Why: finish the owner-authorized review of PR #36 while preserving the local payment work.
- Date created: 2026-11-15
- Date last updated: 2026-11-15
- Status: built

## How

Merge PR #36 source into the circulation review checkout. Integrate its incremental changes into the existing local payment checkout with three-way merging and per-file backups. Preserve cookie authentication, CSRF protection, lazy routes, payment pages, current navigation labels and theme. No live migrations or deployment.

Lost-book assessment and clearance now use COALESCE(pc.cost_php, t.purchase_price), so the physical copy price takes precedence. A missing copy price retains the title fallback; an explicit zero remains unknown for charging and requires assessment rather than silently using a different title price. Existing saved charges are not rewritten.

## Implementation tracking

- [x] PR source merged cleanly into circulation review checkout (31145ff).
- [x] Google Books sensitive production setting configured and an actual lookup succeeded; no deployment.
- [x] Copy-price regression tests: 23 passed, using isolated PGlite fixtures and immutable migration 037.
- [x] Review checkout: full tests, typecheck, build and coverage commands passed. Web coverage remains below 80%; no claim of complete coverage.
- [x] Incremental source integrated locally; four overlapping files resolved, payment logic and cookie/CSRF authentication retained. Local typecheck and build passed.
- [x] Local combined full tests: 682 API and 453 web tests passed (1,135 total). Typecheck and build passed. Local services restarted successfully on API 4000 / web 5173.
- [x] Core Librarian browser walkthrough completed: register loaded all 13 columns; Purchase filter returned two copies; cost/descending sorting changed the order. ISBN 9780132350884 populated Clean Code, Robert C. Martin, publisher, year and a cover preview; Computers category suggestion appeared. Keep editing preserved typed values; Discard closed the unsaved form. No book, copy or category was created. Find book details opened. Fixed the missing route in the local payment integration and reran typecheck/build.
- [x] Rechecked exact PR head 203c0c4; clean merge into main completed and verified at b0dc64454d6ccf7253756c54cdbefb839753eb8b on 2026-11-15, 00:20 Asia/Manila. Supabase Preview was skipped; no independent CI pass claimed.

## Migration tracking

No SQL changes or applications. Latest live inspected migration: 039_category_record_kind.sql. Applied 037_book_register.sql kept unchanged. Payment review branch reserves unapplied 040–043; next 044 based on inspected reservations. Re-read the ledger before any future migration work.

## Change log

- 2026-11-15: copy-price fix, isolated regression coverage and local integration. Browser acceptance remains open; no GitHub PR merge or new deployment claimed.

## Verification limits

The browser export download event did not complete through the automation tool. Synthetic Find book details upload was blocked by the extension file-access setting; native browser use then stopped because the URL could not be confirmed. These additional manual checks are not claimed as passed. Isolated automated export, parser, lookup-fill/review and permission tests passed. No physical-phone check was completed, and coverage remains below 80%. These limits do not invalidate the completed core Librarian walkthrough required by the PR summary.

The copy-price compatibility patch remains committed locally on the circulation integration branch (7ce44a4); PR #36 itself does not merge the still-separate lost-book PR #27. Preserve this patch when integrating that feature. The payment branch remains separate. No new deployment, migration application or real library-record mutation was performed.

- 2026-11-15: completed core Librarian walkthrough, recorded additional browser limits, verified PR #36 merged into main.
