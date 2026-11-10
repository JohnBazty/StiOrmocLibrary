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

`built` (PRs #5 → #6 → #7 → #8, merge in order; Ethan skipped the optional gates on 2026-11-10, see Gates)

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

**2026-11-10: Ethan skipped these.** None blocks a merge or deploy; do not ask him about them again.

- ~~Final `mysqldump` kept offline.~~ Skipped: every MySQL row was copied into Supabase at the cutover and MySQL has not changed since. The local MySQL database on Ethan's PC still holds the original, so keep it installed for a while.
- ~~Formal live write checks and browser acceptance before PR 2 deploys.~~ Replaced by a quick look after PR 2 (#7) deploys: open the site, log in, open the catalog. If it fails, use Vercel Instant Rollback.
- ~~Remove the Vercel `DB_*` MySQL variables.~~ Skipped: nothing reads them after PR 2; harmless clutter.
- ~~Dump and drop `mysql_cutover_backup_20260925100301`.~~ Skipped: the schema can stay in Supabase indefinitely.

## Decisions (Ethan, 2026-11-10)

1. **Retire the MySQL rollback now.** MySQL has had no writes since the 2026-09-25 cutover, so rolling back would lose every loan, fine and reservation since then. Supabase backups and the cutover backup schema are the real safety net.
2. **Delete the MySQL migration files**, not archive them. Git history keeps them; an archive folder invites agents to treat them as live.
3. **Keep the cutover backup schema.** Originally: drop it about 30 days after PR 2 is stable. Changed 2026-11-10: it can stay indefinitely (see Gates).
4. **Three PRs**: Phase 1; Phases 2 + 3; Phases 4 + 5.

## Implementation tracking

- [x] Open questions answered (2026-11-10)
- [x] Final MySQL dump: skipped by Ethan (2026-11-10)
- [x] PR 1 / Phase 1: tests run on the Postgres dialect; `force-mysql-env.cjs` gone (2026-11-10)
- [x] Formal live checks: skipped by Ethan (2026-11-10); quick look after PR 2 deploys instead
- [x] PR 2 / Phase 2: no `isPostgres` / driver branches in `apps/api/src` (2026-11-10)
- [x] PR 2 / Phase 3 (2026-11-10): `pg` only, `DATABASE_URL` required, `mysql2` removed, session store renamed
- [x] Vercel `DB_*` MySQL variables: skipped by Ethan (2026-11-10)
- [x] PR 3 / Phase 4 (2026-11-10): MySQL scripts, tools and migration tree removed; hook left as is (see change log)
- [x] PR 3 / Phase 5 (2026-11-10): trackers, agent docs and setup docs updated; wiki update is Ethan's separate process
- [x] Status set to `built` (2026-11-10)
- [x] Cutover backup schema drop: skipped by Ethan (2026-11-10); it stays

## Change log

| Date | Change | By |
| --- | --- | --- |
| 2026-11-10 | Plan created. Found that `npm test` forces the MySQL dialect, so Phase 1 moves tests to the Postgres dialect first. | Agent Alpha |
| 2026-11-10 | Ethan's decisions recorded: retire the rollback now, delete MySQL migrations, keep the backup schema about 30 days after PR 2, three PRs. Open questions replaced by Decisions and Gates. | Agent Alpha |
| 2026-11-10 | Phase 1 built. `force-mysql-env.cjs` removed; `env.js` gives every test process (`NODE_TEST_CONTEXT`) a dead local `DATABASE_URL`, so tests never reach a database, even under a bare `node --test`; `DB_FORCE_MYSQL` removed from `env.js` early since nothing else used it. Only 6 of 269 API tests failed on the Postgres dialect, all expecting MySQL text; the Postgres SQL was correct (conflict targets match `uq_notification_user_dedupe` and the `barcode_sequences` primary key). Branch stacked on `fix/test-baseline`, which must merge first. | Agent Alpha |
| 2026-11-10 | Phases 2 and 3 built. `sql-dialect.js` returns Postgres SQL only (`isPostgres` and every driver branch gone); `db.js` builds only the pg pool; `env.js` throws at startup when no database URL resolves (test processes keep the dead URL); `config/db.d.ts` holds local `Pool`/`PoolConnection`/`RowDataPacket`/`ResultSetHeader` types; session store renamed `SqlSessionStore`; `mysql2` removed from `apps/api/package.json` and the lockfile. Local-disk cover upload fallback removed (Supabase Storage only). Phase 4 scripts that import `mysql2` (`run-schema.js`, `run-migration.js`, `verify-floor-plan.js`) now break and wait for PR 3; `create-auth-user.js` uses the shared pool, so it now runs on Postgres but its SQL is unchecked (PR 3). | Agent Alpha |
| 2026-11-10 | Review fixes: the test-database switch in `env.js` never applies when `NODE_ENV=production` (new test); the startup error in `server.ts` names Postgres instead of MySQL. | Agent Alpha |
| 2026-11-10 | Phases 4 and 5 built (PR 3, `chore/retire-mysql-tooling`). Removed `run-schema.js`, `run-migration.js`, `verify-floor-plan.js` (no users), the `db:schema`/`db:migrate`/`db:migrate:auth` scripts, `tools/ai` cutover tools, `database/mysql56-schema.sql`, `database/migrations/` (46 files) and `docs/mysql-workbench-setup.md`; last commit with them is `a767d88` (noted in `database/supabase/README.md`). `create-auth-user.js` SQL was already valid Postgres; only its error text changed. The `tools/ai/smoke-*` and print-migration scripts read the removed `env.db.driver`, so those checks were dropped. Trackers, `CLAUDE.md`, `AGENTS.md`, `agent.md`, schema and setup docs, `README.MD` and the agent files now say Postgres only; `docs/supabase-migration-plan.md` set to `built`. **Deliberate deviation:** `.claude/hooks/*` and `.claude/settings*.json` not edited (Ethan's call); the stale `db:migrate`/`db:schema`/`mysql` command names there match nothing. The 8 `*.migration.test.ts` files and 2 inline tests only asserted the text of the deleted MySQL files, so they were removed (API tests 272 to 252, all passing). Wiki left to Ethan. | Agent Alpha |
| 2026-11-10 | Review fixes: the `/api/health` 503 message points at `db:supabase` instead of the removed `db:migrate`; `plan-verifier` checks one Supabase migration instead of a MySQL pair; `getting-started.md`, `authentication-setup.md`, `jwt-role-authentication.md`, `schema-context.md`, `source-of-truth.md`, `category-management-module.md`, `reservation-borrowing-management-module.md`, `inventory-management-implementation.md` and `book-research-thesis-module-api.md` no longer tell readers to run removed scripts or open deleted MySQL files. Older plan docs keep their history. | Agent Alpha |
| 2026-11-10 | Wiki updated (operation `save-20261110-stiormoc-mysql-removal`). Ethan skipped the optional gates: no final `mysqldump` (local MySQL keeps the original), no formal live checks (quick look after #7 deploys instead), Vercel `DB_*` variables and the cutover backup schema stay. Decision 3 changed to keep the backup schema indefinitely. Status `built`. | Agent Alpha |
