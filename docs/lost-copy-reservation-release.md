# Lost copy releases its reservation hold

Branch: `fix/lost-copy-reservation-release` · Date: 2026-11-18 · Migration: `041` (written, not applied)

## Problem

When a librarian marks a held copy **Lost** in Inventory, the hold on it was not released.

`releaseLostCopyReservations` looked up holds with `reservations.accession_id = <physical_copy_id>`. But `accession_id` stores the copy's **material_id**; the physical copy is in `assigned_physical_copy_id` (see `allocateWaitingRequests`). The two numbers differ, so:

| Case | What happened |
| --- | --- |
| The right borrower (usual case) | Not found. Their app still said "Ready for pickup" on a missing book. They came to the desk and the checkout failed. A "Preparing" hold never expired and stayed stuck until staff cancelled it. |
| An unrelated borrower whose copy's material_id happened to equal the lost copy's physical_copy_id | Their hold was reset to `pending` and their pickup deadline erased, without notice. Their copy stayed `Reserved`, so it was held for them with no time limit. |

`findActiveReservation` (the "can I change this copy's availability?" guard) had the same wrong lookup. Its fallback check on `availability_status = 'Reserved'` hid the problem.

A second gap: `book_request_events` allowed one row per reservation and status. When a hold was set aside again on a new copy, the second "Preparing" and "Ready for pickup" events, notices and emails were silently skipped, so the borrower's new 24-hour window could run out unseen.

### Example

| Copy | physical_copy_id | material_id | Held for |
| --- | --- | --- | --- |
| *Noli Me Tangere* `NMT-001` | 12 | 340 | Maria, #501, Ready for pickup |
| *Florante at Laura* `FAL-003` | 7 | 12 | Juan, #502, Ready for pickup |

Marking `NMT-001` Lost ran `WHERE accession_id = 12`. That missed Maria (340) and hit Juan (12).

## Fix

**Lost copy in Inventory** (`overrideInventoryCondition`):
- Holds are found by `assigned_physical_copy_id`, in both the lost release and the availability guard.
- **Reservations** go back to the waiting list **with their queue place**. The assignment, ready time and pickup deadline are cleared, any pending desk claim is cancelled, and the borrower gets "Held copy reported missing".
- **Cart handovers** are cancelled through the existing `releaseBookRequest`.
- Librarians get "Held copy reported lost", which replaces the stale "Prepare requested copy" notice.
- The waiting list is then offered any other free copy of the title (`allocateWaitingRequests`).
- The Lost path takes the shared circulation lock (`library_profile_settings FOR UPDATE`) before locking the copy, the same order book requests use, so it cannot deadlock with them.
- Marking an already-lost copy Lost again now releases any hold the old lookup left on it. Staff can use this to repair stuck holds.

**Second Ready notice** (migration `041_book_request_event_per_copy.sql`):
- Events are unique per reservation, status **and assigned copy** (`UNIQUE NULLS NOT DISTINCT`). Stages without a copy, such as Received and Waiting, still cannot repeat.
- `recordRequestEvent` uses `ON CONFLICT DO NOTHING` with no target, so it works with both the 025 and the 041 rule and **deploy order does not matter**.
- Preparing and Ready notice keys carry the copy id for the borrower and the librarian. Other stages keep their old keys.
- The migration is a single `DO` block, so it applies all or nothing (the runner does not wrap files in a transaction) and a rerun changes nothing. It finds the old 025 rule by its columns, not its generated name.

## Commits

| Commit | Change |
| --- | --- |
| `535928e` | Release holds on a lost copy by its physical copy id |
| `3a6439f` | Alert librarians when a held copy is reported lost; cart handover test |
| `a5c90e6` | Migration 041 and per-copy notice keys |
| `69f3b3d` | Make 041 atomic, rerunnable and name-independent |

## Files

- `apps/api/src/modules/reservations/book-request.service.ts`: new `releaseLostCopyHolds`
- `apps/api/src/modules/reservations/book-request-events.ts`: conflict handling, per-copy notice keys
- `apps/api/src/modules/inventory/inventory.service.ts`: lock order, uses `releaseLostCopyHolds`, repair on re-mark
- `apps/api/src/modules/inventory/inventory.repository.ts`: guard lookup fixed, old release removed
- `database/supabase/041_book_request_event_per_copy.sql`: new
- Tests: `inventory.service.test.ts`, new `book-request-events.test.ts`
- Trackers: `.cursor/agent-protocol.md` (next migration is `042`), `docs/schema-context.md`

## Verification

- [x] API tests: 503 pass, 0 fail (`npm test -w @sti-library/api`)
- [x] Typecheck: clean (`npm run typecheck`)
- [x] Tests written first and seen failing: wrong-id lookup, lock order, queue place kept, borrower and librarian notices, cart handover cancelled, re-mark repair, per-copy notice keys
- [x] Migration 041 run on PGlite (Postgres 17.5), applied twice, with the default and a custom old constraint name. A new copy inserts; the same copy and Waiting do not repeat.
- [x] New code against the old 025 rule on PGlite: no error, same behaviour as before
- [x] The runner (`apply-supabase-file.js`) reads 041 as one statement
- [x] Security review: no CRITICAL or HIGH. MEDIUM "silent demotion" fixed, LOW re-mark repair and cart test added.
- [x] Database review: HIGH deploy-order outage, MEDIUM non-atomic runner and LOW constraint name all fixed
- [ ] Not run against the live Supabase database
- [ ] Not checked in the web app (no UI change; the borrower and librarian screens read the same fields)

## To merge (JohnBazty)

1. Review the four commits.
2. Apply `041` with `npm run db:supabase -w @sti-library/api -- 041_book_request_event_per_copy.sql`. It can go before or after the deploy.
3. Deploy.
4. Optional: re-mark any copy that is already Lost and still shows a held request, to release the hold the old bug left.

## Known limits (not in this PR)

- **Rare deadlock:** a desk checkout and a Lost report on the same title in the same instant could deadlock. Postgres cancels one with an error and no data is damaged. The same risk already exists when holds are cancelled. The fix would be a retry on SQLSTATE 40P01 in the shared transaction helper.
- **Same copy returns:** if a lost copy is found and the same copy is set aside again for the same borrower, they still get no second Ready notice.
- **No reassign action:** a held copy marked Damaged or For Repair still strands the borrower; staff can only cancel. Separate decision.
- **Cart handovers never expire.** Separate decision.
