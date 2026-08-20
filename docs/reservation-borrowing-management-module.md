# Reservation & Borrowing Management Module

## 1. DDL schema and identifier contract

Apply `database/migrations/20260816_004_reservation_borrowing_management.sql` to upgrade the legacy reservation queue. It is MySQL 5.6 compatible, uses InnoDB and `utf8mb4_unicode_ci`, preserves existing rows, and maps legacy statuses as follows:

- `Waiting` to `pending`
- `Fulfilled` to `claimed`
- `Expired` to `expired`

`material_id` remains the requested legacy catalog/circulation identifier and references `materials.material_id`. `accession_id` is nullable until pickup and references the specific assigned physical `materials` row. When the normalized catalog migration is active, `physical_copies.material_id` is synchronized as the copy-state bridge.

The canonical status lifecycle is:

```text
pending -> approved -> ready_for_pickup -> claimed
   |           |              |
   +-----------+--------------+-> cancelled

ready_for_pickup -- deadline elapsed --> expired
```

Queue indexes cover status/date, user/status, material/status, pickup expiration, and assigned accession/status lookups.

## 2. Backend controllers and API contracts

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/reservations` | Authenticated user | Submit a reservation using the signed-in session user and `materialId` |
| GET | `/api/reservations/admin/queue` | Admin/Librarian | Prepared, paginated queue query with status, date, role, and user filters |
| PATCH | `/api/reservations/:reservationId/status` | Admin/Librarian | Approve, assign a ready copy, confirm claimed, or cancel |

The existing server-side session is the trusted identity source. Request bodies cannot select another user or role. The stored `System Administrator` role is the effective Admin claim; other administrative mutation attempts return `403 RESERVATION_ADMIN_FORBIDDEN`.

Create body:

```json
{ "materialId": 42 }
```

Status body:

```json
{ "status": "ready_for_pickup" }
```

The ready transition locks and assigns the first eligible available accession for the same ISBN/title and establishes a 24-hour deadline unless a valid future deadline is supplied by an authorized integration.

## 3. Borrowing and duplicate validation

Creation locks the user, requested material, and every physical material row sharing the ISBN/title. This serializes duplicate detection and queue-position allocation across concurrent requests.

- Active reservation states are `pending`, `approved`, `ready_for_pickup`, and `claimed`.
- Active borrowed states are `Pending`, `Borrowed`, and `Overdue` in `borrow_transactions`.
- Students requesting a Book are blocked at two distinct active book identifiers with `422 STUDENT_BORROW_LIMIT_REACHED` and `Transaction Blocked: Students cannot exceed 2 books`.
- Faculty bypass the numeric cap.
- All roles are blocked from a concurrent reservation for the same material, ISBN, or normalized title with `422 DUPLICATE_ACTIVE_RESERVATION`.

## 4. Queue query

The Admin query builder accepts optional `status`, `dateFrom`, `dateTo`, `role`, `user`, `page`, and `limit`. Values are prepared-statement parameters. Explicit joins return the user name/ID/email/role, material title/type/category, queue position, assigned accession/barcode, reservation date, deadline, and status.

## 5. Expiration worker

The API process starts a non-overlapping background scan every 60 seconds. Each batch:

1. Locks overdue `ready_for_pickup` rows ordered by deadline.
2. Changes them to `expired` and clears `accession_id`.
3. Changes the assigned `materials` record from Reserved to Available.
4. Synchronizes a matching normalized `physical_copies` record.
5. Commits once; any failure rolls the entire batch back.

The timer is unreferenced so it cannot prevent graceful Node.js shutdown.

## 6. Admin web dashboard

`/admin/reservations` now uses the live API. It provides responsive summary cards, combined filters, contextual user/material/accession data, status badges, and state-specific Approve, Mark Ready, Confirm Claimed, and Cancel actions. Terminal rows show no mutation actions. API errors are rendered through an alert wrapper, including the exact student-limit message.

The interface uses only `#003399`, `#FFF200`, `#FFFFFF`, and opacity variants.

## 7. Verification

```bash
npm test -w @sti-library/api
npm run typecheck
npm run build
```

Tests cover the Student third-book rejection and missing insert, Faculty creation with 12 active books, expiration/accession release, prepared filter composition, HTTP `422`, and queue RBAC `403`.

