# Available-book cart and unavailable-book reservations

## Why
The owner confirmed that the book queue is only for reserving unavailable books. Available books belong in the cart and then go directly to staff handover.

- Date created: 2026-10-16
- Date last updated: 2026-10-16
- Status: built

## How
Available books use Add to cart, review, and Send to library desk. The server checks availability again under the shared circulation lock, serves existing reservations first, and holds an exact copy. Start checkout loads the stored borrower and copy; staff review and confirm physical handover. No loan exists before that confirmation. If a copy becomes unavailable, the cart remains intact and the user is directed to Reserve book; there is no silent conversion into a reservation.

Unavailable books use Reserve book. The server rejects a new reservation if an eligible copy is available. Waiting reservations retain ordered allocation, staff preparation, and a 24-hour timer beginning only at Mark ready. The queue shows these reservations only. Cancellation releases a held copy and advances waiting reservations.

Additive Postgres migration 027 adds a durable request kind to the existing hold ledger. Existing rows remain Reservation; their past intent cannot be safely inferred. New CartHandover rows require an assigned copy and have no reservation timer or queue position shown. Existing accounts, copies and loan history are preserved. MySQL remains the rollback reference at 048/next 049. Do not replay the migration directory.

## Implementation tracking
- [x] Owner confirmed queue only for unavailable books.
- [x] Separate server creation, list and checkout paths.
- [x] Update catalog, cart, staff and borrower wording/actions.
- [x] Verify isolated migration, races, ownership, handover and cancellation.
- [x] Back up affected hosted rows, apply reviewed 027 individually, restart and check readiness.
- [x] Record verification and limits.

## Change log
- 2026-10-16: Confirmed scope supersedes the earlier all-cart-submissions-enter-queue behavior. Began backward-safe separation.

## Verification
- API: 47 focused tests passed, covering circulation, request identification, authorization, filters and report export safety.
- Web: 57 focused tests passed across catalog, cart, public catalog, staff queue, desk handover, monitor and workspace tasks.
- API typecheck and web production build passed. The existing bundle-size advisory remains.
- Disposable Postgres acceptance passed actual migrations 023–025 and 027, legacy preservation, available/unavailable guards, one-copy race, staff queue separation, owner cancellation, no loan before handover, exact-copy binding, attendance/role guards, all-or-nothing stale carts, retries/concurrent confirmation, cancellation/return/expiry advancement, fixed 24-hour reservation timer and permanent QR reuse. The disposable schema was removed. No emails were sent by the acceptance script.
- Applied 027 individually after an ignored private snapshot. All six existing request rows matched their original-field fingerprint; counts remained 7 accounts, 19 titles, 31 copies and 17 loan rows at verification. The migration adds only a type column, constraints and index.
- Read-only hosted service checks passed queue, desk monitor and six-row request report; CSV streamed successfully (1,699 bytes). No real handover, reservation, cancellation or account edit was performed for QA.
- Browser sample verified available Add to cart, unavailable Reserve book, successful reservation and unchanged cart count. Screenshot: `output/reservation-split-20261016/reservation-confirmed.jpg`. All sample fetches were intercepted. Temporary fixture source/tab removed afterward.
- Local API restarted; `/api/health` reports healthy with no missing schema fields. No push or deployment.

## Limits and retained behavior
Existing requests stay in their earlier workflow, including older cart submissions. Historical intent is not inferred. New available-cart holds have no automatic reservation timer; staff and borrower can cancel them. A real physical handover and hardware scan were not performed. Browser evidence uses sample data; authenticated service behavior was exercised in an isolated database and route tests.

- 2026-10-16: Finished the owner-confirmed split, additive migration, local restart and verification. Next Postgres migration 028; MySQL reference 048/next 049 unchanged.
