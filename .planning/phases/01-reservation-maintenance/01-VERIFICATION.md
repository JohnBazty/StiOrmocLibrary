---
phase: 01-reservation-maintenance
verified: 2026-11-19T03:45:00Z
status: human_needed
score: 22/22 must-haves verified (3 roadmap SCs + 19 SPEC ACs); prohibitions 4/4 test-enforced
covered_files:
  - ".cursor/agent-protocol.md"
  - ".planning/phases/01-reservation-maintenance/01-01-PLAN.md"
  - ".planning/phases/01-reservation-maintenance/01-01-SUMMARY.md"
  - ".planning/phases/01-reservation-maintenance/01-02-PLAN.md"
  - ".planning/phases/01-reservation-maintenance/01-02-SUMMARY.md"
  - ".planning/phases/01-reservation-maintenance/01-03-PLAN.md"
  - ".planning/phases/01-reservation-maintenance/01-03-SUMMARY.md"
  - "apps/api/src/app.js"
  - "apps/api/src/modules/reservations/book-request-events.ts"
  - "apps/api/src/modules/reservations/book-request.service.test.ts"
  - "apps/api/src/modules/reservations/book-request.service.ts"
  - "apps/api/src/modules/reservations/pickup-deadline.test.ts"
  - "apps/api/src/modules/reservations/pickup-deadline.ts"
  - "apps/api/src/modules/reservations/reservation-settings.routes.ts"
  - "apps/api/src/modules/reservations/reservation-settings.service.ts"
  - "apps/api/src/modules/reservations/reservation-settings.test.ts"
  - "apps/api/src/modules/reservations/reservation-waiting-expiry.test.ts"
  - "apps/api/src/modules/reservations/reservation.service.test.ts"
  - "apps/api/src/modules/reservations/reservation.service.ts"
  - "apps/web/src/features/catalog/CatalogMaintenancePage.tsx"
  - "apps/web/src/features/reservations/AdminReservationQueuePage.test.tsx"
  - "apps/web/src/features/reservations/AdminReservationQueuePage.tsx"
  - "apps/web/src/features/reservations/ReservationSettingsPanel.test.tsx"
  - "apps/web/src/features/reservations/ReservationSettingsPanel.tsx"
  - "apps/web/src/features/reservations/StudentReservations.test.tsx"
  - "apps/web/src/features/reservations/StudentReservations.tsx"
  - "apps/web/src/features/reservations/reservation-api.ts"
  - "apps/web/src/features/reservations/types.ts"
  - "database/supabase/043_reservation_settings.sql"
  - "docs/schema-context.md"
covered_digest: "v4:sha256:7ebcca402752ec9275bcd2341da73c0a6e4bb5043636155da2d0b483e47fca0a"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Open /librarian/maintenance as a Librarian, choose the Reservations tab, check both cards (inputs, help text, Save buttons, 'Default' / 'Last changed by' lines) in light and dark mode and on a narrow screen."
    expected: "Two readable cards side by side on wide screens, stacked on narrow; field errors appear inside the card that failed."
    why_human: "Visual layout and contrast; Vitest only checks text and roles."
  - test: "With Ethan's go-ahead, apply 043 to a non-live database (local or staging), save window 3 and limit 7, Mark ready one request, and run the expiry job with a waiting request older than the limit and the save older than 7 days."
    expected: "pickup_deadline is ready + 3 days (or next close); student notice says 'within 3 days'; the old waiting request becomes expired with the waiting-list notice, and the request behind it moves up one place."
    why_human: "End-to-end on a real database needs migration 043 applied; repo tests run settings on PGlite but Mark ready and the expiry job on a fake pool."
---

# Phase 1: Reservation Maintenance Verification Report

**Phase Goal:** Librarians set the pickup window (1-7 days) and an optional waiting-list expiry from a Reservations tab on /librarian/maintenance.
**Verified:** 2026-11-19T03:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Roadmap Success Criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Librarian changes the pickup window and the next Mark ready uses it | VERIFIED | Mark ready reads settings inside its transaction and passes the window to `pickupDeadline` (`book-request.service.ts:303-307`); test `the next Mark ready after saving window 5 uses five days (R2)` (`book-request.service.test.ts:179`) passes |
| SC2 | With expiry set, waiting reservations past the limit expire and the student is told | VERIFIED | `expireWaiting` (`book-request.service.ts:151-166`) called from `expire()` (`:375`); waiting-list notice text (`book-request-events.ts:26-27`, chosen at `:49-50`); tests at `reservation-waiting-expiry.test.ts:82,132` pass |
| SC3 | With expiry blank, no waiting reservation ever expires | VERIFIED | `waitingExpiryCutoff` returns null when days is null (`reservation-settings.service.ts:32-37`) and `expireWaiting` returns 0 before any SELECT; test `reservation-waiting-expiry.test.ts:64` (365-day-old request) passes |

