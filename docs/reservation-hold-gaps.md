# Reservation hold gaps 2 to 6

Branch: `fix/reservation-hold-gaps` · Date: 2026-11-19 · Migration: `042` (written, not applied) · Plan: [plans/2026-11-18-reservation-hold-gaps.md](plans/2026-11-18-reservation-hold-gaps.md)

Stacked on `fix/lost-copy-reservation-release` (gap 1, JohnBazty/StiOrmocLibrary#43). Rebase onto `main` once gap 1 merges.

## Problems

| Gap | What happened |
| --- | --- |
| 2. Damaged or For Repair | A held copy marked Damaged or For Repair kept its hold. The borrower waited on a copy nobody could lend, and the copy stayed Reserved. |
| 3. Cart handovers | Cart handovers had no deadline, so they never expired and held the copy forever. They did not appear in Book queue. |
| 4. Skipped borrowers | When allocation passed over a waiting request (blocked borrower, limit reached), nothing recorded why. Staff could not see it. |
| 5. Librarian adjustments | Staff could not move a hold to another copy or change the order of the waiting list. |
| 6. Pickup clock | The pickup deadline was always ready + 24 hours, even when that fell after closing or on a closed day. |

## Fix

**Damaged or For Repair** (`inventory.service.ts`):
- The held copy becomes Unavailable (unless it is Borrowed). The borrower keeps their queue place and is offered another free copy of the title.
- A Ready hold that moves to a new copy goes back to Preparing with a new pickup clock.
- Marking the copy Good again makes it Available and runs allocation.
- Every condition change takes the shared circulation lock first (same lock order as gap 1).

**Cart handovers** (`book-request.service.ts`):
- A submitted cart gets a deadline at the next closing time on the same open day.
- `expire()` releases expired carts and notifies the student once. Carts made before this change expire once they are 24 hours old.

**Skip reasons**:
- `reservations.last_skip_reason` and `last_skipped_at` record why the latest allocation passed a request over. Only staff see it, on the Book queue row.

**Staff adjustments** (Book queue):
- **Swap copy**: move a hold to another free copy of the title.
- **Move up / Move down**: reorder pending requests only. A reason is required.
- Both are logged in `reservation_audit_events` with the actor, from/to copy or position, and the reason.

**Pickup deadline** (`pickup-deadline.ts`):
- If ready + 24 hours falls outside opening hours, the deadline moves to the next open closing time. It is never earlier than ready + 24 hours.
- It reads `library_operating_schedule` and `library_closed_days`, in Asia/Manila time. It fails clearly if nothing is open within 31 days.

**Book queue**: a filter for cart handovers, with their expiry time.

## Migration `042_reservation_skip_and_audit.sql`

- Adds `reservations.last_skip_reason` (TEXT) and `last_skipped_at` (TIMESTAMPTZ).
- Creates `reservation_audit_events` (FK to reservations, RESTRICT). RLS is on and access is revoked from `PUBLIC`, `anon` and `authenticated`.
- Adds the audit indexes and `ix_reservation_deadline_open`.

## Rollout order

1. Apply `041` (gap 1).
2. Deploy.
3. Apply `042`.

## Verification

- API: 561 of 561 tests pass. Web: 380 of 380 tests pass. Typecheck and build are clean.
- Reviews: security and database reviewers found nothing critical or high. Medium findings and test gaps are fixed.

## Known limits

- API tests use a faked database. The real SQL (including `FOR UPDATE` locks and migration `042`) has not run yet. Applying `042` to a database is the first real check.
- A cart submitted a minute before closing gets only that minute. This was the chosen rule; a minimum hold was not added.
- Move up is not greyed out when the request above already has a copy. The server refuses that move with a clear message.
