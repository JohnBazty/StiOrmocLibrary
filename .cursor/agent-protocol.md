# STI College Ormoc Integrated Library Management System — Agent Protocol

This file is the shared working agreement for AI agents on this repository.
It is stored under `.cursor/` so it is versioned and visible when the project is pushed to GitHub.

| Field | Value |
| --- | --- |
| **Date created** | 2026-09-25 |
| **Date last updated** | 2026-10-17 (October revisions; MySQL 048/next 049; applied Postgres 029; draft 028 unapplied; next unused 030) |
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
| Latest migration | `20261009_048_rename_system_brand.sql` (reference file integrated; not applied in this session) |
| Latest number | `048` |
| **Next available number** | **`049`** |
| Supabase / Postgres files | Tracked product files through `016` plus Revision Phase 1 `020_revision_phase1_password_recovery.sql` are applied. The live ledger contains externally managed files through `019`, including `009_password_reset_otp.sql`, advisor files `011`/`012`, `014_circulation_preflight_overrides.sql`, `016_configurable_borrowing_policies.sql`, two `017` files, `018_stocktake_sessions.sql`, and `019_durable_job_runner.sql`; some sources remain absent here. Remote `017_rename_system_brand.sql` is now present; reconcile its identity with the existing ledger before any replay. **Next unused Postgres number: 030.** October 16 revision migration `029_october16_revisions.sql` is applied on 2026-10-17 after disposable-schema acceptance and before/after fingerprints of seven existing tables; existing records matched exactly. Enrollment `028_revision_phase2_enrollment.sql` remains an unapplied draft. MySQL 048/next 049 is unchanged. Additive `027_cart_handover_reservation_split.sql` is applied after isolated acceptance and a private snapshot; existing request fields and account/title/copy/loan counts matched afterward. Revision Phase 7 `026_revision_phase7_collection_review.sql` applied individually after private snapshot and isolated acceptance; append-only review history, approved starting reference year 2026, RLS and preserved holdings/accounts. Revision Phase 6 `025_revision_phase6_book_requests.sql` applied individually after private snapshot and isolated acceptance; request IDs, accounts and loan history retained. Revision Phase 5 `023_revision_phase5_desk_circulation.sql` and `024_revision_phase5_reading_materials.sql` are applied; existing records retained. Revision Phase 4 `022_revision_phase4_attendance.sql` is applied with owner-confirmed printing-only service occupancy, per-event access decisions and five-minute pre-closing checkout. Revision Phase 3 `021_revision_phase3_catalog.sql` is applied. Preserve those schemas and reconcile sources before whole-directory replay. Apply only reviewed individual files via `npm run db:supabase -w @sti-library/api -- filename.sql`. |

Naming pattern in this repo:

```text
YYYYMMDD_NNN_short_snake_description.sql
```

Example next file (date prefix chosen on authoring day):

```text
20261011_049_example_change.sql
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

| 2026-10-10 | Revision Phase 1 added and applied Supabase `020` for private account recovery. Existing externally managed files through `019` were inspected and preserved. Next Postgres `021`; MySQL reference remains `047` unapplied / next `048`. |
| 2026-10-11 | Revision Phase 3 applied additive Supabase `021` and completed local holdings-import/public-catalog/Maintenance acceptance. Existing catalog/account/loan data retained; test fixtures removed; no real workbook import, push or deployment. Next Postgres `022`; MySQL reference remains `047` unapplied / next `048`. |

| 2026-10-11 | Revision Phase 5 built locally: Postgres 023/024 applied for scan confirmation receipts and in-library book/native-thesis usage. Temporary Active-account enrollment policy approved; missing handbacks flagged at closing. 298 API/129 web tests, build, isolated Postgres concurrency/returns and local HTTP/browser checks passed. Next Postgres 025; MySQL 047 unapplied/next 048 unchanged. No push/deployment. |

| 2026-10-11 | Integrated branch branding/login commits without database execution; MySQL reference now 048/next 049, applied Postgres remains 024/next unused 025. See `docs/github-update-integration.md`. |


## Main integration — 2026-10-11

The main branch was reconciled with the current revision permission model and phase workflows. Borrowing policy management uses the Librarian workspace; prior login sessions are invalidated when a new login succeeds. Competing upstream SQL identities are retained as non-executable references under `database/upstream-main/`; no migration was applied. Existing phase statuses and applied migration identities remain unchanged. See `docs/main-branch-integration.md`.

| 2026-10-16 | Applied additive Postgres 027 after owner confirmed unavailable-books-only reservations. Cart handovers use a separate request kind, never enter the queue, and create no loan before staff confirmation. Legacy requests retained; next Postgres 028, MySQL reference 048/next 049 unchanged. |
