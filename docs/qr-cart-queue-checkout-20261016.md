# Permanent QR, book cart and simpler queue checkout

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` |

## Why

The owner authorized four linked repairs: one permanent user QR across services and sign-ins; catalog selection through a cart; Start checkout automatically identifies the selected borrower and assigned copy; online requests are queue entries and create no loan until staff confirm physical handover.

## How

Use the existing permanent credential and remove purpose-QR generation from the active experience. Select attendance purpose at the staff scanner; refreshing or logging in must not regenerate identity. Keep password sign-in security and credential revocation unchanged.

Restore Add to cart from catalog cards and details for physical books, including unavailable titles that can wait in line. Show a persistent cart link, allow review/removal, and submit the selection through the existing idempotent queue service. Selection alone creates no reservation or loan. The server remains authoritative for eligibility, duplicate titles and limits.

Stop new queue submissions and readiness changes from inserting Pending borrow transactions. Keep reservations and assigned-copy holds as queue/preparation records. Existing Pending rows remain compatible history and can be fulfilled without duplicate loans. On handover, create or promote exactly one Borrowed transaction, link the reservation, mark it collected and compact the queue atomically. Retain readiness, 24-hour deadline, attendance, account, condition, availability and loan-limit checks.

Expose a staff-only checkout preview for a selected request. Derive borrower and copy from the stored request, never a client-supplied user ID. Loading the preview writes no loan. Require explicit staff confirmation, bind it to the selected request and exact assigned copy, and revalidate on confirmation. Do not send the borrower's permanent QR secret to staff to simulate a scan. Preserve scanned walk-in borrowing and returns.

Use the systematic-debugging, UI/UX, React UI patterns and Supabase guidance relevant to these changes. The owner's current instructions supersede earlier purpose-QR and Pending-request behavior. Consulted Final Draft pages 19–21, Administrative System Flow page 1, current Phase 4–6 implementation and schema docs. No schema change is expected: Postgres latest 026 / next 027; MySQL reference 048 / next 049.

## Implementation tracking

- [x] Trace current QR, cart, queue and desk behavior and record the approved changes.
- [x] Make the permanent QR the sole active user QR.
- [x] Restore catalog → cart → review → queue submission.
- [x] Separate new queue entries from the loan ledger and preserve old Pending compatibility.
- [x] Add automatic request checkout identification with explicit handover confirmation.
- [x] Verify boundaries, retry/duplicate protection, workflows and responsive presentation.
- [x] Update implementation/schema documentation and record remaining limits.

## Result and staff workflow

1. User selects **Add to cart**, reviews/removes books and submits once. Unavailable physical books may join the queue; digital-only titles cannot enter the physical cart.
2. The request stays Waiting/Preparing until staff marks its assigned copy Ready. Preparation and readiness create no new borrow transaction. Existing copy holds, ordering and 24-hour readiness policy remain in force.
3. **Start checkout** on a Ready request loads the stored borrower, name/ID/photo when approved and exact copy. A request is identified server-side; the browser cannot choose another borrower and receives no QR secret. Old Pending entries remain usable without changing their IDs; a linked older request that is still preparing offers **Prepare request**, rather than an unusable checkout action.
4. Staff match the borrower and physical book and select **Confirm handover**. The API rechecks account, attendance, operating policy, deadlines, queue priority, copy condition and exact assignment before committing one loan and marking the request Collected.

The permanent QR is reused after sign-out/sign-in and across entry/desk services. Staff select the service/visit purpose. Password login remains unchanged. Previously downloaded temporary purpose codes are still recognized for backward compatibility, but active user routes no longer generate them.

The counter still offers scanned walk-in lending and book returns. Missing entrance attendance remains a visible blocker; staff do not silently create attendance during pickup review. Enrollment remains temporarily **Enrollment not verified** under the owner's existing decision.

## Verification and evidence

- 22 focused API tests passed: permanent credential reuse, request-derived identity, exact-copy checks, stale/expired/preparing requests, legacy Pending compatibility and existing circulation/cart guards.
- 45 focused frontend tests passed across six files (44 in the combined run plus one added preparation-routing regression, with the eight monitor/return cases rerun): catalog/cart selection, failed-response retries, duplicate-submit prevention, QR refresh/download, no-scan pickup review, explicit confirmation, blocked attendance, monitor ready requests and returns.
- API typecheck and web typecheck/production build passed. Existing bundle-size warning remains.
- `apps/api/scripts/verify-phase6-requests.ts` passed against a disposable Postgres schema cloned from the current contract. Verified no loan on queue/preview, no QR secret exposure, staff permission, changed-copy rejection, concurrent/replayed handover exactly once, fixed deadlines, competing requests, multi-copy handover, legacy backfill, cancellation/return/expiry advancement, rollback and injected email failure/recovery. Its test clock now explicitly aligns the disposable outbox timestamps. No real emails were sent. Public loan count stayed unchanged and the disposable schema was removed in `finally`.
- Browser verification used actual components with sample-only in-memory responses: catalog → cart → submission, pickup → confirm, single permanent QR/refresh, desktop and 390×844 layouts. No browser errors; mobile cart/pickup document width matched the 390px viewport. Temporary preview files/tab were removed and viewport reset.
- Local screenshots: `output/qr-cart-checkout-20261016/pickup-desktop.jpg`, `pickup-mobile.jpg`, `cart-mobile.jpg`. They show sample data, not real lending.
- The local API was restarted to load these changes. No migrations, actual account edits, school-data imports, push or deployment were performed.
- Read-only current-database monitor query succeeded with the revised queue summary. API health, web API proxy health and homepage each returned HTTP 200.

## Practical limits

- Physical camera/barcode hardware and a real borrower's handover were not exercised. Browser checks use sample responses; transactional behavior is covered separately by the isolated database test.
- The circulation monitor returns up to 100 ready requests per response, alongside its existing paginated loan history. The preparation queue remains available for the full request list.
- MySQL remains the historical rollback reference; the revised queue-only and request-derived desk flow runs on the active Postgres path. Historical Pending rows are retained rather than rewritten or deleted.

## Change log

- 2026-10-16: Owner authorized all four previously discussed fixes. Started implementation with existing records preserved and no push/deployment requested.
- 2026-10-16: Built all four fixes, passed focused and isolated verification, checked desktop/mobile presentation, and restarted the local API. Existing records preserved; no schema change. Postgres 026/next 027 and MySQL reference 048/next 049 unchanged.
- 2026-10-16: Follow-up [cart-button repair](cart-button-repair-20261016.md) removes card selection's dependency on borrowing-summary readiness and separate overview fetches; local selection stays available during failed/slow checks and submission retains authoritative validation.
