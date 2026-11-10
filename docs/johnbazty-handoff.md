# Handoff: printing, attendance QR and floor-plan improvements

- **For:** JohnBazty (repo owner) and any AI agent working for him (Claude Code, Codex, Cursor).
- **From:** Ethan, 2026-11-10.
- **Date last updated:** 2026-11-10

Start here. Everything your agent needs is in this repo; it does **not** need Ethan's Obsidian wiki or his private Claude memory. Where `AGENTS.md`, `CLAUDE.md` or a skill says "start from the wiki", use this file, [docs/FEATURES.md](FEATURES.md) and [docs/reference-features-roadmap.md](reference-features-roadmap.md) instead.

## The task

Improve and finish the library's **printing** (queue, ink and paper stock, printing service), **attendance QR** and **floor plan**, using how well-starred open-source GitHub projects solve the same problems, without copying their code. Each feature goes through the `reverse-feature` pipeline below, and **you approve every step** on its pull request.

The list of features, with what the Final Draft requires and what is optional, is in [reference-features-roadmap.md](reference-features-roadmap.md).

## Read in this order

1. This file.
2. [AGENTS.md](../AGENTS.md) "Safety rules" and "Standing decisions"; [CLAUDE.md](../CLAUDE.md) "Working rules".
3. [docs/source-of-truth.md](source-of-truth.md): the Final Draft PDFs decide scope. The reference repos only show how others solve it.
4. The `reverse-feature` skill: [.claude/skills/reverse-feature/SKILL.md](../.claude/skills/reverse-feature/SKILL.md) (Codex and others: `.agents/skills/reverse-feature/SKILL.md`).
5. Only for the feature at hand: its map in `docs/maps/`, its spec in `docs/specs/`, its plan in `docs/*-plan.md`.

## The process for every feature

```text
1 check existing work   → docs/FEATURES.md, git branches
2 Final Draft excerpt   → pdftotext -layout docs/source/Final-Draft.pdf - | grep -i <topic>
3 pick ≤5 GitHub repos  → gh search repos "<terms>" --sort stars
4 map                   → feature-cartographer  → docs/maps/<feature>.md
5 spec                  → spec-extractor        → docs/specs/<feature>.md
   ── push feat/<feature>, draft PR, JohnBazty reviews ── GATE 1
6 build plan            → docs/<feature>-plan.md (agent-protocol shape)
   ── push to the same PR, JohnBazty reviews ──────────── GATE 2
7 build (tests first)   → library-builder
8 verify and review     → plan-verifier + security-reviewer (+ database-reviewer when there is a migration)
   ── fixes pushed, JohnBazty reviews, marks ready ───── GATE 3
9 log                   → docs/FEATURES.md row, update "Where work stands" below
```

**Gates:** the agent stops after pushing and opening or updating the draft PR. It continues only when `gh pr view <n> --json reviewDecision,reviews` shows `APPROVED`, or you approve in a PR comment. If you request changes, it applies them first and records your answers in the doc's change log. It never merges. When you drive the agent yourself, you can also approve in chat; say so explicitly ("spec approved").

**Clean-room:** describe what reference projects do, never copy their code, text or assets, whatever the license. Read them with `gh api repos/<owner>/<repo>/contents/<path>`; never clone them into this repo or run them.

## Agents and skills in this repo

| Name | Kind | Job |
| --- | --- | --- |
| `reverse-feature` | skill | Runs the whole pipeline above |
| `start-session` | skill | Session briefing (written for Ethan's wiki; without it, read this file instead) |
| `feature-cartographer` | agent | Writes the map (GitHub repos via `gh`, Final Draft, this repo) |
| `spec-extractor` | agent | Writes the clean-room spec from the map |
| `library-builder` | agent | Builds an approved plan, tests first, one Supabase migration per schema change |
| `plan-verifier` | agent | Read-only check of tracking items, tests, migrations, trackers |
| `security-reviewer` | agent | One combined security, correctness and React review per PR |
| `database-reviewer` | agent | Only when a PR adds a migration or concurrent SQL |
| `ui-ux-pro-max`, `design-system`, `ui-styling` | skills | Screen design; STI colors only (`agent.md`) |

Codex, Cursor and other tools have no subagents: run each agent file as its own step or prompt (`AGENTS.md` "Automation Claude Code has that you replace by hand").

## What your machine needs

- **GitHub CLI** signed in (`gh auth status`) with push access, for searching reference repos and opening PRs.
- **pdftotext** (Poppler) to read the Final Draft PDFs. Or open the PDFs in `docs/source/` by hand.
- **Node.js** and `npm install` at the repo root; `npm test`, `npm run typecheck`, `npm run build`, `npm run coverage`.
- `apps/api/.env` with your own Supabase `DATABASE_URL` for running the app. Tests do not need it. Never commit it.
- Not needed: Ethan's REA MCP server and `reverse-engineer-anything` skill. They map shipped apps (APKs, desktop apps). All current sources are open-source GitHub repos.

## Rules that matter most

- One branch per feature from the branch it builds on (`feat/<slug>`). Never commit to `main`.
- Never run commands that can delete untracked files (`git clean`, `git worktree`, `git stash -u`, `git reset --hard`, `rm -r`). `.claude/hooks/guard-destructive.mjs` blocks them in Claude Code.
- Never apply a migration to the live Supabase database, deploy to Vercel, or run `tools/ai/smoke-*` without the owner's go-ahead for that exact step.
- Supabase Postgres only. Migrations live in `database/supabase/`; the next number is in `.cursor/agent-protocol.md` (currently `017`).
- Server enforces roles and validates input; parameterized SQL; transactions for multi-record changes.

## Where work stands (update this at the end of every session)

| Item | State |
| --- | --- |
| MySQL removal stack, PRs #5 → #6 → #7 → #8 | Open, not merged. Everything below is stacked on #8 and needs it merged first. |
| `chore/reverse-feature-process` | Pipeline, agents, this handoff, roadmap. Draft PR to JohnBazty, waiting for review. |
| `feat/dynamic-attendance-qr` | Map and draft spec done (`docs/maps/`, `docs/specs/dynamic-attendance-qr.md`). **GATE 1:** waiting for JohnBazty to approve the spec and answer its 5 open questions. |
| `feat/printer-supply-availability` | Map and draft spec done (`docs/maps/printer-supply-availability.md`, `docs/specs/printer-supply-availability.md`). **GATE 1:** waiting for JohnBazty to approve the spec and answer its 6 open questions. |
| Other roadmap features | Not started. |

**Next step:** JohnBazty reviews the `feat/dynamic-attendance-qr` draft PR. After approval, write `docs/dynamic-attendance-qr-plan.md` from the approved spec (GATE 2).

## Change log

- 2026-11-10: Created by Ethan's Claude Code session for the handoff to JohnBazty.
