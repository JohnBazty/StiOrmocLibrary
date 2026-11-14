# Payment standing and borrowing refresh

Why: confirmed payments updated fine cards but the book cart still reported the original outstanding balance.
Date created: 2026-11-15
Date last updated: 2026-11-15
Status: inprogress

## How

Use target-scoped, provider-confirmed net principal credits for borrowing eligibility, cart standing and renewal checks in the enabled payment preview. Keep official school receipts and balances unchanged, consistent with the approved development gateway. Cash allocations and adjustments remain part of the underlying balance. Cap each credit at its matching charge; fees, pending/failed attempts, other borrowers and printing payments cannot clear a fine. Confirmed restore refunds reopen the balance; cancelled-charge credits keep it closed. Retain all unrelated borrowing and clearance blockers.

Refresh cart, fines, clearance, dashboard, printing and transaction views after payment changes, including other tabs, without resetting forms or creating a borrowing request. Use a content-free update signal and authoritative API reads. Clear obsolete balance errors only when the current response warrants it; preserve unrelated errors and cart selections when reads fail.

## Implementation tracking

- [x] Shared per-charge outstanding computation and trusted borrower credit lookup.
- [x] Cart and server borrowing/renewal checks use the same balances; history and staff monitor renewal controls use those amounts too.
- [x] Payment update signals refresh related views across tabs; original dashboard/clearance/history five-second and cart fifteen-second fallback intervals are retained.
- [x] Partial/refund/ownership and stale-warning regression checks, including actual Postgres queries in PGlite with cash allocations, reversed receipts, adjustments and another borrower.
- [ ] Tests, typecheck, build and hosted read-only verification.

Automated gate: 712 API tests and 457 web tests passed (1,169 total); typecheck and
build passed. Same patch applies cleanly to the existing local integration checkout.
The initial full web run found a timing regression after replacing five-second
dashboard refresh; the original intervals were restored and all web tests rerun.

No schema changes are planned. Applied migration remains 044; next unused 045. No real payment, refund, borrowing request or transfer is required for verification.

## Change log

- 2026-11-15: owner requested consistent updates for all payment-dependent warnings and controls, including the book cart.
- 2026-11-15: read-only production verification found school-source outstanding 38,000 centavos and confirmed-credit outstanding zero for the known borrower. No data was changed. Fixed cart/eligibility mismatch, corrected Book Price/cash replacement standing, and added content-free cross-tab update signals. API gate: 712 tests passed. Final web/build and hosted verification remain pending.