### SPEC Acceptance Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Window 3: Mon 10:00 → Thu 10:00 | PASS | `pickup-deadline.ts:42-45` (`windowDays * DAY`); `pickup-deadline.test.ts` "window 3: ready Mon 10:00 gives Thu 10:00"; `book-request.service.test.ts:167` |
| 2 | Window 1 equals today for all existing cases | PASS | default `windowDays = 1`; all pre-existing `pickup-deadline.test.ts` cases unchanged and pass; closed-day load horizon identical for window 1 (`loadOpeningHours` end `+1+31+1` = old `+33`, test asserts `2026-12-19`) |
| 3 | End after closing moves to next close, skipping closed days | PASS | `pickup-deadline.ts:44` `nextClose`; tests "window 2: an end after closing on a day before a closed date" and "end exactly at closing is kept" |
| 4 | Window 1/7 accepted; 0, 8, 2.5, non-number, blank rejected | PASS | `wholeDays` (`reservation-settings.service.ts:58-61`, `/^\d+$/` + integer + range); `parseReservationSettingsUpdate` (`:64-83`); tests `reservation-settings.test.ts:88,122` |
| 5 | Saving a window leaves stored pickup_deadline unchanged | PASS | `save()` only writes `reservation_settings` (`:116-128`); PGlite test `reservation-settings.test.ts:225` |
| 6 | Expiry blank: nothing expires regardless of age | PASS | see SC3 |
| 7 | Expiry 7/90 accepted; 6, 91, 2.5, non-number rejected; blank = off | PASS | `parseReservationSettingsUpdate` `:75-81`; DB CHECK `043:12`; test `reservation-settings.test.ts:129` |
| 8 | Saved at T: pre-T request expires at T+7d, not T+7d−1min | PASS | gate `now < saved + span → null` (`reservation-settings.service.ts:35`); tests `reservation-waiting-expiry.test.ts:40,74,82`. Ad-hoc PGlite run of the exact SELECT confirmed `reserved_at <= cutoff` includes the boundary and excludes +1 min |
| 9 | Request at R > T expires at R+7d | PASS | cutoff = now − L; test `reservation-waiting-expiry.test.ts:46` and property test `:51` |
| 10 | Re-save at T2 restarts the count; nothing expires at save | PASS | every waiting save sets `waiting_expiry_saved_at = now` (`reservation-settings.service.ts:124-127`); PGlite test `:151`; gate test `reservation-waiting-expiry.test.ts:74` |
| 11 | Assigned copy, ready, claimed, cancelled, cart never expired by waiting rule | PASS | WHERE `request_kind='Reservation' AND status IN ('pending','approved') AND assigned_physical_copy_id IS NULL` + `FOR UPDATE`, re-read under lock (`book-request.service.ts:153-162`); whole expire runs under the circulation lock (`:32`, `transaction` `:171`); test `reservation-waiting-expiry.test.ts:96`; ad-hoc PGlite run excluded assigned, cart and ready rows |
| 12 | Requests behind move up one place | PASS | reuses `releaseBookRequest` queue decrement (`book-request.service.ts:113-114`); test `reservation-waiting-expiry.test.ts:108` |
| 13 | One waiting-list notice per expiry; re-runs no duplicate | PASS | `recordRequestEvent` returns early when the event already exists and notifications dedupe on `book-request:{id}:expired` (`book-request-events.ts:39-41,58-61`); expired rows leave the status filter; test `:132` |
| 14 | "Expires on [Manila date]" only for waiting requests while on | PASS | API `reservation.service.ts:38-50` (`waitingExpiresAt` only for non-cart, no copy, pending/approved); web `StudentReservations.tsx:40`; tests `reservation.service.test.ts` (AC 14 x2) and `StudentReservations.test.tsx` (3 render cases) |
| 15 | Librarian GET/PUT ok; Staff/Student/Faculty 403; signed-out 401 | PASS | mount `app.js:110` behind `/api/v1` `authenticateJwt` and `requireLibraryPermission('library.manage')` (`library-permissions.ts:8` = Librarian only); test `reservation-settings.test.ts:236` (Admin also 403) |
| 16 | "Last changed by [name] on [date]"; never edited = "Default" | PASS | `ReservationSettingsPanel.tsx:7-10`; API joins name (`reservation-settings.service.ts:90-95`); tests `ReservationSettingsPanel.test.tsx:13,22,38`, `reservation-settings.test.ts:173` |
| 17 | Concurrent saves: last commit wins, no partial row | PASS | one transaction, one single-row `INSERT ... ON CONFLICT DO UPDATE` per setting (`reservation-settings.service.ts:112-130`); test `:213` (sequential) and `:140` (invalid value saves nothing). True concurrency relies on Postgres row locking, not app code |
| 18 | Row/table missing: window 1 / off; tab shows defaults | PASS | `to_regclass` check and default fallbacks (`reservation-settings.service.ts:40-55,88-97`), PUT 503 (`:114`); tests `:183,200`; `ReservationSettingsPanel.test.tsx:38` |
| 19 | Notice and error say "N days"/"1 day"; no pickup "24 hours" | PASS | `dayCount` (`reservation-settings.service.ts:19`); ready text `book-request-events.ts:22`; error `book-request.service.ts:279`; Book queue wording `AdminReservationQueuePage.tsx:27,30`; tests `book-request.service.test.ts:167,173,182`. Grep of `apps/` finds no user-facing pickup "24 hours" (only a dev script log and code comments) |

