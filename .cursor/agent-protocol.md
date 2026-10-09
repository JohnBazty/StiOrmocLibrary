# STI College Ormoc Integrated Library Management System — Agent Protocol

This file is the shared working agreement for AI agents on this repository.
It is stored under `.cursor/` so it is versioned and visible when the project is pushed to GitHub.

| Field | Value |
| --- | --- |
| **Date created** | 2026-09-25 |
| **Date last updated** | 2026-10-09 (public system branding; MySQL `048` / next `049`; Supabase `017` / next `018`) |
| **Maintained for** | All assigned AI agents and human developers |

---

## Start session protocol

**Trigger phrase (from Ethan):** `start session`

When Ethan says **start session** (or a clear equivalent such as “start the session”), the active agent must:

1. **Greet Ethan** as **Agent Alpha** (unless a different assignment is active).
2. **Scan recent documentation** — at minimum:
   - `.cursor/agent-protocol.md` (this file)
   - Newest or in-flight plans under `docs/` (status `planned` / `inprogress` / recent `built`)
   - `docs/schema-context.md` / `AGENTS.md` if the last work touched schema or architecture
3. **Catch up on what we did last** — read the latest plan change logs, migration tracker in this file, and if helpful recent chat/agent transcripts or the last meaningful code/doc diffs.
4. **Report a short catch-up briefing**, including:
   - Latest thing completed or left pending
   - Current migration number and **next available** number
   - Open `planned` / `inprogress` work (for example Supabase conversion)
   - Ready state for the next build command
5. **Do not start building** until Ethan gives the next explicit command after the briefing.

Purpose: make every new chat session fast to resume without Ethan re-explaining context.

---

## People and agent assignment

| Role | Identity |
| --- | --- |
| Developer | **Ethan Noval** |
| This repository’s primary agent slot | **Agent Alpha** |

More AI models may be assigned later for different purposes (for example docs-only, testing-only, or UI-only). Agents must identify which assignment they are operating under and must not silently take over another agent’s reserved scope when Ethan has split responsibilities.

When Agent Alpha is active in a session, introduce or treat yourself as **Agent Alpha** unless Ethan reassigns the session.

---

## Documentation rule (everything we do)

For every meaningful project change (features, migrations, infrastructure, tooling, refactors that affect behavior), create or update documentation.

### Required plan / work doc shape

Every tracked work document should include:

1. **Title**
2. **Why** — why we are doing this
3. **Date created**
4. **Date last updated**
5. **Status** — one of: `planned` | `inprogress` | `built`
6. **How** — how it is (or will be) implemented, including process flow and sample code snippets where useful
7. **Implementation tracking** — checklist of progress
8. **Change log** — every plan or scope change must be recorded here, and **Date last updated** must be bumped

### Status lifecycle

```text
planned → inprogress → built
```

- Start as `planned` until Ethan approves building.
- Set `inprogress` when implementation starts.
- Set `built` only when the work is complete; update the doc at that time.
- If the plan changes after approval, log the change and keep status accurate (`inprogress` until rebuilt, then `built` again if re-completed).

Preferred location for long-lived plans: `docs/` (for example `docs/supabase-migration-plan.md`).

Also continue to respect repository authority docs:

- `AGENTS.md`
- `agent.md`
- `docs/source-of-truth.md`
- `docs/schema-context.md`

---

## Migration tracking rule

Always know and document:

1. **Current latest migration** (filename + numeric suffix)
2. **Next available migration number**

### Current tracker (update whenever a migration is added)

| Item | Value |
| --- | --- |
| Migrations directory | `database/migrations/` |
| Latest migration | `20261009_048_rename_system_brand.sql` |
| Latest number | `048` |
| **Next available number** | **`049`** |
| Supabase / Postgres files | Product files through `016_phase6_legacy_student_account_links.sql` are applied; branding migration `017_rename_system_brand.sql` is next, followed by number **018**. The live ledger also contains `011_advisor_security_lockdown.sql` and `012_performance_advisor_fixes.sql`, which are absent from this checkout and need source reconciliation. The tracked `007` is present. Reconcile the `002`/`005` ledger gaps before whole-directory replay. Apply reviewed individual files with `npm run db:supabase -w @sti-library/api -- filename.sql` when `DATABASE_URL` is set. |

Naming pattern in this repo:

```text
YYYYMMDD_NNN_short_snake_description.sql
```

Example next file (date prefix chosen on authoring day):

```text
20260927_048_example_change.sql
```

When a new **MySQL** migration lands:

