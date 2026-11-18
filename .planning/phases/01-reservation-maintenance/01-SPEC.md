# Phase 1: Reservation Maintenance — Specification

**Created:** 2026-11-19
**Ambiguity score:** 0.165 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

Librarians change the reservation pickup window (today fixed at 24 hours) and turn on an optional waiting-list expiry (today waiting reservations never expire) from a new Reservations tab on `/librarian/maintenance`, without a code change or migration.

## Background

- `pickupDeadline()` in `apps/api/src/modules/reservations/pickup-deadline.ts` adds a fixed `DAY` (24 h) to the ready time and moves it to the next closing time when that is outside open hours. It exists only on `fix/reservation-hold-gaps` (draft PR #44), so this phase is stacked on that branch.
- `book-request.service.ts` rejects a supplied deadline with `PICKUP_DEADLINE_FIXED` ("fixed at 24 hours"). `book-request-events.ts` tells students "collect your copy within 24 hours".
- `expire()` in `book-request.service.ts` only expires `ready_for_pickup` holds and cart handovers past `pickup_deadline`. Waiting reservations (`pending`/`approved` with no `assigned_physical_copy_id`) never expire. The job runner calls it every minute.
- `releaseBookRequest(q, r, 'expired', …)` already releases a request, moves the queue up and records the event that drives student notices.
- `/librarian/maintenance` (`CatalogMaintenancePage.tsx`) has tabs for catalog data only. No reservation settings table exists. Comparable settings tables: `attendance_operation_settings` (022), `collection_review_settings` (026), fine rules (038).
- Next free migration number: `043` (`042` is written on the parent branch, not applied).

## Requirements

1. **R1 Pickup window setting**: The pickup window is a whole number of days, 1 to 7, default 1.
   - Current: fixed 24 hours in `pickupDeadline()`.
   - Target: Mark ready sets `pickup_deadline` = ready time + N × 24 h; if that instant is outside open hours, the next closing time after it. Never earlier than N × 24 h.
   - Acceptance: with N = 3, Mark ready at Mon 10:00 (open) gives Thu 10:00; with N = 1 the result equals today's behaviour for the same inputs (existing `pickup-deadline.test.ts` cases still pass).

2. **R2 Existing holds unchanged**: Saving a new pickup window changes no stored `pickup_deadline`.
   - Current: n/a (no setting).
   - Target: only requests marked ready after the save use the new window.
   - Acceptance: a hold ready with a 1-day window keeps its deadline after the window is saved as 5; the next Mark ready uses 5.

3. **R3 Waiting-list expiry setting**: Blank (off) or a whole number of days, 7 to 90. Default blank.
   - Current: no limit exists.
   - Target: setting stored with the time it was last saved (`saved_at`).
   - Acceptance: a fresh database (migration applied, no edits) reports expiry off.

4. **R4 Waiting-list expiry job**: When the limit L is set, the existing expiry job also expires every `request_kind='Reservation'` request in `pending`/`approved` with `assigned_physical_copy_id IS NULL` once now ≥ max(`reserved_at`, `saved_at`) + L days, using `releaseBookRequest(…, 'expired', …)`.
   - Current: such requests never expire.
   - Target: they expire as above; requests behind them move up; with the setting blank, none expire.
   - Acceptance: L = 7 saved at day 0; a request reserved 60 days ago expires at day 7, not before; a request reserved on day 3 expires on day 10; with L blank, a request 365 days old stays waiting.

5. **R5 Student notice on waiting-list expiry**: The student gets a notification saying their reservation passed the waiting-list limit and was removed from the queue, worded differently from the pickup-deadline notice.
   - Current: the only `expired` text says "The pickup deadline passed".
   - Target: waiting-list expiry uses its own text; pickup expiry keeps its text.
   - Acceptance: an expired waiting reservation produces exactly one notice with the waiting-list text; an expired ready hold still produces the pickup text.

6. **R6 Student sees expiry date**: On the student's reservations list, each waiting reservation shows "Expires on [date]" (Manila date) when expiry is on.
   - Current: no date shown.
   - Target: date = max(`reserved_at`, `saved_at`) + L days; hidden when expiry is off or a copy is assigned.
   - Acceptance: three render cases: expiry on and waiting shows the date; expiry off shows none; a copy assigned shows none (the pickup deadline still shows as today).

7. **R7 Reservations tab**: `/librarian/maintenance` gets a Reservations tab with both settings, Save, and "Last changed by [name] on [date]" for each setting.
   - Current: no tab, no API.
   - Target: a GET and an update endpoint, Librarian role only; Staff, Student, Faculty and signed-out get 403/401. Invalid values are rejected with a field message and nothing is saved.
   - Acceptance: a Librarian saves window 3 and expiry 14 and sees them after reload with their name and date; Staff gets 403 on both endpoints; 0, 8, 2.5, "abc", 6 and 91 are rejected.

8. **R8 Messages follow the window**: The ready-for-pickup notice and the `PICKUP_DEADLINE_FIXED` error state the configured window ("within 3 days") instead of "24 hours".
   - Current: both say 24 hours.
   - Target: wording uses the stored window; a 1-day window reads "within 1 day".
   - Acceptance: with window 3 the ready notice says "3 days"; with window 1 it says "1 day"; no user-facing text still says "24 hours" for pickup.

## Boundaries

**In scope:**
- One Supabase migration (`043`) adding the reservation settings storage with defaults, checks and RLS.
- API: settings read/update endpoints (Librarian only), `pickupDeadline()` taking the window, waiting-list expiry in `expire()`.
- Web: Reservations tab on Maintenance, "Expires on" on the student reservations list.
- Notice and error wording (R5, R8).
- Tests for all of the above (`node --test` API, Vitest web).

**Out of scope:**
- Library hours and closed-days editor — Ethan approved only A and B; hours stay in migrations for now.
- Reservation limits per role — they live in the archived borrowing policy editor; un-archiving is a separate decision.
- Warning notice before waiting-list expiry and a "keep my place" button — add only if students ask.
- Cart handover deadline — stays "next closing time".
- Full change history of settings — Ethan chose "last changed by" only.
- Applying `043` to the live database — needs Ethan's go-ahead after review.

## Constraints

- Stacked on `fix/reservation-hold-gaps` (PR #44); merge after it.
- Postgres via `pg`, parameterized queries; settings updates and expiry run in transactions. Expiry locks rows `FOR UPDATE` as `expire()` does today so it cannot race Mark ready or copy allocation.
- Times are Asia/Manila; day arithmetic is N × 24 h (Manila has no DST).
- Missing settings row (migration not applied) falls back to window 1 / expiry off, so the code can deploy before `043`.
- Additive migration only; never edit applied files.

## Acceptance Criteria

- [ ] Window 3: Mark ready Mon 10:00 (open) gives deadline Thu 10:00.
- [ ] Window 1 gives exactly today's deadlines for all existing `pickup-deadline.test.ts` cases.
- [ ] Window whose end lands after closing (e.g. 18:00 with close 17:00) moves to the next closing time, skipping closed days.
- [ ] Window 1 and 7 accepted; 0, 8, 2.5, non-number and blank rejected for the pickup window.
- [ ] Saving a new window leaves existing `pickup_deadline` values unchanged.
- [ ] Expiry blank: no waiting request expires regardless of age.
- [ ] Expiry 7 and 90 accepted; 6, 91, 2.5 and non-number rejected; blank accepted (off).
- [ ] Expiry 7 saved at T: a request reserved before T expires at T + 7 days, not at T + 7 days − 1 minute.
- [ ] A request reserved at R > T expires at R + 7 days.
- [ ] Re-saving expiry (same or new value) at T2 moves the count start to T2 for every waiting request; nothing expires at the moment of saving.
- [ ] A request with an assigned copy, `ready_for_pickup`, `claimed`, `cancelled` or a cart handover is never expired by the waiting-list rule.
- [ ] When a waiting request expires, the requests behind it move up one place.
- [ ] Each waiting-list expiry sends exactly one student notice with the waiting-list text; job re-runs send no duplicate.
- [ ] Student list shows "Expires on [Manila date]" only for waiting requests while expiry is on.
- [ ] Librarian GET/update succeed; Staff, Student, Faculty get 403; signed-out gets 401.
- [ ] Each setting shows "Last changed by [name] on [date]"; a never-edited setting shows "Default".
- [ ] Two librarians saving at once: the last committed save wins and its name is shown; no partial row.
- [ ] With the settings row missing, API uses window 1 / expiry off and the tab shows the defaults.
- [ ] Ready notice and pickup error say "N days" / "1 day"; no pickup text says "24 hours".

## Edge Coverage

**Coverage:** 30/30 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| boundary | R1 | ✅ covered | 1 and 7 accepted, 0 and 8 rejected (AC 4) |
| adjacency | R1 | ✅ covered | end exactly at closing time counts as open; just after moves to next close (AC 3) |
| empty | R1 | ✅ covered | blank rejected for window; missing row → 1 (AC 4, AC 18) |
| ordering | R1 | ⛔ dismissed | single value, no ordering |
| precision | R1 | ✅ covered | whole days only, 2.5 rejected; N × 24 h exact (AC 4) |
| unclassified | R2 | ✅ covered | stored deadlines untouched on save (AC 5) |
| boundary | R3 | ✅ covered | 7/90 accepted, 6/91 rejected (AC 7) |
| adjacency | R3 | ⛔ dismissed | single value; no touching ranges |
| empty | R3 | ✅ covered | blank = off (AC 6, AC 7) |
| ordering | R3 | ⛔ dismissed | single value, no ordering |
| precision | R3 | ✅ covered | whole days only (AC 7) |
| boundary | R4 | ✅ covered | expires at exactly start + L, not a minute before (AC 8) |
| precision | R4 | ✅ covered | timestamp comparison in Manila, N × 24 h (AC 8, AC 9) |
| concurrency | R4 | ✅ covered | rows locked FOR UPDATE; assigned copy never expired (AC 11) |
| boundary | R5 | ✅ covered | one notice per expiry (AC 13) |
| adjacency | R5 | ✅ covered | pickup expiry and waiting expiry keep separate texts (R5 acceptance) |
| empty | R5 | ⛔ dismissed | a student with no email still gets the in-app notice through the existing path; nothing new |
| encoding | R5 | ⛔ dismissed | fixed English text, no user input |
| ordering | R5 | ✅ covered | queue moves up after expiry (AC 12) |
| precision | R5 | ⛔ dismissed | no numbers in the notice beyond the date already formatted by existing code |
| adjacency | R6 | ✅ covered | date hidden once a copy is assigned (AC 14) |
| empty | R6 | ✅ covered | expiry off → no date (AC 14) |
| ordering | R6 | ⛔ dismissed | list order unchanged by this phase |
| adjacency | R7 | ✅ covered | concurrent saves: last commit wins (AC 17) |
| empty | R7 | ✅ covered | never edited → "Default"; missing row → defaults (AC 16, AC 18) |
| encoding | R7 | ⛔ dismissed | numeric inputs only; librarian name already stored and escaped by React |
| ordering | R7 | ⛔ dismissed | two fixed settings, fixed order |
| concurrency | R7 | ✅ covered | single-row update in a transaction (AC 17) |
| empty | R8 | ✅ covered | window 1 reads "1 day" (AC 19) |
| encoding | R8 | ⛔ dismissed | fixed English text |

## Prohibitions (must-NOT)

**Coverage:** 4/4 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT expire a request that holds a copy, is ready, claimed, cancelled or a cart handover through the waiting-list rule | R4 | resolved | test (AC 11) |
| MUST NOT expire any waiting request at the moment expiry is switched on, lowered or re-saved | R4 | resolved | test (AC 10) |
| MUST NOT expire a waiting request without sending the student its notice | R5 | resolved | test (AC 13) |
| MUST NOT show the "Last changed by" librarian name or the settings API to students or faculty | R7 | resolved | test (AC 15) |

Canon breadcrumb: role checks, input validation and SQL injection are canon — owned by the `security-reviewer` pass; not minted here.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                   |
|--------------------|-------|------|--------|-----------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      |                                         |
| Boundary Clarity   | 0.80  | 0.70 | ✓      | Hours editor, role limits, warnings out |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Stacked branch, Manila time, fallback   |
| Acceptance Criteria| 0.80  | 0.70 | ✓      | 19 pass/fail criteria                   |
| **Ambiguity**      | 0.165 | ≤0.20| ✓      |                                         |

## Interview Log

| Round | Perspective     | Question summary                                  | Decision locked |
|-------|-----------------|---------------------------------------------------|-----------------|
| 0     | Researcher      | Which reservation settings lack maintenance?      | Pickup window (A) and waiting-list expiry (B) approved; hours editor out |
| 0     | Simplifier      | Defaults?                                         | Window 1–7 days default 1; expiry off by default |
| 1     | Researcher      | Does a window change move existing ready holds?   | No, only holds marked ready after the change |
| 1     | Boundary Keeper | Who edits?                                        | Librarian only |
| 1     | Boundary Keeper | Expiry range; show date to students?              | 7–90 days; students see "Expires on" |
| 2     | Failure Analyst | Lowering the limit expires many at once?          | Every save restarts the count: max(reserved_at, saved_at) + L |
| 2     | Failure Analyst | Off then on again?                                | Count from the new save |
| 2     | Failure Analyst | Change record?                                    | "Last changed by [name] on [date]" only |
| 5.5   | Edge probe      | 29 engine edges + 1 added (R4 concurrency)        | Resolved with the round 1–2 answers; Ethan answered "use recommended" each round |

---

*Phase: 01-reservation-maintenance*
*Spec created: 2026-11-19*
*Next step: /gsd-plan-phase 1*
