# Repository Instructions

## First stop for AI agents

1. Read the **AI agents — read this first** section at the top of [README.MD](README.MD) when present, otherwise continue below.
2. Follow [`.cursor/agent-protocol.md`](.cursor/agent-protocol.md) for session start, plan status values, and the Supabase migration tracker.
3. When Ethan says **`start session`**, run that Start session protocol before building.

## Owner-installed skills

Caveman is installed for this repository at `.agents/skills/caveman/SKILL.md`. Use normal mode for planning and concise Caveman mode for implementation unless the owner requests a different style. Preserve clear nontechnical explanations, required progress updates, verification results and material limitations. Full explanations, plans and other saved documents retain the detail their task needs. This is a reply-style skill, not a token cap or permission to skip work.

The owner's Claude skill collection is adapted for Codex under `C:/Users/JOHN/.codex/skills/claude-*`. Select and read the relevant skill when it improves the task: UI/UX and baseline UI for interface work; systematic debugging and webapp testing for defects and QA; React/coding standards for implementation; database/SQL/API security for relevant backend work. Do not load all skills for every request. Follow each Codex entrypoint's compatibility notes and this repository's requirements. Missing source helper files are not installed capabilities. See [installation and limits](docs/codex-local-skills-20261016.md).

## Before making design, implementation, or database decisions

Design every feature for a person with no technical background. Follow the owner's plain-language and reduced-workflow requirement in `agent.md`, including automatic recognition and clear review before saving.

1. Read [docs/source-of-truth.md](docs/source-of-truth.md) and consult its preserved Final Draft and Administrative System Flow PDFs for the relevant feature.
2. Read and follow [agent.md](agent.md).
3. Check the currently implemented schema contract in [docs/schema-context.md](docs/schema-context.md).
4. For hosted database work, also read [docs/supabase-migration-plan.md](docs/supabase-migration-plan.md).

The PDFs define the target product. The schema context describes the current database implementation. When they differ, plan a backward-safe migration instead of silently changing table meanings. Supabase Postgres is the only database (`database/supabase/`).

`CLAUDE.md` holds the same working rules for Claude Code and points back here. Keep the two in sync: a rule changed in one is changed in the other.

