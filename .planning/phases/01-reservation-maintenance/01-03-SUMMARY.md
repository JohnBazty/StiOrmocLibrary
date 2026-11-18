---
phase: 01-reservation-maintenance
plan: 03
subsystem: web/reservations
status: complete
tags: [reservations, settings, maintenance, web, vitest]
requires:
  - "GET/PUT /api/v1/admin/reservation-settings (plan 01-01)"
provides:
  - "ReservationSettingsPanel (Reservations tab on /librarian/maintenance)"
  - "reservationApi.settings(), reservationApi.saveSettings(), type ReservationSettingsView"
  - "Book queue wording without a fixed pickup duration"
affects: []
tech-stack:
  added: []
  patterns: ["one SettingCard per setting with its own Save, error and Default / Last changed by line"]
key-files:
  created:
    - apps/web/src/features/reservations/ReservationSettingsPanel.tsx
    - apps/web/src/features/reservations/ReservationSettingsPanel.test.tsx
  modified:
    - apps/web/src/features/reservations/reservation-api.ts
    - apps/web/src/features/catalog/CatalogMaintenancePage.tsx
    - apps/web/src/features/reservations/AdminReservationQueuePage.tsx
    - apps/web/src/features/reservations/AdminReservationQueuePage.test.tsx
decisions:
  - "Reservations tab sends the typed text as is (blank limit sends '') and shows the server's field message; no client-side range check"
  - "Each setting card keeps its own error and its typed value after a failed save; a successful save replaces the whole view from the response"
  - "Book queue page names the pickup timer without a duration instead of fetching the Librarian-only window (Staff use the page)"
metrics:
  duration: "~4 min"
  completed: 2026-11-19
estimate:
  tokens: 40000
  tasks: 3
actuals:
  tokens: 5200
  tasks: 3
  commits: 3
plan_head_before: 00186baee0dc5aba7ebdee32ba15ba3f4ecde43e
plan_head_after: a7fbc0e7ef6d7a00430c287db829a78331a5fc1c
---

# Phase 1 Plan 03: Reservations tab and Book queue wording Summary

/librarian/maintenance has a Reservations tab with two cards, Pickup window (1-7) and Waiting-list limit (blank = off, 7-90). Each card has its own Save and a "Default" or "Last changed by [name] on [Manila date]" line. The server's field message shows only in the card whose save failed. The Book queue page no longer says "24-hour".

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Reservations tab loads the settings and saves the pickup window | 26cbb39 |
| 2 | Waiting-list limit card, blank means off, field errors and defaults | bd74438 |
| 3 | Book queue page names the pickup timer without a fixed duration | a7fbc0e |

Tracer gate: interactive mode, automated-only verify. I re-ran it after Task 1 and it passed (2/2), then continued.

## Verification

- RED before GREEN in every task. Task 1 failed because the component did not exist. Task 2 had 3 failing cases; the load-error case already passed with the Task 1 code. Task 3 failed on the old "24-hour" message.
- `ReservationSettingsPanel.test.tsx`: 6 pass. `AdminReservationQueuePage.test.tsx`: 10 pass.
- `npm test -w @sti-library/web`: 89 files, 389 tests pass.
- `npm test -w @sti-library/api`: 601 pass, 0 fail.
- `npm run typecheck`: exit 0. `npm run build`: exit 0. The only output is the existing chunk-size warning.
- Acceptance greps: the settings path appears 2 times in reservation-api.ts, `ReservationSettingsPanel` 2 times and `'reservations','Reservations'` 1 time in CatalogMaintenancePage.tsx, `Save waiting-list limit` 1 time in the panel, and `24-hour` 0 times in the queue page and its test.

## Not checked

- Visual check in the browser (`npm run dev` and the Librarian screen). It was skipped because the dev server talks to the live database. Ethan should open /librarian/maintenance and choose Reservations. Before 043 is applied, Save should show the API's 503 message in that card.

## Deviations from Plan

None. Small choices made within the plan:
- `PageHeader` does not render `description`, so the "no fixed hours" assertion checks the rendered page text, and the header text was fixed in the source.
- While a save is running, the Save button reads "Saving…".

## Known Stubs

None.

## Threat Flags

None. T-01-11: the names render only under /librarian/* as React text. T-01-12 is accepted: the server validates every value.

## Self-Check: PASSED
