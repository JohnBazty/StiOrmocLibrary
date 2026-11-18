# Reservation hold gaps (2 to 6)

- **Date created:** 2026-11-18
- **Date last updated:** 2026-11-18
- **Status:** inprogress
- **Branch:** `fix/reservation-hold-gaps`, cut from `fix/lost-copy-reservation-release` (gap 1). It reuses `releaseLostCopyHolds`, which is not on `main` yet. Rebase onto `main` once gap 1 merges.
- **Migration:** `042_reservation_skip_and_audit.sql` (next free number; `041` is on the gap 1 branch and not applied).
- **Spec method:** GSD spec-phase interview, 3 rounds plus the edge and prohibition probes. Final ambiguity 0.13 (gate 0.20 or lower).

## Why

Gap 1 (a held copy reported Lost stranded the borrower) is being fixed on `fix/lost-copy-reservation-release`. This review found five more gaps in holds:

2. A held copy marked Damaged or For Repair stays Reserved and assigned. Mark ready then fails with `DESK_COPY_BLOCKED` (`book-request.service.ts` around line 270). The only way out is to cancel, so the borrower loses their place.
3. A cart handover (`request_kind='CartHandover'`) holds its copy as Reserved with no deadline. `expire()` only scans `ready_for_pickup`, and Book queue only lists `Reservation`.
4. When `allocateWaitingRequests` passes over someone who is blocked or over their limit, it just `continue`s. Nothing records why.
5. Staff cannot swap the copy on a hold or reorder the queue. Extending deadlines stays blocked, as Ethan approved.
6. Mark ready sets `now + 24h` flat, so a book made ready on Saturday afternoon can expire on Sunday while the library is closed.

## Requirements (locked)

1. **R1 Damaged or For Repair held copy keeps the borrower's place.**
   - Current: an inventory condition change to Damaged or For Repair leaves the hold assigned. Mark ready fails.
   - Target: the condition change takes the global `lock()` (the `library_profile_settings` row), the same as Lost does today. A copy that becomes Damaged or For Repair is set `availability_status='Unavailable'`, with materials synced. When it goes back to a usable condition it is set `Available`, and `allocateWaitingRequests` runs. In the same transaction, every active hold on that copy is released the way a lost copy is. Reservations go back to `pending` with the same `queue_position`. Cart handovers are cancelled. Then `allocateWaitingRequests` runs for the title, so the borrower gets another available copy right away if there is one. If not, they wait at their position. A hold that was `ready_for_pickup` goes back to preparing, and Mark ready on the new copy starts a fresh deadline (R7). The borrower gets the existing "set aside on a new copy" or "held copy" notice, and librarians get a notice like the lost-copy one.
   - Depends on gap 1's `041` (one request event per status and copy), so Mark ready on the new copy records a second `ready_for_pickup` event and notice.
   - Acceptance: a test re-readies a hold on a new copy and finds two `ready_for_pickup` events. An API test marks an assigned copy Damaged while a second copy is Available. The same request ends up `approved` on the second copy with an unchanged `queue_position`, the first copy is `Unavailable`, and both notices exist. Setting the first copy back to Good makes it `Available`. With no second copy, the request is `pending` at the same position.
2. **R2 Cart handovers expire at closing.**
   - Current: no deadline, never expires.
   - Target: on submit, a cart handover gets `pickup_deadline = nextCloseAfter(now)`, the first open-day `closes_at` strictly after `now`. That is today's closing on an open day before closing. At or after closing, or on a closed day, it is the next open day's closing. `expire()` also expires cart handovers whose deadline has passed: the copy goes back to Available and the student gets exactly one notice. That notice is the `expired` request event, with cart wording ("Your cart handover expired at closing. Add the books again if you still want them."), not a second insert. The counter-claim reason also gets cart wording. The cart lives client-side (`book-cart-store.ts`), and expiry touches no client cart state.
   - Acceptance: a service test submits at 10:00 on an open day, and the deadline is that day's `closes_at`. Submitting at 18:00, or on a `library_closed_days` date, gives the next open day's `closes_at`. Running `expire` after the deadline makes the request `expired`, the copy `Available`, and exactly one notification.
3. **R3 Book queue lists cart handovers.**
   - Current: the page filters to `Reservation`.
   - Target: a kind filter (Reservation or Cart handover). Cart rows show "Auto-cancels <Manila date time>".
   - Acceptance: a Vitest test renders a cart row with its auto-cancel time, and the filter switches lists. An empty list shows the existing empty state.
