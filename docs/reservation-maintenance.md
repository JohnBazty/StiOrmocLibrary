# Reservation maintenance

Branch: `feat/reservation-maintenance` · Date: 2026-11-19 · Migration: `043` (written, not applied) · Spec and plans: [../.planning/phases/01-reservation-maintenance/](../.planning/phases/01-reservation-maintenance/01-SPEC.md)

Stacked on `fix/reservation-hold-gaps` (JohnBazty/StiOrmocLibrary#44), which adds `pickup-deadline.ts`. Rebase onto `main` once #44 merges.

## Problems

| Rule | What happened |
| --- | --- |
| Pickup window | A book marked ready was held for a fixed 24 hours. Changing it needed a code change. |
| Waiting list | A reservation waiting for a copy never expired. When a copy came back it was held for a student who no longer wanted it, and the next student waited a whole pickup window longer. |

## Fix

**Reservations tab** on `/librarian/maintenance` (Librarian only; Staff, Student, Faculty and Admin get 403):
- **Pickup window**: 1 to 7 days, default 1.
- **Waiting-list limit**: blank (off, the default) or 7 to 90 days.
- Each setting has its own Save button and shows "Last changed by [name] on [date]", or "Default" if never changed.
- API: `GET` / `PUT /api/v1/admin/reservation-settings` (`reservation-settings.service.ts`, `reservation-settings.routes.ts`). Invalid values get a field message and nothing is saved.

**Pickup window** (`pickup-deadline.ts`, `book-request.service.ts`):
- Mark ready sets the deadline to ready + N days. If that falls outside opening hours it moves to the next closing time, skipping closed days. Window 1 gives exactly the old deadlines.
- Changing the window does not move holds already ready; only books marked ready afterwards use it.
- The ready notice and the pickup error say "within N days" / "1 day". The Book queue page no longer says 24 hours.

**Waiting-list limit** (`expire()` in `book-request.service.ts`):
- A waiting reservation with no copy expires at max(reserved date, last save of the limit) + limit. Every save restarts the count, so switching it on or lowering it expires nothing that day.
- Reservations with a copy, ready, collected, cancelled or cart handovers are never expired by this rule. A title with a free copy not yet allocated is left for allocation.
- Rows are locked `FOR UPDATE` and re-read before release, under the shared circulation lock. Saving the settings takes the same lock, so a save cannot race a running job.
- The requests behind move up one place. The student gets one notice with its own waiting-list text. No librarian alert, because no copy is released.
- Students see "Expires on [date]" (Manila) on waiting reservations while the limit is on.

## Migration `043_reservation_settings.sql`

- Creates `reservation_settings`, one row (`settings_id = 1`): `pickup_window_days` (1 to 7), `waiting_expiry_days` (NULL or 7 to 90), `waiting_expiry_saved_at`, and changed-by / changed-at columns (FK to `accounts`, `ON DELETE SET NULL`).
- Adds the partial index `ix_reservation_waiting_reserved` on waiting reservations with no copy.
- RLS is on and access is revoked from `PUBLIC`, `anon` and `authenticated`. Additive and safe to re-run.
- Next free migration number is now `044`.

## Rollout order

1. #44's rollout first (`041`, deploy, `042`).
2. Deploy this branch. Until `043` is applied the API uses window 1 and limit off, and Save shows "needs the latest database update".
3. Apply `043`. It is additive, so it is also safe before the deploy.

## Verification

- API: 604 of 604 tests pass. Web: 390 of 390 tests pass. Typecheck and build are clean.
- Settings code and migration `043` run on real Postgres in tests (PGlite).
- Phase-goal check: 19 of 19 acceptance criteria and all 4 "must never" rules pass.
- Reviews: security and database reviewers found nothing critical or high. The medium finding (settings save not taking the circulation lock) and the low findings are fixed.

## Known limits

- Mark ready and the expiry job are tested against a faked database. The waiting-list query ran once on a throwaway PGlite database during verification, not in a committed test. Applying `043` is the first real check.
- The tab has not been checked in a browser yet (the dev server uses the live database).
- No warning notice before a waiting reservation expires, and no full change history of the settings.
- Library hours, closed days and per-role reservation limits still have no maintenance screen.
