# Cross-Portal Circulation and Reservation Synchronization

## Module boundary

SmartLib uses one transactional circulation domain for the Student/Faculty portal and the Admin/Librarian console. Both clients read committed records from the same MySQL database; neither client owns availability, queue position, due dates, or borrowing-limit calculations.

```text
JWT account -> linked operational user
                       |
title -> physical copy -> borrow transaction
  |           |
  +------ reservation queue
              |
      user + admin notifications
```

The normalized `titles` and `physical_copies` tables remain authoritative. Legacy `materials.material_id` links are retained until all historical circulation data has been reconciled.

## API contracts

### Student and Faculty

- `POST /api/v1/reservations/request` - creates a title reservation after role, account, duplicate, and combined-cap validation.
- `GET /api/v1/reservations` - returns the authenticated user's live and historical queue records.
- `PUT /api/v1/reservations/:reservationId/cancel` - cancels an owned waiting reservation and compacts later queue positions atomically.
- `GET /api/v1/borrowing/history` - returns summary capacity and borrowing history for the authenticated account.
- `PUT /api/v1/circulation/requests/:transactionId/cancel` - allows the Student/Faculty owner or an Admin/Librarian to cancel a pending counter-claim transaction and release its usable physical copy atomically.

### Admin and Librarian

- `GET /api/v1/admin/reservations` - returns the shared reservation queue with borrower and copy context.
- `PATCH /api/v1/admin/reservations/:reservationId/status` - performs an allowed administrative queue transition.
- `POST /api/v1/admin/borrowing/confirm-checkout` - accepts `{ "barcode": "...", "school_id": "..." }` from manual entry or a keyboard-emulating scanner.
- `GET /api/v1/admin/borrowing/monitor` - returns active, due, overdue, and returned circulation rows.
- `PUT /api/v1/admin/borrowing/:transactionId/return` - completes a return and assigns the copy to the first waiting user when applicable.
- `POST /api/v1/admin/borrowing/:transactionId/calculate-penalty` - persists the current penalty calculation basis and amount.
- `GET /api/v1/admin/notifications` - returns recent shared operational alerts.

All endpoints require a signed Bearer token. Administrative routes accept only Admin or Librarian roles. Student/Faculty routes operate only on the authenticated account and never trust a user ID supplied by the browser.

## Transaction invariants

- A Student cannot create a reservation or checkout that would exceed two distinct active book titles across loans and reservations.
- Faculty accounts bypass the Student cap.
- Research and thesis records remain view-only and cannot enter circulation.
- Checkout uses `SELECT ... FOR UPDATE` for the account, scanned copy, open loan, and queue head.
- A title with a waitlist can be checked out only by the first eligible user.
- Due dates resolve to 8:59 AM on the next Monday-Saturday operating day, skipping `library_closed_days`.
- Cancellation and expiration compact later queue positions.
- Return assigns the copy to the first waiting reservation or makes it Available when no waitlist exists.
- Copy state, compatibility material state, queue/loan rows, and notifications commit or roll back together.
- Pending counter claims alone may transition to `Cancelled`. A self-service caller must own the transaction; staff may override. Cancellation restores both normalized and compatibility availability unless an active reservation or an unusable/archived condition requires `Reserved` or `Unavailable` instead.

## Frontend synchronization

The user borrowing and reservation pages refresh after each mutation. Cancellation emits a shared browser refresh event, immediately removes the pending row from the initiating Admin lane, and both circulation screens poll every 5 seconds while open. This supplies consistent near-real-time visibility across separate devices without introducing a message broker or duplicated client-side business rules.
