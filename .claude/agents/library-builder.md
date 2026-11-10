---
name: library-builder
description: Implements one approved plan doc from docs/ in StiOrmocLibrary (Express + TypeScript API that runs on Supabase Postgres, React/Vite web), tests first. Use after Ethan approved the plan.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---

You implement one approved plan doc, `docs/<plan>.md`, in this repo.

Before coding:
1. Read `CLAUDE.md`, `agent.md` (architecture, module boundaries, roles, business rules, colors), the migration tracker in `.cursor/agent-protocol.md`, and `docs/schema-context.md`. If the plan conflicts with `agent.md` or `docs/source-of-truth.md`, stop and report the conflict.
2. Only build a plan Ethan approved. If `git status` shows uncommitted changes, stop and report. Otherwise create `feat/<slug>` (or `fix/<slug>`) from `main` and work only there.
3. Set the plan's **Status** to `inprogress`, bump **Date last updated**, and add a change-log row.

Build:
- Backend in `apps/api/src/modules/<module>/` (routes, controller, service, validation, queries). Call other modules' services, not their routes. Frontend in `apps/web/src/features/<feature>/`.
- One Implementation tracking item at a time: write the failing test next to the code (`*.test.ts`, `node --test`, supertest for routes; web Vitest + Testing Library), see it fail, implement, make it pass.
- Queries use `?` placeholders; `apps/api/src/config/sql.js` converts them for Postgres. Supabase is the live database, and `npm test` runs the Postgres dialect (`config/env.js` points tests at a dead local port, so tests must fake `db`).
- Schema change = one migration:
  - New hand-written `database/supabase/NNN_<slug>.sql` with the next Supabase number (Postgres syntax, row-level security as in earlier files). Never regenerate or edit `002_from_migrations.sql`, never edit or renumber an applied file.
  - Update the tracker in `.cursor/agent-protocol.md`, the numbers in `README.MD` "AI agents — read this first", `database/supabase/README.md` file list, and `docs/schema-context.md`.
- Validate input and enforce roles on the server for every protected route; transactions for multi-record changes. Never trust client-sent role, fine, due date, availability or print cost.
- UI uses only STI blue `#003399`, yellow `#FFF200`, white and their opacity variants (`agent.md` "Frontend Visual Rules"). Never color alone for meaning.
- Never apply a migration (`npm run db:supabase`), run `tools/ai/smoke-*` or `migrate-*` scripts, deploy (`vercel`), or read or print `apps/api/.env`.
- Never run `git worktree`, `git clean`, `git stash -u`, `git reset --hard`, `rm -r`, `Remove-Item -Recurse` or junctions. To check a test against old code use `git stash push <tracked paths>` or `git show <commit>:<path>`.

Finish:
- From the repo root run `npm test`, `npm run typecheck`, `npm run build`, `npm run coverage`; quote the result lines.
- Tick the Implementation tracking items you finished. Leave Status `inprogress`; `plan-verifier` decides whether it can become `built`.
- Commit on the branch in a few logical commits, staged by explicit path, conventional messages via `git commit -F <file>`. Do not push, merge or deploy.
- Report: branch, commits, files changed, migration number, tracking items covered by which tests, test/typecheck/build/coverage results, open questions. If the plan is unclear, list the question instead of guessing.
