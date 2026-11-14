# Book register review and local payment integration

- Why: finish the owner-authorized review of PR #36 while preserving the local payment work.
- Date created: 2026-11-15
- Date last updated: 2026-11-15
- Status: inprogress

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
- [ ] Librarian browser walkthrough: Chrome tab creation failed because the created tab disappeared; no user records changed. Do not merge PR #36 before completing the required walkthrough.
- [ ] Recheck current PR head and merge PR #36 only after its required checks.

## Migration tracking

No SQL changes or applications. Latest live inspected migration: 039_category_record_kind.sql. Applied 037_book_register.sql kept unchanged. Payment review branch reserves unapplied 040–043; next 044 based on inspected reservations. Re-read the ledger before any future migration work.

## Change log

- 2026-11-15: copy-price fix, isolated regression coverage and local integration. Browser acceptance remains open; no GitHub PR merge or new deployment claimed.
