# Staff book queue visibility repair

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` |

## Why

**Owner clarification confirmed, 2026-10-16:** Only unavailable-book reservations enter Book queue. Available-book carts go directly to Borrow & return for staff handover. The distinction is persisted by additive Postgres 027; existing requests retain their original workflow and history. See [split implementation](cart-handover-reservation-split-20261016.md).

The owner reported that Staff could not see or manage the book queue. Source inspection confirmed the page always opened filtered to Preparing (`approved`). A read-only current-database check found five requests: one Ready, one Waiting and three Collected, but zero Preparing. The default screen therefore hid every active item. Staff role permissions and protected queue routes already exist; no new permissions or loan ledger are needed.

## How

- Open the page with an explicit Active queue filter covering Waiting, Preparing and Ready for pickup. Keep all-history and individual-state filters for review, with matching database count/pagination criteria.
- Name the Staff/Librarian navigation and page Book queue. Show active queue position, borrower, assigned copy/location where available and clear workflow instructions.
- Retain Mark ready for assigned preparing copies, Start checkout for ready pickups and cancellation for active requests. Waiting copies are assigned by the existing ordered allocator when available; staff cannot skip another user's queue priority or create a loan merely by viewing/marking ready.
- Preserve staff permissions, fixed readiness-based 24-hour timer, existing request/loan history and explicit physical handover confirmation. No database writes to real requests during verification.

## Implementation tracking

- [x] Confirm which part fails and trace the empty Preparing-only default.
- [x] Reproduce the missing default scope with failing frontend/API filter regressions.
- [x] Add Active queue selection, queue positions and clear navigation.
- [x] Verify Staff API/UI management, isolated database acceptance, build, browser catalog sample and local restart.

## Change log

- 2026-10-16: Owner clarified that Staff cannot see/manage the queue. Began focused default-filter repair. No schema change: Postgres 026/next 027; MySQL reference 048/next 049 unchanged.
- 2026-10-16: Default Active filter and position display passed 30 frontend and 12 API tests, API typecheck and web build. Owner then clarified reservations-only scope; awaiting the availability distinction before dependent workflow changes. Current phase remains inprogress.

- 2026-10-16: Completed the confirmed split. Staff queue defaults to all active reservations and excludes CartHandover in both data/count queries. API guards, UI actions and isolated handover tests passed; existing records preserved.
