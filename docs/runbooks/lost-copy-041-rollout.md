# Rollout: lost copy fix and migration 041

PR: JohnBazty/StiOrmocLibrary#43 · Branch: `fix/lost-copy-reservation-release` · Written 2026-11-18

## The one rule

**Code first, database second.** Publish the PR #43 code on Vercel, confirm it is live, and only then apply `041`.

| Live code | Database rule | Result |
| --- | --- | --- |
| Old (before #43) | 025 (now) | Works, as today |
| New (#43) | 025 | Works. Same behaviour as today; no second Ready notice yet |
| New (#43) | 041 | Works. The full fix |
| **Old** | **041** | **Broken.** Every book request action fails with Postgres error 42P10 |

Why the last row breaks: the old `recordRequestEvent` says `ON CONFLICT (reservation_id,event_status)`, which needs the 025 rule, and 041 drops that rule. The new code says `ON CONFLICT DO NOTHING`, which works with either rule.

"Broken" covers every book request action: reserving, cart checkout, Mark ready, cancelling, desk pickup, and the `reservation-expiration` and `book-request-advance` jobs.

> Correction: commit `a5c90e6`, the first version of [lost-copy-reservation-release.md](../lost-copy-reservation-release.md) and the first PR description said deploy order does not matter. That held for the new code only. This runbook replaces it.

## Who

| Step | Who | Go-ahead needed |
| --- | --- | --- |
| Review and merge #43 | JohnBazty | JohnBazty's approval |
| Publish on Vercel | JohnBazty, or Ethan | Ethan's go-ahead (project rule) |
| Apply 041 to Supabase | JohnBazty, or Ethan | Ethan's go-ahead (project rule) |

## Steps

### 1. Merge
Merge #43 into `main`.

### 2. Publish the code on Vercel
Merging does not by itself change production. Production has been set by promoting specific deployments (see [2026-11-18-restore-before-main-deployment.md](../plans/2026-11-18-restore-before-main-deployment.md)).

1. Create a production deployment from the merged `main`.
2. Confirm it is the deployment serving https://sti-ormoc-smart-library.vercel.app, and note its `dpl_…` ID.
3. Smoke test on the live site, with 041 **not** yet applied:
   - A student reserves a title that has no free copy. This should succeed and show "Waiting for a copy".
   - A librarian opens the Book queue. It should load.

### 3. Pre-check the database (read-only)
Confirm 041 has not been applied and the 025 rule is still in place:

```sql
SELECT migration_name FROM schema_migrations WHERE migration_name = '041_book_request_event_per_copy.sql';
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.book_request_events'::regclass AND contype = 'u';
```

Expected: no `schema_migrations` row, and one `UNIQUE (reservation_id, event_status)` constraint.

### 4. Apply 041
From the repo root, with `DATABASE_URL` set for the live project:

```powershell
npm run db:supabase -w @sti-library/api -- 041_book_request_event_per_copy.sql
```

The file is one `DO` block, so it applies all or nothing, and running it again changes nothing.

### 5. Post-check (read-only)
Re-run the constraint query from step 3. Expected: only `book_request_events_reservation_status_copy_key`, defined as `UNIQUE NULLS NOT DISTINCT (reservation_id, event_status, physical_copy_id)`. Then:
- Repeat the step 2 smoke test.
- Record 041 as applied in `.cursor/agent-protocol.md`, `docs/schema-context.md` and `docs/supabase-migration-plan.md`.

### 6. Optional repair
Find copies already marked Lost that still have an active hold, left by the old bug:

```sql
SELECT r.reservation_id, r.reservation_status, pc.barcode
  FROM reservations r JOIN physical_copies pc ON pc.physical_copy_id = r.assigned_physical_copy_id
 WHERE pc.condition_status = 'Lost' AND r.reservation_status IN ('pending','approved','ready_for_pickup');
```

In Inventory, mark each listed barcode **Lost** again. This releases the hold, keeps the borrower's queue place and notifies them.

## If something goes wrong

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Book request actions fail with `42P10` / "no unique or exclusion constraint matching the ON CONFLICT specification" | 041 applied while old code is live | Publish the #43 code at once. Or, if that will take a while, restore the 025 rule: `ALTER TABLE public.book_request_events ADD CONSTRAINT book_request_events_reservation_id_event_status_key UNIQUE (reservation_id, event_status);`. This fails if per-copy duplicates already exist; check first with `SELECT reservation_id, event_status, count(*) FROM book_request_events GROUP BY 1,2 HAVING count(*) > 1;` |
| The 041 run fails | Unexpected live schema | Nothing changed (single statement). Read the error, then re-check step 3. |
| Vercel was rolled back to a pre-#43 deployment after 041 | Old code on the new rule | Same as the first row |

## Not covered
Nothing here was run against the live database or Vercel. It was written from the code, the repo docs, and PGlite (Postgres 17.5) checks of 041.
