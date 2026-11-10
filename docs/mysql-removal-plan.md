# MySQL removal plan

## Why

The app has run on Supabase Postgres in production since the 2026-09-25 cutover (`docs/supabase-migration-plan.md`). MySQL is only a rollback reference, but the API still carries it everywhere:

- `apps/api/src/config/db.js` builds a `mysql2` pool when `DATABASE_URL` is unset.
- `sql-dialect.js` and about 106 `isPostgres` / driver checks in module code keep two SQL dialects alive.
- 75 source files import `mysql2` types.
- **`npm test` forces the MySQL dialect** (`scripts/force-mysql-env.cjs` sets `DB_FORCE_MYSQL=1`). The SQL the tests check is not the SQL production runs. This is the biggest risk the dual path creates.
- Every schema change needs a MySQL + Supabase migration pair, so each feature costs twice the migration work and twice the review.

Removing MySQL leaves one dialect, tests that cover the shipped SQL, and one migration tree.

## Date created

2026-11-10

## Date last updated

2026-11-10

## Status

`inprogress` (PR 1 / Phase 1 built on `fix/tests-postgres-dialect`, stacked on `fix/test-baseline`)

## Out of scope

- Rewriting queries from `?` to `$n` placeholders. `toPgPlaceholders` in `config/sql.js` keeps working; changing every query adds risk for no behavior gain.
- Dropping the private Supabase schema `mysql_cutover_backup_20260925100301`. That is a live-database change and gets its own go-ahead (decision 3).
- Changes to the `sti_ilms_rea` schema (belongs to STI ILMS REA).
- Shutting down Ethan's local MySQL server. That is a manual step outside the repo.

## How

Five phases in three PRs from `main` (decision 4), each PR leaving `npm test`, `npm run typecheck` and `npm run build` green. Phase 1 comes first because it makes every later step safe to check.

| PR | Phases | Why grouped |
| --- | --- | --- |
| 1 | Phase 1 | The risky one; the number of failing tests shows its real size. |
| 2 | Phases 2 + 3 | Between them MySQL mode would half work, which helps no one. |
| 3 | Phases 4 + 5 | Removing a script and updating the docs that name it belong together. |

### Phase 1: run the tests on the Postgres dialect

1. Delete `apps/api/scripts/force-mysql-env.cjs` and drop `--require ./scripts/force-mysql-env.cjs` from `test` and `test:coverage` in `apps/api/package.json`.
2. Tests must still never touch a live database. Add a test env setup that selects the Postgres driver with no real `DATABASE_URL`, so the existing fake `db` objects in tests receive Postgres SQL.
3. Fix the tests whose expected SQL or row shapes were MySQL-specific (`VALUES(col)`, `DATE_ADD`, `FOR UPDATE` without `OF`, `insertId`, `affectedRows`). Where a test fails because the Postgres branch is actually wrong, fix the code, not the test, and note it in the change log.

```js
// before: scripts/force-mysql-env.cjs
process.env.DB_FORCE_MYSQL = '1'
// after: tests import code that sees env.db.driver === 'postgres'
```

### Phase 2: one SQL dialect

1. `config/sql-dialect.js`: keep each helper's name and signature, return only the Postgres form, delete `isPostgres`. Call sites keep working unchanged.
2. Remove each `isPostgres ? pg : mysql` branch in module code, keeping the Postgres side. Grep target after this phase: no `isPostgres`, `DB_FORCE_MYSQL` or `dbDriver ===` left in `apps/api/src`.
3. `core/schema-readiness.ts`: keep only the Postgres missing-table / missing-column error codes.

### Phase 3: one driver

1. `config/db.js`: build only the `pg` pool; `verifyDatabaseConnection` runs `SELECT 1`.
2. `config/env.js`: `DATABASE_URL` is required; fail fast at startup with a clear message when it is missing. Drop `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` and `DB_FORCE_MYSQL`.
3. Replace `mysql2` type imports (75 files) with small local types in `config/db.d.ts` that describe what `pg-pool.js` already returns (`rows`, `insertId`, `affectedRows`). One mechanical import swap per file.
4. Rename `core/mysql-session-store.js` to `sql-session-store.js` (`SqlSessionStore`); it already runs on the Postgres pool in production.
5. Remove `mysql2` from `apps/api/package.json`; update the lockfile.
6. Update `.env.example` (no secrets).

### Phase 4: scripts, tools and the migration tree

1. Remove `db:schema`, `db:migrate`, `db:migrate:auth` and their scripts (`run-schema.js`, `run-migration.js`). Port `create-auth-user.js` and `verify-floor-plan.js` to the Postgres pool, or remove them if unused (check first).
2. Retire the cutover tools in `tools/ai/`: `migrate-mysql-to-supabase.mjs`, `mysql_to_pg.py`, `audit-supabase-cutover.mjs`; port `smoke-phase1-live-acceptance.mjs` if it still has a use. Update `tools/ai/README.md`.
3. Delete `database/migrations/` (001–046) and `database/mysql56-schema.sql` with `git rm` (decision 2). Add one line to `database/supabase/README` (create it if missing) naming the last commit that has them, so `git show <commit>:<path>` brings any file back.
4. Update `.claude/hooks/guard-destructive.mjs` and `.claude/settings.json` so the hook stops listing removed commands.