1. Update this table’s **Latest** and **Next available** values in this file.
2. Mention the new number in the related work doc’s change log / How section.
3. Do not reuse or renumber an already-applied migration; add a new file instead.
4. Re-run `python tools/ai/mysql_to_pg.py --migrations -o database/supabase/002_from_migrations.sql` (or add a new numbered Supabase file) and review before applying to Supabase.

Note: Supabase / PostgreSQL conversion is **in progress** (`docs/supabase-migration-plan.md`). Until cutover is trusted, the MySQL tree above remains authoritative for numbering additive MySQL fixes. After cutover, prefer new DDL under `database/supabase/`.

---

## Python tooling rule (efficiency)

Agents **may and should** create small **Python-based tools** in the repository when that helps AI models and developers:

- Track documentation status (`planned` / `inprogress` / `built`)
- Locate specific files, plans, or migrations quickly
- Report the current and next migration number
- Assist the planning / checklist process

Prefer simple, readable scripts under a clear folder (for example `tools/` or `scripts/ai/`) with a short README in that folder. Tools must not commit secrets or rewrite `.env`.

---

## Working protocol summary

1. On **`start session`**: greet, scan docs, catch up on last work, brief Ethan, then wait.
2. Document first (or in the same change as the code) using the required shape.
3. Wait for Ethan’s approval when a doc is still `planned` and he has asked for a draft-then-approve gate.
4. Track migrations (current + next number) on every DB-related task.
5. Use Python helpers freely to stay efficient.
6. Operate as the assigned agent identity (**Agent Alpha** unless reassigned).
7. Log plan changes; bump **Date last updated**.

---

## Change log

| Date | Change |
| --- | --- |
| 2026-09-25 | Initial protocol saved under `.cursor/agent-protocol.md` by Agent Alpha at Ethan Noval’s request: documentation shape, migration tracker (`032` / next `033`), Python tooling allowance, Agent Alpha assignment. |
| 2026-09-25 | Added **Start session protocol**: on `start session`, greet as Agent Alpha, scan recent docs and last work, brief catch-up, wait for next build command. |
| 2026-09-25 | Surfaced Start session as the first agent section in `README.md` and as the first stop in `AGENTS.md`, so new agent chats read the protocol before other work. |
| 2026-09-25 | Supabase conversion started: dual MySQL/Postgres driver, `database/supabase/` drafts, tracker notes for parallel Postgres tree. See `docs/supabase-migration-plan.md`. |
| 2026-09-25 | Cutover ported into GitHub main: MySQL tracker advanced to `040` / next `041`; added `005_main_product_gapfill.sql` for MAIN product tables. |
| 2026-09-26 | Phase 3 archive and image migration added: MySQL reference `041` / next `042`, Supabase applied `010` / next `011`. Phase 3 P1–P3, A9, and F1 deployed; R1 excluded as requested. |
| 2026-10-09 | Added branding migrations MySQL `048` and Supabase `017`; tracker advanced to MySQL next `049` and Supabase next `018`. |
| 2026-09-26 | Phase 2 item 1 account management deployed: MySQL reference `042` / next `043`, Supabase applied `011` / next `012`. Student lifecycle and audit flows passed production acceptance. Item 2 awaits user approval. |
| 2026-09-26 | Phase 2 items 2–3 built and tested locally without pushing or deploying. MySQL rollback reference `043` adds category description; Supabase already has that column from applied migration `008`, so no new Postgres migration was needed. Next MySQL number `044`, next Postgres number `012`. |
| 2026-09-27 | Remaining Phase 2 work prepared locally without pushing or deploying. MySQL rollback references `044`–`046` and Supabase `012`–`014` are unapplied. Next MySQL number `047`, next Postgres file `015`; latest hosted Supabase applied migration remains `011`. See `docs/phase2-local-implementation.md`. |
| 2026-09-27 | Phase 6 role registration migration prepared locally: MySQL reference `047`, Supabase `015`; both unapplied. Next numbers `048` and `016`. No push or deployment. |
| 2026-09-28 | Applied reviewed Supabase product files `012`–`015` individually after taking private snapshots of affected rows. Local API schema health is ready; a disposable Staff request passed real-Postgres registration/code verification and was removed. MySQL `047` remains a rollback reference; next numbers remain `048` and `016`. The live ledger has two advisor-named files absent from this checkout. No GitHub push or Vercel deployment. |
| 2026-09-28 | Applied Supabase `016` to link seven existing Student users to missing sign-in accounts without replacing their operational user IDs or password hashes. Next Postgres file number is `017`; MySQL reference remains `047` / next `048`. |