## Safety rules (all tools)
- **Never run commands that can delete untracked or ignored files:** `git worktree` (add or remove), `git clean`, `git stash -u`, `git reset --hard`, `git checkout -- .`, `rm -r`, `Remove-Item -Recurse`, `rmdir /s`, junctions or symlinks. The checkout holds files git cannot restore: `apps/api/.env`, `.vercel/`, runtime uploads in `apps/storage/` and `apps/api/public/assets/covers/`. In STI ILMS REA a worktree removal once deleted `apps/api/.env`. To look at old code use `git show <commit>:<path>` or `git stash push <tracked paths>`.
- **Secrets:** never print, copy, commit or paste any `.env` file. Never put secrets in tracked files, logs, API replies or the database.
- **Database:** this repo owns the `public` schema of the Supabase project "STI SMART LIBRARY". Never read, change or migrate the `sti_ilms_rea` schema (STI ILMS REA's) or use its role `sti_ilms_rea_app`. Apply migrations to a live database only when Ethan says so.
- **Git:** one branch per change from `main` (`feat/`, `fix/`, `chore/<slug>`). Never commit to `main` directly. Never push, merge or deploy without Ethan's go-ahead (the GitHub repo belongs to JohnBazty). Stage files by explicit path; never force-add (`git add -f`) an ignored file. Long commit messages go through `git commit -F <file>`.
- **Students' personal data (RA 10173, Data Privacy Act):** never write personal data into docs, the wiki, logs or tests.

## How to write code (same way as Claude Code)
The rules in `agent.md` say what the code must look like. This section says how to work.
- **Read before you change.** Open the files you will touch and their tests, and find the existing pattern for the same job (a module, a route, a screen). Copy that shape. Do not invent a second way to do something the code already does.
- **Tests first.** Write the failing test, run it and see it fail, then write the smallest code that passes, then tidy. API: `node --test` (`*.test.ts` next to the code, supertest for routes). Web: Vitest + Testing Library.
- **Security-rule migrations get a real-SQL test.** A migration that turns on row-level security or revokes access gets a `node --test` test that runs it in PGlite (in-memory Postgres) through `apps/api/src/test-utils/pglite-migration.ts`, then checks that `anon` and `authenticated` are refused and the owner still reads. Pass only the stub tables that one migration needs; replaying every migration does not work outside Supabase. Example: `apps/api/src/modules/auth/login-devices-rls.migration.test.ts`. `npm run db:check-rls` still checks the live database.
- **Stay in scope.** Change only what the task needs. No drive-by refactors, renames, new dependencies or reformatting of untouched code. If you notice something else worth fixing, mention it to Ethan instead of doing it.
- **Small, readable code.** Clear names. Early returns instead of deep nesting. Named constants instead of magic numbers. Return new objects rather than mutating inputs. Comments only where the reason isn't obvious from the code.
- **Handle errors on purpose.** Validate input at the edge. Return a clear error code and a message safe for users. Never swallow an error silently. No `console.log` or debug code left behind.
- **Check before you say it's done.** Run `npm test`, `npm run typecheck` and `npm run build` (plus `npm run coverage` for a feature). For UI changes, also run the app (`npm run dev`, web on http://localhost:5173) and look at the screen. If something fails or you could not run it, say so plainly with the output. Never claim a check passed that you didn't run.
- **Review before each PR.** One combined security review (security, correctness, React) of the branch diff; add a database review when the change adds a migration or concurrent SQL. Fix CRITICAL, HIGH and MEDIUM findings first, then LOW ones directly.
- **Commit cleanly.** One logical change per commit, staged by explicit path, conventional message (`feat:`, `fix:`, `docs:`, `chore:`), on the right branch. Never commit unrelated files from `git status`.

## How to reply to Ethan (same way as Claude Code)
- **Answer first.** The first sentence answers the question or says what was done. Details come after.
- **Plain language.** Short sentences and everyday words. Explain any technical term the first time you use it.
- **Short and scannable.** Use headings or short bullet lists only when they help. Cut filler, repetition and long preambles.
- **Say what changed and where.** Name the files you changed, and the branch and commit. Give commands Ethan might run in their own code block.
- **Be honest about the state.** Clearly separate done and verified, done but not checked, and not done. Report failures and skipped steps with the reason. Never guess at a result.
- **Recommend, don't list everything.** When there is a choice, give your recommendation and why in one or two lines.
- **One question at a time,** asked at the end.
- **Ask before outward or risky steps.** Push, open or merge a PR, deploy, run a migration on a live database, delete anything, or send anything. Approval for one step doesn't cover the next.
- **Flag conflicts, don't override.** If a request conflicts with these rules, the source-of-truth PDFs or the library policy, say so and ask.
- **No flattery or filler.**

## Shared skills
These skills are committed in both `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex and other tools). Use them when the task matches:

| Skill | Use it for |
|---|---|
| `ui-ux-pro-max` | Designing, building or reviewing screens: layout, accessibility, typography, charts, UX rules. Its search scripts need Python 3. |
| `design-system` | Design-token structure and component specs. |
| `ui-styling` | Tailwind styling patterns and accessible components. |
| `start-session` | The `start session` briefing: greet as Agent Alpha, catch up wiki-first, report migration numbers and open plans, then wait. Project-specific (this repo only). |

Project rules win over skill advice. Follow the owner’s current visual rules in `agent.md`: preserve the deployed theme and use accessible semantic colors. The earlier blue/yellow/white-only restriction was withdrawn by the owner. Add no new UI library without Ethan's approval. When a skill changes, update both copies; the `.agents/skills/` copy uses `.agents/skills/...` paths. Other skills Ethan has installed (banner-design, brand, design, slides, stageshow) stay local and are not committed.

## Automation and memory (do by hand what Claude Code does automatically)
Claude Code runs hooks, MCP servers and a session-start memory load for this repo. Other tools do none of this, so do these steps yourself.

### Session start
1. Read `C:\Users\Ethan\Ethan's Vault\wiki\hot.md` "Active Threads" (where work stopped and the exact next step).
2. Open `wiki/entities/StiOrmocLibrary.md`. Open other wiki pages only when the task needs them.
3. Check `git status`, `git branch --show-current`, and the migration tracker in `.cursor/agent-protocol.md`. Where these disagree with the wiki, trust git and the repo docs, and tell Ethan.
4. Trust what the wiki and docs already say. Do not re-scan the repo or git history for context they already give.

### Session end
- Update `hot.md` "Active Threads" with where work stopped and the exact next step, dated.
- Record durable things on `wiki/entities/StiOrmocLibrary.md`, dated: Ethan's decisions, feature state, problems and how to prevent them, open questions, commands that worked.
- Never write secrets (passwords, connection strings, tokens) or students' personal data into the wiki.

### Writing the wiki (same way as Claude Code)
Every tool writes the wiki only through the claude-obsidian core, as one reviewed transaction. Never edit wiki files directly, with Obsidian's CLI, or with a per-file lock.
1. **Read the rules first.** The plugin lives at `C:\Users\Ethan\.claude\plugins\cache\agricidaniel-claude-obsidian\claude-obsidian\3.0.1\`. Read its `AGENTS.md` ("Mutation protocol"), then `skills/save/SKILL.md`, then the transaction contract that skill links to. Also read `wiki/concepts/How this brain works.md` and the `STI ILMS REA Runbook` section "Writing this wiki" (the steps are the same for every project).
2. **Draft everything before writing.** Read each target page and note its SHA-256. Build one `claude-obsidian.transaction.v1` bundle for the whole operation: the changed pages, a new entry at the top of `wiki/log.md`, a refreshed `wiki/hot.md` (under 500 words), and `wiki/index.md` when you add a page.
3. **Run the core inside WSL (Ubuntu)**, against `--vault "/mnt/c/Users/Ethan/Ethan's Vault"`. Put the commands in a script file, because the apostrophe in the path breaks inline quoting. Run `workflow inspect <bundle>`, show Ethan the titles, paths and create/replace modes, then `workflow apply <bundle> --approved-plan-sha256 <approval_sha256 from inspect>`. Apply only after both `storage_valid` and `workflow_complete` pass. On exit code 75 (conflict), re-read the pages, rebuild and inspect again. Never bypass a failure.
4. **Report** the operation ID and the exact paths that changed.
5. **If you cannot run WSL or the core,** do not write the wiki. Put the update text (dated, with target page) in your final message.

Pages read as dated facts (`YYYY-MM-DD`), short summaries and links, not copies of repo docs, which stay the source of truth.

### Standing decisions (from Claude's private memory, which other tools cannot read)
- **No destructive commands (incident in STI ILMS REA, 2026-11-04):** a `git worktree remove --force` followed junctions and deleted `apps/api/.env`. See "Safety rules".
- **MySQL retired (Ethan, 2026-11-10):** Supabase Postgres is the only database; the MySQL migration tree and rollback path are deleted (last commit with them: `a767d88`). See `docs/mysql-removal-plan.md`.
- **PGlite for security-rule tests (Ethan, 2026-11-11):** `@electric-sql/pglite` is a pinned API devDependency, used only in tests to run one migration at a time against real Postgres. See "How to write code".
- **Lean sessions (Ethan, 2026-11-06):** one feature per session; at most 3 review agents (one combined security, correctness and React review, plus a database review for migrations or concurrent SQL); fix LOW findings directly instead of re-running reviews.

### Automation Claude Code has that you replace by hand
- **Destructive-command hook** (`.claude/hooks/guard-destructive.mjs`, wired in `.claude/settings.json`): read its `RULES` list and refuse those commands yourself. Its `ASK_RULES` list (database migration, schema, backfill and user-creation scripts, `tools/ai` smoke, migration and audit scripts, the Vercel CLI) touches the live database or production: run those only after Ethan approves that exact step. Keep command approval on.
- **Subagents** (`.claude/agents/*.md`): run each role as a separate step or prompt. Per feature, after Ethan approves the plan doc: `library-builder.md` (build, tests first, one Supabase migration per schema change), then `plan-verifier.md` (read-only check of tracking items, migrations, trackers and status), then one combined security review of `git diff main...HEAD` (plus a database review when there is a migration), fixes, then ask Ethan before push or PR.
- **Start session** (`.claude/skills/start-session/SKILL.md`, mirrored in `.agents/skills/start-session/`): follow it when Ethan says `start session`.
- **User-level skills (Ethan, 2026-11-12):** use these when the task matches; they live at `C:\Users\Ethan\.claude\skills\<name>\SKILL.md`, so read that file yourself. Project rules in this file win over their advice.
  - `supabase`, `supabase-postgres-best-practices`: Supabase and SQL work, migrations under `database/supabase/`, RLS policies and their tests, indexes, locking. Never act on `sti_ilms_rea`; ignore the skill's advice to create `.mcp.json`.
  - `vercel-react-best-practices`, `vercel-composition-patterns`: React code in `apps/web` (waterfalls, bundle size, re-renders, component APIs).
  - `differential-review`, `sharp-edges`: security pass on a diff before a PR (part of the combined review, not an extra agent); risky API or config design.
  - `property-based-testing`: fast-check tests for parsers, validators, money and date rules (fines, due dates).
  - `diagnosing-bugs`: hard bugs and slow code. `codebase-design`, `domain-modeling`: module seams, glossary and ADR wording.
  - Only when Ethan asks: `improve-codebase-architecture`, `grill-with-docs` (it writes ADR and glossary files).
- **Dev server** (`.claude/launch.json`): `npm run dev`, web on port 5173, API on 4000.
- **MCP servers** (set up at Ethan's user level, not in the repo): Supabase (read-only checks; schema changes only through reviewed migration files), Serena (code navigation), graphify (`graphify-out/` knowledge graph). If your tool lacks one, say so instead of guessing what it would return.
- **Files git does not hold** (`apps/api/.env`, `.vercel/`, runtime uploads): they exist only in Ethan's checkout. If one is missing, ask Ethan; never recreate `.env` with guessed values.

When Claude Code gains a new hook, agent, skill, MCP server or memory rule for this repo, add its manual equivalent here.