4. **R4 Skip reason is visible to staff.**
   - Current: skips are silent.
   - Target: when allocation passes over a request (blocker, over limit, or not borrowable under policy), it stores `last_skip_reason` (short text: the blocker message, "Over borrowing limit" or "Book not borrowable under policy") and `last_skipped_at`. Only the latest skip is kept, and it is cleared when the request gets a copy or ends. Book queue shows "Skipped: <reason>, <date>" on that row.
   - Acceptance: an API test with a blocked first borrower and an eligible second. The copy goes to the second, the first keeps position 1, and the first has a reason and time set. Once the first is unblocked and allocated, both fields are NULL.
5. **R5 Staff can swap the copy on a hold.**
   - Current: no action.
   - Target: `POST /reservations/:id/swap-copy {physicalCopyId}` for `approved` or `ready_for_pickup` reservations. The target must be an Available, Active, usable copy of the same title that no one else holds. The old copy is released, the new one becomes Reserved, and `pickup_deadline` is unchanged. The action is written to `reservation_audit_events`, and the UI has a Swap copy action listing the eligible copies.
   - Acceptance: API tests cover a swap that succeeds, a target from a different title (422), a target held by someone else (409), a pending reservation (422), and a caller without permission (403).
6. **R6 Staff can reorder pending requests.**
   - Current: no action.
   - Target: `POST /reservations/:id/move {direction:'up'|'down', reason}`. Only `pending` reservations can move, and never above a request that already has a copy assigned. The reason is trimmed and must be 5 to 500 characters. Queue positions are renumbered without gaps in one transaction, under the global `lock()` and then `FOR UPDATE` on the title's active Reservation rows. No unique index on `queue_position` exists. The move is written to `reservation_audit_events` with the reason. The UI has Move up and Move down with a reason prompt.
   - Acceptance: API tests cover up, down, the top request moving up (422 `QUEUE_MOVE_NOOP`), moving above an assigned request (422), a short reason (422), positions staying unique and 1..n, and a caller without permission (403).