**Score:** 22/22 truths verified (0 present, behavior-unverified)

### Prohibitions

| Prohibition | Tier | Status | Enforcement evidence |
|-------------|------|--------|----------------------|
| MUST NOT expire a request holding a copy / ready / claimed / cancelled / cart via the waiting rule | test | VERIFIED | `reservation-waiting-expiry.test.ts:96` + SQL filter `book-request.service.ts:153-154` |
| MUST NOT expire any waiting request at the moment expiry is switched on, lowered or re-saved | test | VERIFIED | `reservation-waiting-expiry.test.ts:74` + gate `reservation-settings.service.ts:35` |
| MUST NOT expire a waiting request without sending the student its notice | test | VERIFIED | `reservation-waiting-expiry.test.ts:132`; release and notice share one transaction (`releaseBookRequest` → `recordRequestEvent`) |
| MUST NOT show "Last changed by" name or the settings API to students/faculty | test | VERIFIED | `reservation-settings.test.ts:236`; student list test "never carries a librarian name" (`reservation.service.test.ts`) |

### Required Artifacts

All 12 plan artifacts pass `verify.artifacts` (exists, substantive). All 8 key links pass `verify.key-links`. Every new module is imported and used (`app.js:110`, `book-request.service.ts:13`, `reservation.service.ts:8`, `book-request-events.ts:4`, `CatalogMaintenancePage.tsx:2,20`).

### Data-Flow Trace

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| ReservationSettingsPanel | view | GET `/api/v1/admin/reservation-settings` → `read()` SQL on `reservation_settings` + accounts/users | yes | FLOWING |
| StudentReservations | waitingExpiresAt | `listForAccount` → `readReservationSettings` + `reserved_at` | yes | FLOWING |
| Mark ready deadline / notice | pickupWindowDays | `readReservationSettings(q)` in the transaction | yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| API reservation tests | `node --test pickup-deadline.test.ts reservation-settings.test.ts reservation-waiting-expiry.test.ts book-request.service.test.ts reservation.service.test.ts` | 66 pass, 0 fail | PASS |
| Web tests | `npm test -w @sti-library/web -- src/features/reservations src/features/catalog` | 32 files, 142 tests pass | PASS |
| Typecheck | `npm run typecheck` | api + web clean | PASS |
| Waiting-expiry SELECT on real Postgres | ad-hoc in-memory PGlite run of the exact query (not committed) | returns only the pending, unassigned row at the boundary | PASS |

### Probe Execution

Step 7c: not applicable (no probes declared).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RES-MAINT-01 | 01-01, 01-02, 01-03 | Librarians set the pickup hold window | SATISFIED | AC 1-5, 15-19 |
| RES-MAINT-02 | 01-01, 01-02, 01-03 | Librarians set an optional waiting limit | SATISFIED | AC 6-14 |

No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| apps/api/src/modules/reservations/book-request.service.ts | 106 | A waiting-list expiry cancels any pending counter claim with the reason "Pickup deadline expired." | Info | Wrong internal reason text in the rare case a waiting request has a pending counter claim |
| apps/api/src/modules/reservations/reservation-waiting-expiry.test.ts | — | Expiry SQL only exercised on a fake pool in the repo | Info | SQL checked ad hoc on PGlite here; a committed PGlite case would guard future edits |
| apps/api/scripts/verify-phase6-requests.ts | 120 | Log text "fixed 24-hour reservation timer" | Info | Dev script output, not user-facing |

No TBD/FIXME/XXX/TODO markers in phase files.

### Human Verification Required

1. **Reservations tab look and feel** — open `/librarian/maintenance` → Reservations as a Librarian; check both cards in light/dark and narrow widths. Expected: readable cards, errors inside the failing card. Why human: visual.
2. **End-to-end on a database with 043 applied (Ethan's go-ahead, non-live)** — save window 3 and limit 7, Mark ready a request, run the expiry job. Expected: deadline +3 days, "within 3 days" notice, old waiting request expired with the waiting-list notice, next request moves up. Why human: needs the migration applied; repo tests cover Mark ready and expiry on a fake pool.

### Gaps Summary

No gaps. All 8 requirements, 19 acceptance criteria, 3 roadmap success criteria and 4 prohibitions have code and passing tests. Status is human_needed only for the visual check and the end-to-end run after 043 is applied.

---

_Verified: 2026-11-19T03:45:00Z_
_Verifier: Claude (gsd-verifier)_
