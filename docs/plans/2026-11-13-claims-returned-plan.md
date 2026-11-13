# Claims returned

Why: let a borrower report an already-returned book without silently clearing a loan, fine, or missing copy.

Date created: 2026-11-13

Date last updated: 2026-11-13

Status: planned

## Approved rule

The Librarian reviews the claim. Fines continue until library staff confirm the physical return. Filing a claim never marks the book Lost. This rule was approved by the owner in this chat.

## How

1. Borrowing history offers **I already returned this book** for the signed-in borrower's active loan. A short form asks when/where it was returned and an optional explanation. Explain that the loan and fines remain active during review.
2. Save one open claim for that loan. Retries reuse its result. Notify the library and show **Return claim under review** with date and status on the loan.
3. Staff search the return area, shelves and existing scan history. Notes and borrower updates are separate, so internal notes remain private. The Librarian accepts or rejects with a recorded reason.
4. An accepted claim does not fabricate a return. Staff confirm the physical copy using the existing return transaction, which finalizes the fine at the actual confirmation time under the approved rule, releases the copy or prepares it for the next reservation, and resolves linked overdue follow-up.
5. A rejected claim leaves the loan, fine and copy unchanged. Explain the outcome and the next action to the borrower. No automatic Lost escalation or arbitrary review deadline.
6. Every action refreshes borrowing history, the staff worklist and clearance from the saved server state. Prevent duplicate submissions and resolve concurrent claim/return actions under the same loan lock.

## Database and access

Use a new versioned migration for claims and immutable claim events; confirm the next unused migration number at build time. Existing applied 017 allows only Damage and Long Overdue, so do not edit it or store claims as either existing type. Enforce owner-only submission/read, operational staff investigation, Librarian-only decisions, active-account checks, parameterized queries and private API caching. Preserve history after account archive. Use the existing operational runner only if a separately approved reminder schedule is later added.

## Implementation tracking

- [x] Owner approved review/fine/no-automatic-Lost rule
- [ ] Review and approve this workflow before building
- [ ] New migration, service, API and accessible mobile/desktop interface
- [ ] Tests: ownership, duplicate retries, concurrent return, rejected claim, accepted physical return, fines and clearance refresh
- [ ] Combined security/database review; test, typecheck, build and coverage
- [ ] Exact live migration and deployment approval

## Change log

- 2026-11-13: Recorded approved rule and backward-safe design. No claims feature or schema was deployed.