### Phase 5: docs and trackers

1. `.cursor/agent-protocol.md` tracker: Supabase only (`database/supabase/`, latest `016`, next `017`); remove the MySQL rows and the "convert with `mysql_to_pg.py`" step.
2. `CLAUDE.md`, `AGENTS.md` (Standing decisions), `agent.md`, `docs/schema-context.md`, `docs/getting-started.md`, `docs/AI_PROJECT_REFERENCE.md`: drop "dual-drives MySQL", "migration pairs" and the MySQL setup steps. Keep `CLAUDE.md` and `AGENTS.md` in sync.
3. `library-builder`, `plan-verifier` and `database-reviewer` instructions: one migration per schema change, under `database/supabase/`.
4. Delete `docs/mysql-workbench-setup.md`; mark `docs/supabase-migration-plan.md` `built` with a change-log line pointing here.
5. Wiki: update the StiOrmocLibrary entity page and `hot.md`.

### Gates (Ethan)

- Before PR 1 merges: take a final `mysqldump` of the local MySQL database and keep it offline, outside the repo.
- Before PR 2 deploys: finish the open live write checks and browser acceptance in `docs/vercel-deployment-plan.md`. They test Supabase, so they matter more than the MySQL rollback.
- After PR 2 deploys: remove the Vercel `DB_*` MySQL variables.
- About 30 days after PR 2 is stable: `pg_dump` the `mysql_cutover_backup_20260925100301` schema, keep the dump offline, then drop the schema with its own go-ahead on the day.

## Decisions (Ethan, 2026-11-10)

1. **Retire the MySQL rollback now.** MySQL has had no writes since the 2026-09-25 cutover, so rolling back would lose every loan, fine and reservation since then. Supabase backups and the cutover backup schema are the real safety net.
2. **Delete the MySQL migration files**, not archive them. Git history keeps them; an archive folder invites agents to treat them as live.
3. **Keep the cutover backup schema** until about 30 days after PR 2 is stable, then dump it offline and drop it (see Gates).
4. **Three PRs**: Phase 1; Phases 2 + 3; Phases 4 + 5.

## Implementation tracking

- [x] Open questions answered (2026-11-10)
- [ ] Final MySQL dump kept offline (Ethan, before PR 1 merges)
- [x] PR 1 / Phase 1: tests run on the Postgres dialect; `force-mysql-env.cjs` gone (2026-11-10)
- [ ] Live write checks and browser acceptance done (Ethan, before PR 2 deploys)
- [x] PR 2 / Phase 2: no `isPostgres` / driver branches in `apps/api/src` (2026-11-10)
- [x] PR 2 / Phase 3 (2026-11-10): `pg` only, `DATABASE_URL` required, `mysql2` removed, session store renamed
- [ ] Vercel `DB_*` MySQL variables removed after PR 2 deploys (Ethan)
- [ ] PR 3 / Phase 4: MySQL scripts, tools and migration tree removed; hook updated
- [ ] PR 3 / Phase 5: trackers, agent docs, setup docs and wiki updated
- [ ] Status set to `built`
- [ ] Cutover backup schema dumped offline and dropped (separate go-ahead, about 30 days after PR 2)

## Change log

| Date | Change | By |
| --- | --- | --- |
| 2026-11-10 | Plan created. Found that `npm test` forces the MySQL dialect, so Phase 1 moves tests to the Postgres dialect first. | Agent Alpha |
| 2026-11-10 | Ethan's decisions recorded: retire the rollback now, delete MySQL migrations, keep the backup schema about 30 days after PR 2, three PRs. Open questions replaced by Decisions and Gates. | Agent Alpha |
| 2026-11-10 | Phase 1 built. `force-mysql-env.cjs` removed; `env.js` gives every test process (`NODE_TEST_CONTEXT`) a dead local `DATABASE_URL`, so tests never reach a database, even under a bare `node --test`; `DB_FORCE_MYSQL` removed from `env.js` early since nothing else used it. Only 6 of 269 API tests failed on the Postgres dialect, all expecting MySQL text; the Postgres SQL was correct (conflict targets match `uq_notification_user_dedupe` and the `barcode_sequences` primary key). Branch stacked on `fix/test-baseline`, which must merge first. | Agent Alpha |
| 2026-11-10 | Phases 2 and 3 built. `sql-dialect.js` returns Postgres SQL only (`isPostgres` and every driver branch gone); `db.js` builds only the pg pool; `env.js` throws at startup when no database URL resolves (test processes keep the dead URL); `config/db.d.ts` holds local `Pool`/`PoolConnection`/`RowDataPacket`/`ResultSetHeader` types; session store renamed `SqlSessionStore`; `mysql2` removed from `apps/api/package.json` and the lockfile. Local-disk cover upload fallback removed (Supabase Storage only). Phase 4 scripts that import `mysql2` (`run-schema.js`, `run-migration.js`, `create-auth-user.js`, `verify-floor-plan.js`) now break and wait for PR 3. | Agent Alpha |
