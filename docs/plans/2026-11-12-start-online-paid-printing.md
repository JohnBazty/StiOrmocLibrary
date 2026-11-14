# Start printing after verified local online payment

**Why:** The queue shows verified online payment, but the printing action still reads the unchanged school's Unpaid payment_status and rejects it.
**Date created:** 2026-11-12
**Date last updated:** 2026-11-12
**Status:** built

## How

Recognize the same owner-scoped confirmed local payment used by the queue when starting a print job. Require full net principal coverage of the current cost and no pending/confirmed refund cancellation. Hold the existing local payment lock before the print-row transaction so refund and Start printing cannot pass each other. Keep cash, operating-hours and state-transition rules. Do not mark the school payment Paid or invent a cash receipt. Only the owner's later Start printing action changes the actual job status through its normal history/notification transaction.

No request 21/22 is started during verification. Tests use disposable fixtures and fake school rows. No provider payment/refund, migration, push or deployment.

## Tracking

- [x] Reproduce paid-view/unpaid-action mismatch with a failing test.
- [x] Recognize exact confirmed credit and serialize printing against refunds.
- [x] Verify wrong owner, underpayment, refund holds and unchanged cash accounting.
- [x] Run tests/typecheck/build/coverage and restart the local app.

## Implementation evidence

The payment view and Start printing command now use confirmed net principal scoped
to the same request/borrower, compared against the current calculated cost. Matching
credit allows the normal job-status transaction without changing the school payment
state or creating a cash payment/receipt. The cancellation path also recognizes a
paid online job and directs personnel to refund review instead of treating it as
unpaid. Local status commands share the existing payment serialization lock with
refund operations; the lock is acquired before the printing row transaction.

New tests first reproduced `PRINT_PAYMENT_REQUIRED` for a verified online-paid job.
They now pass for a fully covered payment and reject a different borrower, short
payment and refunded balance. A refund hold stops the transaction before job writes.
Tests assert no cash payment, receipt or school payment-status update is created.
The PostgreSQL projection test also verifies that a short credit cannot label a
request Paid. Existing cash/printing tests continue to pass.

Full suites passed **555 API + 368 web = 923 tests**; typecheck/build passed. A
read-only check of requests 21 and 22 confirmed both are still Pending, each has
enough confirmed net online credit, and neither has a refund hold. The configured
printing-hours check also passed. No real job was started during testing. The local
launcher was restarted and health returned 200. No browser interaction is needed to
execute the owner's two real jobs as a test; they remain for the owner to start.

No commit, push, hosting, migration, dependency change, provider transaction or
school record write. Evidence is in ignored `output/start-print-*.log`.

Coverage also passed all suites. Overall existing coverage remains below 80%:
API 72.03% lines; web 65.05% lines. This backend repair does not claim a new visual
check or physical printing acceptance. The owner can now retry Start printing.

## Change log

2026-11-12 — Owner reported Start printing failing for two Paid/Pending jobs. Current printing-hours check passed; the server cash-only condition is the confirmed mismatch. Migration tracker remains 036 applied / 042 next unused.
