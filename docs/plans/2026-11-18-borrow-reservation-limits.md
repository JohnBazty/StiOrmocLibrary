# Borrow and reservation limits (same title, waitlist, claim day)

## Why

Stop a borrower holding more than one active commitment for the same title, keep the waitlist no larger than the library’s active copies of that title, and keep claim pickup at one open library day.

Date created: 2026-11-18  
Date last updated: 2026-11-18  
Status: built

## Approved behavior

- Keep pickup claim deadline at **1 open library day** after Mark ready (existing calendar/closure rules).
- Block borrow and request when the user already has that title on loan or in an active request (`pending` / `approved` / `ready_for_pickup`), including desk walk-in. Claim/handover of the user’s own ready or cart request for that title still succeeds.
- Cap Reservation waitlist size to the title’s total **active** physical copies (`lifecycle_status = 'Active'`). Reject new waitlist joins with `WAITLIST_FULL` when the active Reservation queue already equals that count.

## How

1. Online request path already rejects same-title duplicates with `BOOK_ALREADY_IN_ACCOUNT`; keep that behavior.
2. Desk / `confirmCheckout` and checkout preflight reject same-title walk-ins with the same code; exclude the reservation or pending claim being fulfilled.
3. Desk preview `copyBlockers` surface the same rule before confirm.
4. `book-request.service` `submit` for `Reservation` counts active copies vs active Reservation rows before insert.
5. Claim day: leave `policyDueDate(..., { borrowing_days: 1 })` and existing pickup tests; fix any stale “24 hours” wording only if found.

## Implementation tracking

- [x] Plan approved and branch `feat/borrow-reservation-limits`
- [x] Failing tests: desk same-title block; waitlist full at copy count
- [x] Same-title enforcement in confirm/preflight/desk preview
- [x] Waitlist cap in reservation submit
- [x] Claim day verified (tests green; schema-context updated off stale 24-hour wording)
- [x] Focused API tests pass (41/41)

## Change log

- 2026-11-18: Owner confirmed keep 1 open library day, block same-title including desk walk-in, and waitlist size = active copy count.
- 2026-11-18: Built on `feat/borrow-reservation-limits`. Same-title desk/preflight/confirm; `WAITLIST_FULL` at active copy count; claim remains `borrowing_days: 1` open day.
