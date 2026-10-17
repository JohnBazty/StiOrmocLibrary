# Remove completed items from the book cart

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` |

## Why

The owner showed Jane Eyre remaining in the cart after checkout. The local cart only cleared when its own submission received a successful response; it never reconciled persisted selections with staff-completed loans or existing queue entries. A read-only check of the previously identified account confirmed Jane Eyre is already represented by an active loan/request.

## How

Add authenticated Student/Faculty `GET /api/v1/borrow/cart-state`, scoped solely to the authenticated account, with private/no-store caching. It returns distinct canonical title IDs from the owner's active Pending/Borrowed/Overdue transactions and Waiting/Preparing/Ready requests. Returned/canceled/expired history does not prevent future selection. No loan/request write or schema change occurs.

On a nonempty cart, check on mount, window focus and every 15 seconds. Remove only matching selections atomically from local storage, update the badge through the existing store event and show where their real records can be found. Keep unrelated selections and leave the entire cart intact if checking fails. Skip reconciliation while a submission is saving and ignore responses after unmount.

## Implementation tracking

- [x] Trace local cleanup and verify matching active title read-only.
- [x] Reproduce stale-item/focus/error regressions before repair.
- [x] Add owner-scoped read endpoint and local reconciliation.
- [x] Verify tests/build/browser and restart the API.

## Verification and limits

- 22 frontend tests passed across cart, catalog and local selection rules. New regressions cover initial reconciliation, a staff-completed loan discovered on focus, keeping unrelated selections and retaining cart data on network failure.
- 14 API tests passed across service and cart HTTP tests. Owner derives from authentication rather than query account ID; personnel roles are denied; the service only reads active title IDs and rejects invalid account IDs.
- API typecheck and web typecheck/production build pass, with the existing bundle-size warning.
- Read-only active-database query confirmed the pictured title belongs to the previously identified account's active commitments. No real loans, requests or account records were changed.
- Browser tested actual BookCart/store against isolated in-memory responses: loading a stale sample Jane Eyre selection produced the removal notice and empty cart automatically. Screenshot `output/cart-button-repair-20261016/completed-item-removed.jpg`; temporary files/tab removed. The real signed-in browser tab was not manipulated.
- API restarted; web API health returns 200 and anonymous cart-state requests return 401. No migration, push or deployment.

## Change log

- 2026-10-16: Owner authorized removal of leftover completed cart items. Implementation preserves database records; Postgres 026/next 027 and MySQL reference 048/next 049 unchanged.
- 2026-10-16: Built and verified owner-scoped reconciliation, 36 focused tests, build and browser sample; restarted API and preserved all transaction history.