7. **R7 The pickup deadline respects opening hours.**
   - Current: `ready + 24h` flat.
   - Target: a pure helper `pickupDeadline(readyAt, schedule, closedDates)`. Start from `t = readyAt + 24h`. If `t` falls inside open hours on an open day, keep it. Otherwise (before opening, after closing, or on a closed weekday or `library_closed_days` date) use `nextClose(t)`, the first `closes_at` at or after `t` on an open day. Hours come from `library_operating_schedule` and closed days from `library_closed_days`. All times are in Asia/Manila. Staff still cannot set the deadline (`PICKUP_DEADLINE_FIXED` stays).
   - Acceptance: unit tests with ready at Mon 10:00 (deadline Tue 10:00), Mon 07:30 (Tue 07:30 becomes Tue closing), Fri 16:00 with Saturday open until 17:00 (Sat 16:00), Fri 16:00 with Saturday closing at 12:00 (the next open day's closing), Sat 15:00 with Sunday closed (Mon closing), a closed-day date, an exact Tue 17:00 boundary (kept), and a week where every day is closed (throws; no infinite loop, horizon 31 days).

## Boundaries

**In scope:** R1 to R7, migration `042`, Book queue UI changes, notices, audit entries, tests.

**Out of scope:**
- Gap 1 (Lost): it's on its own branch.
- Staff extending or editing deadlines: the fixed 24 hours is approved policy.
- Notifying the skipped borrower: Ethan chose staff-only visibility.
- Skip history beyond the latest: the latest skip is enough to explain a long wait.
- Moving preparing or ready holds in the queue: that would take an assigned copy from someone.
- Mobile app changes.

## Constraints

- Postgres only, parameterized `pg`, every multi-row change in one transaction. Lock order follows the existing code: the title or `lock()` first, then reservations, then copies.
- Reuse `releaseLostCopyHolds` (generalize it to take a reason), `allocateWaitingRequests`, `releaseBookRequest`, `notifyLibrarians`, `library_operating_schedule` and the `library_closed_days` reader. No new dependency.
- Opening hours are read from the table, never hard-coded at 17:00.
- One migration, `042`, rerunnable (`IF NOT EXISTS`). It adds `reservations.last_skip_reason TEXT NULL` and `last_skipped_at TIMESTAMPTZ NULL`. It also adds the new table `reservation_audit_events`: id, reservation_id FK, action (`swap_copy` or `move`), from_copy_id, to_copy_id, from_position, to_position, reason, actor_user_id, created_at. No audit store exists for reservations: `inventory_audit_events` is copy-scoped with a fixed enum. Update the migration tracker.

## Acceptance criteria

- [ ] R1: Damaged or For Repair on a held copy re-assigns another copy, or returns the request to pending at the same position (API test)
- [ ] R1: a ready hold swapped by R1 goes back to preparing, and Mark ready gives a fresh R7 deadline
- [ ] R2: a cart deadline equals the next closing time (3 cases), and expiry releases the copy with one notification
- [ ] R2: a cart submitted exactly at closing expires at the next open day's closing
- [ ] R1: a Damaged copy becomes `Unavailable`, and back to Good makes it `Available` and allocates
- [ ] R3: Book queue shows cart rows with the auto-cancel time under the kind filter
- [ ] R4: the skip reason is set on skip and cleared on assign or end
- [ ] R5: swap-copy succeeds and covers its 4 error cases
- [ ] R6: move up and down keep positions 1..n unique and cover the noop, assigned-above, reason and RBAC errors
- [ ] R7: the helper passes the 8 calendar cases above and is used by Mark ready and cart submit
- [ ] NOT: a student request never returns another borrower's `last_skip_reason` (API test as student)
- [ ] NOT: the R7 deadline is never earlier than `readyAt + 24h` (property test over random ready times)
- [ ] NOT: R1, R2 and R5 never assign or release a copy that another active hold owns (concurrency test with two holds on the same title)
- [ ] `npm test`, `npm run typecheck` and `npm run build` pass

## Edge coverage

**Coverage:** 19 of 19 applicable edges resolved, 0 unresolved.

| Category | Req | Status | Resolution |
|---|---|---|---|
| concurrency | R1 | covered | Copies are taken only from the `allocateWaitingRequests` set (not held by anyone), under `FOR UPDATE` (NOT criterion) |
| adjacency | R2 | covered | Submit before opening on an open day gives that day's closing. Exactly at closing gives the next open day (`nextCloseAfter` is strict, while the R7 pickup rule keeps an exact closing time). |
| empty | R2 | covered | No open day within 31 days: the cart is rejected with `LIBRARY_CLOSED_NO_SCHEDULE` |
| ordering | R2 | covered | Expiry runs in deadline order, the same as holds |
| concurrency | R2 | covered | `expire` row-locks, and handover confirm checks status under lock, so a confirm racing expiry is safe |
| adjacency/empty/ordering/concurrency | R3 | covered | Empty state is reused. Rows are sorted by deadline. The page is read-only, so there's no race. |
| boundary | R4 | covered | Only the latest skip is kept, and it's cleared on assign or end |
| precision | R4 | covered | `TIMESTAMPTZ`, shown in Manila time |
| concurrency | R4 | covered | Written inside the allocation transaction |
| unclassified | R5 | covered | Target copy locked `FOR UPDATE`, with the not-held-elsewhere check (409) |
| empty | R6 | covered | A single-item queue or the top request moving up gives `QUEUE_MOVE_NOOP` |
| encoding | R6 | covered | Reason trimmed, 5 to 500 characters, stored as text, rendered escaped |
| concurrency | R6 | covered | Global `lock()`, then `FOR UPDATE` on the title's active Reservation rows, then renumbering in one transaction |
| adjacency | R7 | covered | Exactly at closing is kept. Before opening goes to the same day's closing (Ethan, round 4). |
| empty | R7 | covered | All days closed: the call throws and Mark ready returns 422 |
| ordering | R7 | covered | The result is never below `readyAt + 24h` (NOT criterion) |

## Prohibitions (must-NOT)

| Prohibition | Req | Status | Verification |
|---|---|---|---|
| MUST NOT show a borrower's skip reason to anyone without queue-management permission (it can reveal fines or blocks) | R4 | resolved | test |
| MUST NOT let staff extend or set a pickup deadline (fixed-24h policy) | R5, R7 | resolved | test (`PICKUP_DEADLINE_FIXED` stays) |
| MUST NOT give a borrower less than 24 hours to collect | R7 | resolved | test (property) |
| MUST NOT take a copy from another borrower's active hold | R1, R5 | resolved | test |

## Interview log

| Round | Perspective | Question | Decision |
|---|---|---|---|
| 1 | Researcher | Where should the spec live? | `docs/plans` doc, no `.planning/` |
| 1 | Researcher | Damaged held copy | Auto-swap and keep the place, or wait at the same position |
| 1 | Researcher | Cart wait | Until closing on the same open day, otherwise the next open day |
| 1 | Researcher | Pickup clock | Push to the next closing time when outside open hours |
| 2 | Simplifier | Gap 4 size | Reason on the queue row, staff-only, no notice |
| 2 | Boundary | Gap 5 scope | Swap copy plus reorder queue |
| 2 | Boundary | Carts in Book queue | Yes, with auto-cancel time |
| 3 | Failure | Ready hold swapped | Back to preparing, fresh clock |
| 3 | Failure | Reorder limits | Pending only, reason required, never above assigned |
| 3 | Failure | Cart expiry notice | Release plus in-app notice |
| 4 | Edge probe | Ready + 24h before opening | Move to that day's closing |
| 4 | Prohibition | Skip reason visibility | Staff only |

## How

Tests first for each step (`node --test` next to the code, supertest for routes; Vitest for the web).

### 1. Opening-hours helper (R7)
New `apps/api/src/modules/reservations/pickup-deadline.ts`: pure `isOpenAt`, `nextClose` (at or after), `nextCloseAfter` (strictly after) and `pickupDeadline(readyAt, schedule, closedDates)`, plus a loader that reads `library_operating_schedule` and `library_closed_days` for a 31-day horizon. Reuse the `closedDateSet` pattern from `circulation.service.ts`, or export it. Unit tests cover the 8 cases plus the property test. In `book-request.service.ts`, Mark ready replaces `now+24h` with the helper.

### 2. Cart deadline and expiry (R2)
`submit(...,'CartHandover')` sets `pickup_deadline = nextCloseAfter(now)`. `expire()` selects `ready_for_pickup` reservations plus cart handovers in `approved` whose deadline has passed, then calls `releaseBookRequest(…,'expired')`. Give `recordRequestEvent('expired')` and `cancelPendingCounterClaim` cart wording when `request_kind='CartHandover'`, so exactly one notice goes out. Check the student-facing `result()` labels for an expired cart.

### 3. Damaged or For Repair release (R1)
Generalize `releaseLostCopyHolds(q, copyId, actor, now, cause)` with `cause` set to `'lost'` or `'unusable'`, which changes the notice wording and dedupe key. In `inventory.service.ts`, take the settings lock for Lost, Damaged and For Repair, and for a return to a usable condition. For Damaged or For Repair, set the copy (and materials) `Unavailable`, call the release, then `allocateWaitingRequests(q, titleId, now)`. For a return to usable, set the copy `Available` and allocate. Return `released_reservations` the same way as for Lost.

### 4. Skip reason (R4)
Migration `042_reservation_skip_and_audit.sql`. In `allocateWaitingRequests`, each `continue` writes `last_skip_reason` and `last_skipped_at`, and the assign `UPDATE` sets both to NULL, as do `releaseBookRequest` and the terminal paths. `reservation-query.repository.ts` (which hard-codes `request_kind='Reservation'`) gains a validated `kind` parameter (`Reservation` or `CartHandover`, default `Reservation`) and returns the skip fields to staff. Student endpoints in `reservation.service.ts` do not return them.

### 5. Swap copy and reorder (R5, R6)
Add `swapCopy` and `moveInQueue` to the service, routes in `reservations.routes.ts`, validation in `reservation.validation.ts`, and the existing staff permission in `reservation.rbac.ts`. Write audit rows to `reservation_audit_events` (migration 042) inside the same transaction.

### 6. Book queue UI (R3, R4, R5, R6)
`AdminReservationQueuePage.tsx` gets a kind filter, the cart auto-cancel time, the "Skipped: reason, date" line, Swap copy (picker of eligible copies) and Move up/down (reason dialog with focus trap and Escape). Vitest covers each.

### 7. Trackers
Migration tracker in `.cursor/agent-protocol.md` and `docs/schema-context.md`. The status in this doc moves to `built` after `plan-verifier`.

## Rollout

`042` is additive (columns plus a new table), so old code ignores it. Apply it after `041` (gap 1 rollout runbook), with Ethan's go-ahead, then deploy. Nothing needs a feature flag.

## Implementation tracking

- [x] 1. `pickup-deadline.ts` plus tests, wired into Mark ready
- [x] 2. Cart deadline on submit, cart expiry plus notice
- [x] 3. Damaged or For Repair release and reallocation
- [ ] 4. Migration 042 (skip columns plus `reservation_audit_events`), skip reason write and clear, `kind` parameter on the staff query
- [ ] 5. swap-copy and move endpoints plus audit plus RBAC
- [ ] 6. Book queue UI
- [ ] 7. Trackers updated, `npm test` / typecheck / build green
