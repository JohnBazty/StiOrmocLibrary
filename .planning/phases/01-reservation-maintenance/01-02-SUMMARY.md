---
phase: 01-reservation-maintenance
plan: 02
subsystem: api/reservations, web/reservations
status: complete
tags: [reservations, pickup-window, waiting-list-expiry, notices]
requires: ["01-01"]
provides:
  - "pickupDeadline(readyAt, schedule, closedDates, windowDays = 1) and loadOpeningHours(q, from, windowDays = 1)"
  - "waitingExpiresAt and waitingExpiryCutoff pure helpers in reservation-settings.service.ts"
  - "requestInstructions(status, deadline, { pickupWindowDays, waitingList }) and recordRequestEvent(..., pickupWindowDays?)"
  - "Waiting-list expiry step inside createBookRequestService().expire()"
  - "waitingExpiresAt on each GET /api/v1/reservations item; RequestHistoryItem.waitingExpiresAt"
affects: [01-03]
tech-stack:
  added: []
  patterns: ["one settings read per transaction drives both the stored value and the notice wording", "re-read each locked candidate FOR UPDATE before release"]
key-files:
  created:
    - apps/api/src/modules/reservations/reservation-waiting-expiry.test.ts
  modified:
    - apps/api/src/modules/reservations/pickup-deadline.ts
    - apps/api/src/modules/reservations/pickup-deadline.test.ts
    - apps/api/src/modules/reservations/book-request.service.ts
    - apps/api/src/modules/reservations/book-request-events.ts
    - apps/api/src/modules/reservations/book-request.service.test.ts
    - apps/api/src/modules/reservations/reservation-settings.service.ts
    - apps/api/src/modules/reservations/reservation.service.ts
    - apps/api/src/modules/reservations/reservation.service.test.ts
    - apps/web/src/features/reservations/types.ts
    - apps/web/src/features/reservations/StudentReservations.tsx
    - apps/web/src/features/reservations/StudentReservations.test.tsx
decisions:
  - "A request counts as a waiting-list expiry when it is expired, not a cart, and has neither an assigned copy nor a pickup deadline. It gets its own notice text and no librarian alert."
  - "Ready-notice text names the window only when the caller passes it (Mark ready). Other callers, such as the list and result(), keep the exact Pick up by date and drop the duration phrase."
  - "expiredCount counts pickup and waiting expiries together; releasedAccessions lists pickup holds only."
metrics:
  duration: "~35 min"
  completed: 2026-11-19
estimate:
  tokens: 78000
  tasks: 3
actuals:
  tokens: 12100
  tasks: 3
  commits: 3
plan_head_before: addd0ea1511a9ab1fdba29d43d728a66ba244c21
plan_head_after: 8002490faee2dce95b3014c3ad6f71fda04238f9
---

# Phase 1 Plan 02: Settings drive Mark ready, waiting-list expiry and the student list Summary

Mark ready now reads the saved pickup window once per transaction. That one value sets the stored deadline (N x 24 h, then the existing opening-hours rule) and the "within N days" wording of the ready notice. The PICKUP_DEADLINE_FIXED error also states the saved window. The per-minute expiry job also expires waiting Reservation requests once now >= max(reserved_at, saved_at) + L days. The job locks those rows, re-reads each one before release, and the student gets one waiting-list notice. Students see "Expires on [Manila date]" on waiting reservations while the limit is on.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Mark ready uses the saved pickup window; the ready notice and pickup error state it | a13bd9a |
| 2 | Expiry job expires waiting reservations past the limit, with their own notice | b5dfd3e |
| 3 | Students see "Expires on [date]" on waiting reservations | 8002490 |

Tracer gate: interactive mode, automated-only verify. After Task 1 I re-ran the verify and it passed (49/49), then I continued.

## Verification

- RED came before GREEN for every task. Task 1: 9 new failures. Task 2: the import failed, then 3 expire-behaviour failures once the pure helpers existed. Task 3: 3 API failures and 1 web failure.
- `npm test -w @sti-library/api`: 601 pass, 0 fail.
- `npm test -w @sti-library/web -- src/features/reservations/StudentReservations.test.tsx`: 4 passed.
- `npm run typecheck` (api and web): exit 0.
- Greps: "within 24 hours" in book-request-events.ts = 0. "fixed at 24 hours" in book-request.service.ts = 0. "readReservationSettings(q)" = 1. "waiting-list limit" = 1. "waitingExpiryCutoff" in book-request.service.ts = 2. "Expires on" = 1.
- `pickup-deadline.test.ts` diff adds lines only; the new import is a second import line. `reservation-expiration.service.test.ts` is unchanged.

## Deviations from Plan

**1. [Rule 1 - Test bug] The Mark ready notice test first picked the librarian alert**
- **Found during:** Task 1 GREEN
- **Issue:** The first `INTO notifications` call is notifyLibrarians, not the student notice.
- **Fix:** The test now selects the call whose dedupe key starts with `book-request:`.
- **Commit:** a13bd9a

Small choices made within the plan:
- The waiting step lives in a module-level helper, `expireWaiting(q, now, limit)`, which `expire()` calls after the unchanged pickup loop. It uses the same clamped batch limit (1-500).
- The PICKUP_DEADLINE_FIXED pre-check reads settings through the pool, outside the transaction, as the plan said.
- The strict fake in reservation.service.test.ts (the cover-path test) now answers `to_regclass`, as the plan instructed.

## Known Stubs

None.

## Threat Flags

None. T-01-07 is covered: the step runs in the same transaction after lock(), candidates are selected FOR UPDATE, each row is re-read FOR UPDATE, and tests cover every excluded state. T-01-08: the step uses the clamped batch limit. T-01-09: only waitingExpiresAt reaches the list, and a test asserts that no librarian name or changedBy is present. T-01-10: every expiry goes through releaseBookRequest and recordRequestEvent, and a test checks for exactly one notice.

## Self-Check: PASSED

- FOUND: apps/api/src/modules/reservations/reservation-waiting-expiry.test.ts
- FOUND: a13bd9a, b5dfd3e, 8002490 (ancestors of HEAD)
