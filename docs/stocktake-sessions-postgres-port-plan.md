# Stocktake Sessions: Port to Postgres-only `main`

## Why

The roadmap's next catalog item is stocktake sessions (`docs/roadmap.md`, "Stocktake sessions" row). A librarian needs to start a count for one shelf, category, room or the whole collection, scan what is on the shelf, close the count, review each discrepancy and export the result. The work was built in October on `feat/stocktake-sessions` (draft PR #2) in the dual MySQL/Postgres era. Its tables (`018_stocktake_sessions.sql`) are already on `main` and live, but the API, web panel and tests never merged. MySQL was retired on 2026-11-10, so the branch needs a small port before John can review it.

## Plan metadata

- **Date created:** 2026-11-12
- **Date last updated:** 2026-11-12
- **Status:** `inprogress`
- **Branch for the build:** `feat/stocktake-sessions` (the PR #2 branch), updated from `origin/main`
- **Plan doc branch:** `docs/stocktake-sessions-plan`
- **Spec (approve first):** [stocktake-sessions-spec.md](stocktake-sessions-spec.md). Its acceptance tests S1 to S8 join T1 to T4 below, and its answers to Q1 to Q4 can add work (Staff access, file upload).
- **Original feature plan:** `docs/stocktake-sessions-discrepancy-implementation-plan.md` on the PR #2 branch (rules, scope kinds, finding codes, lifecycle). This doc only covers the port; it does not change those rules.
- **Migration:** none. Next unused number stays `037`.

## What was checked (2026-11-12)

| Question | Finding |
| --- | --- |
| How far is PR #2 behind `main`? | Branch tip `9e23bd3` last merged `main` at `bead6ce` (PR #16). A trial merge with `origin/main` (`git merge-tree`) has **one** conflict: `apps/api/package.json` (the `smoke:stocktake` script line). `schema-readiness.ts`, `inventory.routes.ts` and `docs/schema-context.md` auto-merge. |
| What does PR #2 add? | 25 files, +3,424 lines: `stocktake.{routes,controller,service,repository,validation}.ts`, `stocktake-export.service.ts` (CSV and PDF), deletion guards in `physical-copy.service.ts` and `thesis-inventory.service.ts`, schema-readiness entries, `StocktakePanel.tsx` plus `inventory-api.ts` and `types.ts`, a hosted smoke script, tests, docs. |
| Does the SQL still run on Postgres-only `main`? | Yes, as far as reading shows. It uses `?` placeholders, `insertId` and `forUpdate`/`upsert`/`excluded` from `config/sql-dialect.js`; all still exist on `main`, and `pg-pool.js` appends `RETURNING *` to inserts so `insertId` works. No `ON DUPLICATE KEY`, `INSERT IGNORE`, `GROUP_CONCAT` or backticks. `CONCAT(...)` and `SELECT ... LIMIT 1 FOR UPDATE` are valid Postgres. Running the tests on the merged branch is the real check. |
| MySQL leftovers in PR #2 | `database/migrations/20261011_048_stocktake_sessions.sql` (MySQL rollback reference). The `database/migrations/` folder no longer exists on `main`. The old plan doc still says "Admin-only" and "MySQL remains the rollback reference". |
| Roles | `main` already limits `/api/inventory` to Librarian (`app.js`: `requireRoles(ROLES.LIBRARIAN)`) and `requireCatalogManager` allows only `Librarian` (session or JWT). PR #2's route tests already use `Librarian`. |
| Live database | Project "STI SMART LIBRARY", `public` schema: all five `stocktake_*` tables exist with row-level security on. They hold 1 session, 2 expected items and 2 discrepancies (most likely a smoke-test leftover; not inspected further and not touched). |

### Commit `7a4d478` (on tag `archive/integration/2026-10` only)

It changed two files:

1. `inventory-preview.routes.ts`: the dev preview login looked up `user_role = 'Admin'` and gave the session the `Admin` role. That query is gone; `main`'s preview route now creates a session with role `System Administrator` and no user lookup. **The cherry-pick does not apply.** Its intent still does: `main`'s preview session is rejected by `/api/inventory` (`requireRoles(ROLES.LIBRARIAN)`) and by `requireCatalogManager`, so the local inventory preview cannot open inventory or stocktake at all.
2. `stocktake.api.integration.test.ts`: switched the test roles from `Admin` to `Librarian`. PR #2's branch already has the `Librarian` version. **Nothing to carry over.**

Decision for this plan: do not cherry-pick `7a4d478`. Re-do its intent as one small change: the preview session role becomes `Librarian` (the response's `role` field too). The route stays dev-only (off in production, loopback and web origin only). Then drop the "carry over `7a4d478` first" note from the roadmap.

## How

All work happens on `feat/stocktake-sessions`, so PR #2 keeps its history and review thread.

1. **Update the branch.** Check `git status` first, then switch to `feat/stocktake-sessions` and run `git merge origin/main`. Resolve `apps/api/package.json` by keeping both `main`'s scripts and `smoke:stocktake`. Run `npm install`, `npm run typecheck` and `npm test` before any other change, and record what fails.
2. **Remove MySQL leftovers.** Delete `database/migrations/20261011_048_stocktake_sessions.sql` with `git rm` (one tracked file). Update the old plan doc: Librarian not Admin, Supabase `018` only, no MySQL reference, change-log entry.
3. **Fix whatever step 1's tests show.** Expected to be small: Postgres type differences such as `COUNT(*)` coming back as a string, or `BIGINT` IDs as strings, in the repository row mappers. Write or adjust a failing test first for each fix.
4. **Preview role (the `7a4d478` intent).** Test first: a supertest case that the preview session can `GET /api/inventory/stocktakes` (or that the saved session role is `Librarian`). Then change `role: 'System Administrator'` and `role: 'Admin'` in `inventory-preview.routes.ts` to `Librarian`.
5. **Check the JWT path.** The web panel calls session routes under `/api/inventory/stocktakes`. `requireRoles` and `requireCatalogManager` both read `response.locals.authenticatedUser`, so a Librarian signed in with a bearer token should pass. Confirm `inventoryActor()` returns the JWT user for the stocktake audit labels (`started_by_user_id`, `scanned_by_user_id`). Add a route test with a JWT-style `authenticatedUser` and no session user. If the thesis inventory's `/api/v1/admin/...` pattern turns out to be required for JWT users, stop and ask Ethan before adding `/api/v1` routes; that is a scope change.
6. **Docs and trackers.** `docs/schema-context.md`: say plainly that `018_stocktake_sessions.sql` is the source of the five tables (line 367 still says the checkout lacks the source). `docs/api-reference.md`: stocktake endpoints (already on the branch; check the role text). `docs/roadmap.md`: update the row. Migration tracker unchanged.
7. **Reviews.** `plan-verifier`, then one combined `security-reviewer` (authorization on every stocktake route, CSV formula injection in the export, the dev preview guard). No `database-reviewer` unless step 3 changes SQL that locks rows (close and resolve use `FOR UPDATE` inside transactions); then add it.
8. **Hand-off.** Mark PR #2 ready only with Ethan's go-ahead, then John reviews it (standing rule: JohnBazty reviews feature branches before merge). Do not run `smoke:stocktake` against the live database without Ethan's go-ahead; it writes a disposable session.

## Tests to write first (red before green)

| # | Test | File |
| --- | --- | --- |
| T1 | Dev preview session gets role `Librarian` and can reach `/api/inventory/stocktakes` (today: 403) | `apps/api/src/modules/inventory/inventory-preview.routes.test.ts` (new) |
| T2 | A Librarian authenticated only by JWT (`response.locals.authenticatedUser`, no session user) can list stocktakes and the actor id is recorded | `stocktake.api.integration.test.ts` |
| T3 | `Staff`, `Admin` and `System Administrator` get 403 on create, scan, close, resolve and both exports (PR #2 tests only cover Student and Faculty) | `stocktake.api.integration.test.ts` |
| T4 | Session totals and paged counts come back as numbers on Postgres (`COUNT` returns `bigint` strings in `pg`) | `stocktake.service.test.ts` |
| T5 | Existing PR #2 suites pass unchanged on the merged branch: `stocktake.service.test.ts`, `stocktake.validation.test.ts`, `StocktakePanel.test.tsx` | existing |

T4 is only needed if step 1 shows a string count leaking out; skip it if the existing tests already assert numbers.

## What to do with PR #2

Keep it. Update it in place (merge `main`, the port commits above), keep it a draft until the build, verifier and security review are done, then ask Ethan before pushing and before marking it ready for John. Update its description: Postgres only, MySQL migration removed, `7a4d478` handled by the preview change, no new migration. Closing it and opening a new PR would lose the October review context for no gain.

## Out of scope

- Any change to the finding rules, scope kinds or lifecycle in the original plan.
- `/api/v1` JWT routes for stocktake (only if step 5 shows they are needed, and only after Ethan agrees).
- Cleaning the one leftover live stocktake session.
- Migration `037` (not needed).

## Implementation tracking

- [x] Ethan approves this plan (gate 1), 2026-11-12
- [x] Ethan approves the spec with the recommended answers, 2026-11-12
- [x] Spec Q1: Staff can start, scan, close, cancel, view and export; resolve, dismiss and review stay Librarian only (route guard `inventory.access.ts` mounted in `app.js`, plus `stocktake.routes.ts`). Web: the Inventory page is not in the Staff nav (`PortalLayout.tsx` `staffNav`), so no Staff navigation was added; StocktakePanel does not know the role, so buttons are unchanged. Follow-up if Ethan wants Staff to open stocktakes in the browser.
- [x] Spec tests S1 to S8 present (existing PR #2 tests or new ones)
- [x] Spec E3 (shared barcode across book and research) checked and reported
- [x] `feat/stocktake-sessions` updated from `origin/main`; `package.json` conflict resolved
- [x] Baseline `npm run typecheck` and `npm test` on the merged branch recorded
- [x] MySQL migration file removed; old plan doc corrected
- [x] T1 to T4 written and seen failing (or noted as already passing)
- [x] Fixes for T1 to T4 and for any baseline failures
- [x] Docs: `schema-context.md`, `api-reference.md`, `roadmap.md`
- [x] `plan-verifier` clean (findings fixed 2026-11-12)
- [x] `security-reviewer` findings (CRITICAL/HIGH/MEDIUM) fixed (findings fixed 2026-11-12)
- [ ] Ethan's go-ahead to push and mark PR #2 ready for John

## Change log

| Date | Change |
| --- | --- |
| 2026-11-12 | Review fixes: C1 and H1 (stocktake reads loans without FOR UPDATE, so lock order matches checkout), H2 (create, preview and close use a constant number of queries; findings and close snapshots written in multi-row statements), H3 (CSV and PDF export errors destroy the response), M1 (CSV guard covers tab and CR), M2 (apply_* locks the counted copy, 409 if the barcode moved, real reservation check), M3 (vanished live row becomes an `archived` finding with a `Removed` close snapshot), M4 (kept: ordinary book verify also bumps `row_version`), M5 (dev preview rejects X-Forwarded-For and non-local Host). V1 route matrix and V2 string-count test added. |
| 2026-11-12 | Built: preview role fix, Staff access split, apply_condition/apply_availability for books, spec tests S1-S8/E3/T2. Not done: T4 (counts already `Number()`-cast), research-copy apply_* (still via Inventory). Awaiting verifier and security review. |
| 2026-11-12 | Spec approved with the recommended answers; Q1 adds Staff access to the scan side. Status `inprogress`. |
| 2026-11-12 | Ethan approved the plan, then asked for a spec first: `docs/stocktake-sessions-spec.md` added; building waits for the spec's approval. |
| 2026-11-12 | Plan created from a read of PR #2, tag `archive/integration/2026-10` (`7a4d478`), `main` and the live `stocktake_*` tables. Status `planned`. |
