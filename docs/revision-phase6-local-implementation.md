# Revision Phase 6 — Online requests, preparation and pickup

**Why:** Connect catalog requests, existing cart claims and waitlists to one physical-copy allocation and verified desk checkout.

**Date created:** 2026-10-11  
**Date last updated:** 2026-10-16  
**Status:** `built`

## How

**2026-10-16 amendment:** Catalog selection now uses Add to cart → review → submit. New submissions and readiness changes remain queue records and create no Pending loan. Borrowing starts only at confirmed physical handover; historical Pending rows remain compatible. See [verified work record](qr-cart-queue-checkout-20261016.md), which supersedes earlier immediate-request/Pending-claim behavior.

- Keep reservation IDs and the existing borrow transaction ledger. Map `pending` to Waiting for a copy, `approved` to Preparing, `ready_for_pickup` to Ready for pickup, and `claimed` to Collected.
- Allocate eligible copies in queue order in a transaction. Use the existing library settings lock before borrower/copy/request locks, consistently with Phase 5. Returned/released copies enter preparation, never automatic readiness.
- Mark ready records a fixed 24 elapsed hour deadline in Manila wall time plus an explicit UTC readiness instant. Replays retain the deadline. QR lookup lists the borrower's requests; checkout rechecks copy, readiness, attendance and eligibility.
- Record deduplicated request events/in-app notifications and queue configured email delivery after commit. Retry provider failures separately from the circulation transaction.
- Postgres migration `025_revision_phase6_book_requests.sql` is additive. Existing Pending cart claims are linked to preparation requests without changing their transaction IDs. Historical reservations are retained. MySQL reference numbering remains 048/next 049.
- Continue the approved temporary Active-account enrollment rule: Enrollment not verified. No reset, seed, or account deletion.

## Implementation tracking

- [x] Add and verify additive migration in a disposable schema.
- [x] Unify immediate requests, legacy cart submissions and ordered waitlist allocation.
- [x] Implement idempotent readiness, cancellation, expiry and returned-copy preparation.
- [x] Add request events and recoverable email delivery.
- [x] Update catalog, borrower history, staff preparation and QR lookup views.
- [x] Verify isolation, concurrent allocation, multi-copy pickup, timer/retry and eligibility guards.
- [x] Apply reviewed migration after private snapshot; verify local startup, tests and build.

## Change log

- 2026-10-11: Implementation authorized as the next revision phase. Owner's 24-hour timer begins only when staff marks ready; no closed-day extension. PDF's earlier timer wording is superseded by that decision.

- 2026-10-11: Built locally. Applied 025 after private snapshot; accounts and operational history retained. API/web suites, typecheck, production build, isolated Phase 5/6 acceptance and local endpoint/browser checks passed. Post-application isolated replay and changed-cart retry guard verified. Next Postgres 026; MySQL reference 048/next 049 unchanged.

## Verification and practical limits

- API suite: 332 passing tests; web suite: 149 passing tests across 54 files. Typecheck and production build pass. The build retains an existing bundle-size warning.
- Disposable Postgres acceptance exercises migration backfill, concurrent one-copy allocation, multiple-copy independent pickup, same-receipt concurrent checkout, no-attendance/wrong-copy/changed-account guards, owner-only cancellation, queue advancement on returns and exact expiry, email failure/recovery, and fixed Manila deadlines. Phase 5 desk regression also passes.
- Private snapshot comparison confirms accounts/users/copies/materials unchanged and existing loan IDs/data and request history retained after migration. New tables have RLS and no anon/authenticated SELECT grants. The hosted advisor connector was unavailable to this session; direct SQL verifies the new table protections.
- Local API health is healthy. Existing Librarian, Staff and Student accounts can retrieve the revised endpoints; Faculty paths are covered in isolated acceptance because no active Faculty account exists locally.
- Browser verifies public covers/copy counts and borrowing opens the sign-in popup with the selected title retained. Authenticated UI interactions are covered by web tests; physical scanner hardware and receipt of a new Phase 6 message in a real inbox have not been independently observed. Configured email uses the existing sender infrastructure.
- Email is sent after commit and retries at most five times. A crash after provider acceptance can cause a repeated email; request, copy hold and loan writes remain idempotent. An unconfigured sender leaves an in-app update and Disabled email record.
- No GitHub push or deployment in this implementation. Revision Phase 2 remains pending under the approved temporary enrollment rule.

## Owner amendment — 2026-10-16

The owner confirmed that only unavailable books enter the reservation queue. Available books use the cart and go directly to staff handover in Borrow & return. Additive Postgres 027 persists the distinction while preserving existing requests. No new loan exists before physical handover. See [updated workflow and acceptance evidence](cart-handover-reservation-split-20261016.md); earlier descriptions of all cart submissions entering the queue are superseded for new submissions.
