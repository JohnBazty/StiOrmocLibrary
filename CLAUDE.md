# StiOrmocLibrary

STI College Ormoc's live library system (npm workspaces: `apps/api` Express + TypeScript API, `apps/web` React + Vite + Tailwind). The API runs on Supabase Postgres only (MySQL was retired 2026-11-10). Origin: github.com/JohnBazty/StiOrmocLibrary. Separate from STI ILMS REA, Ethan's clean-room Koha rebuild.

## Read these first (do not duplicate them here)
- [AGENTS.md](AGENTS.md): first stop for every AI tool; also holds "Automation and memory", "How to write code" and "How to reply to Ethan".
- [Owner engineering and collaboration rules](AGENTS.md#owner-engineering-and-collaboration-rules): all 15 owner rules apply to this library project, including focused clarification before implementation, independent judgment, proportionate verification, data protection and the `ans`, `simp`, `ans simp` response shortcuts. Added 2026-11-14; explicit user instructions take precedence over older project defaults. Keep the complete rules in AGENTS.md as the shared source rather than duplicating them here.
- [.cursor/agent-protocol.md](.cursor/agent-protocol.md): `start session` protocol, plan doc shape and status values, migration tracker (current and next number).
- [agent.md](agent.md): architecture, module boundaries, database, security, roles, business rules, UI colors.
- [docs/source-of-truth.md](docs/source-of-truth.md): the product PDFs. [docs/schema-context.md](docs/schema-context.md): current schema.

`AGENTS.md` is read by other tools (Codex, Cursor and others). Keep it in sync with this file: when you add or change a hook, agent, skill, MCP server or memory rule for this repo, add its manual equivalent to `AGENTS.md` "Automation and memory". When you save a durable project decision to private memory (`~/.claude/projects/.../memory/`), also put it in `AGENTS.md` "Standing decisions" or the wiki.

## Working rules
- **Branches:** one branch per change from `main` (`feat/<slug>`, `fix/<slug>`, `chore/<slug>`). Never commit to `main` directly. Never push, merge, deploy (Vercel) or run a migration against a live database without Ethan's go-ahead. The repo belongs to JohnBazty.
- **No destructive file commands:** never run commands that can delete untracked or ignored files: `git worktree`, `git clean`, `git stash -u`, `git reset --hard`, `git checkout -- .`, `rm -r`, `Remove-Item -Recurse`, `rmdir /s`, junctions or symlinks. The checkout holds files git cannot restore (`apps/api/.env`, `.vercel/`, runtime uploads in `apps/storage/` and `apps/api/public/assets/covers/`, `graphify-out/`). `.claude/hooks/guard-destructive.mjs` blocks these for every agent and also matches these words inside commit messages, so pass long messages with `git commit -F <file>`. To check old code use `git show <commit>:<path>` or `git stash push <tracked paths>`.
- **Tests first:** write the failing test, see it fail, then the smallest code that passes. API: `node --test` (`*.test.ts` next to the code, supertest for routes). Web: Vitest + Testing Library.
- **Reviews before each PR:** one combined `security-reviewer` (security, correctness, React); add `database-reviewer` when the change adds a migration (`database/supabase/`) or concurrent SQL. Fix CRITICAL, HIGH and MEDIUM findings first; fix LOW findings in the main session.
- **Lean sessions:** one feature per session, at most 3 review agents, no separate `code-reviewer`. Start from the wiki (`wiki/hot.md`, `wiki/entities/StiOrmocLibrary.md`); do not re-read what it already summarises.
- **Start session:** when Ethan says `start session`, use the `start-session` skill. It runs the `.cursor/agent-protocol.md` protocol (greet as Agent Alpha, brief, wait) wiki-first.
- **Live systems:** the hook asks before `db:supabase`, `db:backfill:*`, `auth:create-user`, `tools/ai/smoke-*`, `migrate-*`, `audit-*` and `vercel` commands. Approve only a step Ethan asked for.

## Team (`.claude/agents/` plus user-level agents)
- `library-builder`: builds one approved plan doc, tests first, one Supabase migration per schema change, trackers updated.
- `plan-verifier` (read-only): checks tracking items have tests, migrations and trackers match, and whether Status can become `built`.
- User-level: `security-reviewer` (combined review before each PR), `database-reviewer` (migrations or concurrent SQL), `tdd-guide`, `build-error-resolver`, `react-build-resolver`, `e2e-runner`.
- Flow per feature: Ethan approves the plan, then `library-builder`, `plan-verifier`, `security-reviewer` (plus `database-reviewer` when there is a migration), fixes, then ask Ethan before push or PR.

## Database
- This repo owns the `public` schema of the Supabase project "STI SMART LIBRARY". Never read, change or migrate the `sti_ilms_rea` schema or its role `sti_ilms_rea_app`; that belongs to STI ILMS REA.
- Supabase Postgres is the only database; one migration per schema change under `database/supabase/`. Follow the migration tracker in `.cursor/agent-protocol.md`; never edit or renumber an applied migration.
- `pg` with parameterized queries only. Multi-record changes run in a transaction.

## Commands
From the repo root: `npm install`, `npm run dev` (web :5173 + API :4000), `npm test`, `npm run typecheck`, `npm run build`, `npm run coverage`.
