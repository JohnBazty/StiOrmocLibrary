---
phase: 01-reservation-maintenance
plan: 01
subsystem: api/reservations
status: complete
tags: [reservations, settings, migration, rbac, pglite]
requires: []
provides:
  - "public.reservation_settings (migration 043, written not applied)"
  - "readReservationSettings, DEFAULT_RESERVATION_SETTINGS, dayCount, parseReservationSettingsUpdate, createReservationSettingsService, reservationSettingsService"
  - "GET/PUT /api/v1/admin/reservation-settings (Librarian only)"
affects: [01-02, 01-03]
tech-stack:
  added: []
  patterns: ["to_regclass presence check before reading an optional table", "single-row upsert per setting in one transaction"]
key-files:
  created:
    - database/supabase/043_reservation_settings.sql
    - apps/api/src/modules/reservations/reservation-settings.service.ts
    - apps/api/src/modules/reservations/reservation-settings.routes.ts
    - apps/api/src/modules/reservations/reservation-settings.test.ts
  modified:
    - apps/api/src/app.js
    - .cursor/agent-protocol.md
    - docs/schema-context.md
decisions:
  - "Each reservation setting is saved on its own: a key present in the PUT body means that setting is saved, so each keeps its own Last changed by"
  - "No row_version check on reservation settings save: the last committed save wins (AC 17)"
  - "Reservation settings PUT re-checks library.manage inside its transaction and returns 503 RESERVATION_SETTINGS_UNAVAILABLE when 043 is not applied"
  - "schema-readiness.ts does not list reservation_settings, so /api/health stays 200 before 043 is applied"
metrics:
  duration: "~25 min"
  completed: 2026-11-19
estimate:
  tokens: 48000
  tasks: 2
actuals:
  tokens: 9200
  tasks: 2
  commits: 2
plan_head_before: b0a1fa720e5be0462f27cfa6fc5e3d04892075c7
plan_head_after: c66a117460a46b4de458b7ef1012d65e8c1c907b
---

# Phase 1 Plan 01: Reservation settings storage and Librarian API Summary

Migration 043 adds a one-row `reservation_settings` table (pickup window 1-7 days, default 1; waiting-list limit off or 7-90 days, with a saved time that moves on every save). A Librarian-only `GET`/`PUT /api/v1/admin/reservation-settings` reads and saves it with "last changed by / at" per setting. Before 043 is applied, reads fall back to window 1 / limit off without aborting an open transaction, and saves return 503.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Librarian saves the pickup window through the API and reads it back from Postgres | f282e6c |
| 2 | Waiting-list limit, full validation and RBAC matrix, missing-table fallback, last save wins, trackers | c66a117 |

Tracer gate: interactive mode, automated-only verify. Re-ran it after Task 1 and it passed (4/4), then I continued to Task 2.

## Verification

- `node --test apps/api/src/modules/reservations/reservation-settings.test.ts`: 16 pass, 0 fail. The tests run the real 043 SQL on PGlite, twice.
- `npm test -w @sti-library/api`: 577 pass, 0 fail.
- `npm run typecheck` (api and web): exit 0.
- `git diff --name-only b0a1fa7..HEAD -- database/supabase` lists only `043_reservation_settings.sql`. `schema-readiness.ts` is unchanged.
- RED was seen before each GREEN. Task 1 failed first because the modules were missing. Task 2 had 6 failing cases before the service change.

## Deviations from Plan

None. The plan was executed as written. Small choices made within the plan:
- The 422 for a body with neither key ('Choose a setting to save.') has no `details.errors`, because no field is involved.
- `save()` checks that the table exists after `requireLibraryActor`, inside the same transaction, so a non-Librarian still gets 403 first.

## Known Stubs

None.

## Threat Flags

None. The new surface is the endpoint and table listed in the plan's threat model. T-01-01 to T-01-05 are covered by the tests (RBAC matrix, 401, validation matrix, RLS and grant assertions).

## Self-Check: PASSED

- FOUND: database/supabase/043_reservation_settings.sql
- FOUND: apps/api/src/modules/reservations/reservation-settings.service.ts
- FOUND: apps/api/src/modules/reservations/reservation-settings.routes.ts
- FOUND: apps/api/src/modules/reservations/reservation-settings.test.ts
- FOUND: f282e6c, c66a117 (ancestors of HEAD)
