# Catalog Add to cart repair

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` |

## Why

The owner cannot press Add to cart in the signed-in Library catalog. Inspection found local selection unnecessarily disabled while the separate borrowing-summary request is loading or fails; card selection also waits on a redundant book-details request. The actual catalog cards already contain sufficient title/author/cover metadata for a local selection. Read-only live Student catalog diagnosis succeeded, so a universal database failure was not reproduced. The existing browser tab is on a browser error page and its inspection was blocked by browser policy; no workaround is used to read it.

## How

Let card selection use the displayed catalog metadata immediately. Show separate borrowing-check status and retry guidance without disabling local selection. Limit the number of locally selected titles using the configured cart limit, independently of existing active commitments. Keep duplicate/digital-only guards, and retain authoritative eligibility, ownership, active borrowing/request limits and idempotence at submission. Do not create a queue entry or loan from Add to cart. Preserve details hydration in the cart and existing records.

## Follow-up account-limit repair

The owner reported the button still did not work. A read-only lookup of the previously identified account 02000351061 confirmed two active title commitments against the configured limit of two. The prior diagnostic had tested a different active Student account with zero commitments, so it missed this account-specific condition. Verified the actual Vite response serves the current code; no stale disabled-state code was found there. The shared card/details validator still added existing commitments to local cart selections and rejected the click before storage.

Changed that validator to count only locally selected titles. The configured cart-size cap remains, and the server's active-commitment limit is unchanged. The catalog explains when a borrower must return a book or cancel an existing request before submitting. Submission limit errors now give the same clear action and retain the prepared cart. No existing requests were canceled and no loans/accounts were changed.

Reproduced both card and details failures at 2/2 in regression tests before fixing. All 19 catalog/cart tests now pass, including retained carts on server rejection and existing retry guards. Typecheck/production build passed. Browser verification with actual components and isolated sample responses at 2/2 showed Add to cart → In cart → populated cart, then an intentional submission rejection with the cart preserved. Screenshot: `output/cart-button-repair-20261016/cart-at-active-limit.jpg`. Removed sample selection, temporary preview files and test tab. The real user's error-page tab remained untouched; its signed-in click was not directly observed. School-ID confirmation/screenshot was requested asynchronously, but the previously identified account supplied a reproducible matching condition.

## Implementation tracking

- [x] Trace disabled conditions and compare catalog metadata with cart requirements.
- [x] Confirm reported location and check the active catalog read without mutating accounts.
- [x] Reproduce loading/failure conditions with regression tests.
- [x] Remove unnecessary local-selection network dependencies.
- [x] Verify retry/limits/duplicates and build; record browser evidence and limits.

## Verification and limits

- Three regressions failed before the repair: borrowing summary never resolves, summary fails, and separate book overview fails. All pass after the change.
- 15 tests across BookCatalog and BookCart pass, covering card/detail selection, unavailable physical titles, known limits, duplicates, Faculty behavior, selection during failed checks and idempotent submission retries. Production build/typecheck passes; existing bundle-size warning remains.
- Browser sample verification used the actual catalog and cart components with all responses isolated in memory and deliberately returned 503 for borrowing summary and book overview. The button remained enabled, changed to In cart, badge became Book cart (1), and cart review displayed the selected title/author/cover. Removed the sample selection and temporary files/tab afterward. Evidence: `output/cart-button-repair-20261016/added-to-cart.jpg`.
- The existing user's tab could not be inspected due to the browser error-page policy block. This does not establish which dependency failed in that user's session. The confirmed code paths that disable/freeze selection are repaired and verified independently; no credentials or session data were read from the blocked tab.
- No database writes, migration, real cart submission, loan, account change, push or deployment. Postgres 026/next 027 and MySQL reference 048/next 049 unchanged. Vite serves the frontend change automatically; refresh an older open catalog.

## Change log

- 2026-10-16: Started focused repair. No migration expected; Postgres 026/next 027 and MySQL reference 048/next 049 unchanged.
- 2026-10-16: Built and verified immediate card selection, separate borrowing-status guidance, regression tests, browser review and production build.
- 2026-10-16: Owner reported continued failure. Identified the earlier account-specific 2/2 commitment condition and removed active commitments from local selection validation. Submission limits preserved; 19 tests, production build and sample browser verification passed. No database writes or migration.
