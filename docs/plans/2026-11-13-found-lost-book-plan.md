# Returning a previously lost book

Why: recovering the actual copy must not leave it incorrectly marked Lost or silently erase the original payment history.

Date created: 2026-11-13

Date last updated: 2026-11-13

Status: planned

## How

1. Scanning a confirmed-lost copy opens **Recovered book** review, showing its borrower, original loss decision, book-price charge, payments and refunds already recorded.
2. Staff verify the barcode and inspect the physical copy. The Librarian confirms recovery with a reason. Never let a borrower claim or a payment callback alone declare a copy found.
3. In one locked transaction, close any remaining active loan, record actual return/condition, and clear the Lost condition only after inspection. A damaged copy stays unavailable and uses the damage-review workflow. A usable copy goes through existing next-reservation preparation before returning to the shelf.
4. For an unpaid replacement charge, propose canceling only its unpaid replacement balance with an auditable reason. Do not cancel unrelated overdue fines. A partially paid charge separates unpaid cancellation from refundable collected money.
5. For money already collected, show **Refund available** and the amount actually paid minus confirmed/pending refunds. Reuse the existing refund flow, including the owner's rules on fee refunds and Librarian/Admin permissions. A refund request remains Processing until verified by the provider; a request alone does not record money as returned.
6. QRPh or other unsupported direct refunds use the approved linked separate transfer. Cash refunds require a recorded onsite action and receiver evidence rather than pretending the online gateway returned cash.
7. Preserve the original charge, collection, recovery, cancellation and refund events. Refresh copy availability, loan, fine/clearance, student Transactions and Admin balances after each confirmed change. Duplicate clicks/callbacks cannot refund twice or release the copy twice.

## Decisions before implementation

Confirm the recovery policy: whether a usable recovered copy cancels the replacement charge, any allowed recovery time limit, and treatment when a recovered copy is damaged. Existing refund authority and fee rules are reusable; they do not by themselves approve canceling every found-book charge. Until approved, display the proposal for Librarian review instead of automatically changing charges.

## Database and safeguards

Inspect current loss-report constraints and payment/refund ledgers first. Add a new migration only for missing recovery/audit fields and preserve all applied migration bytes. Lock loan/copy/charge/payment rows in the established order. Enforce remaining-refundable amounts on the API, bind each provider transfer/refund to its original collection, and prevent online withdrawals of onsite cash. No second scheduler or local-only success settlement.

## Implementation tracking

- [x] Existing owner refund permissions, fee-share and separate-transfer rules identified
- [ ] Approve recovered-book charge policy above
- [ ] Schema/API/return review and existing money-out integration
- [ ] Tests: unpaid/partial/full payment, damaged copy, waiting reservation, duplicate callbacks, failed refund, clearance and balance refresh
- [ ] Combined security/database review and required checks
- [ ] Exact migration, external transfer and hosting approval

## Change log

- 2026-11-13: Separate plan drafted as requested by the circulation audit. No refunds, charges or real copies changed.
