---
name: plan-and-build
description: Use when planning, building or porting any feature or behavior fix in StiOrmocLibrary, including porting an approved STI ILMS REA spec, writing or updating a docs/*-plan.md, or when Ethan says "plan <feature>", "build <feature>", "port <spec>" or "next feature". Applies to every AI tool working in this repo.
---

# Plan and build a feature

How Ethan's projects plan and build, the same way STI ILMS REA does: **approved requirement → plan doc → Ethan approves → build tests first → verify → review → fix → ask before anything leaves the laptop.** One feature per session.

The repo rules in `CLAUDE.md`, `AGENTS.md`, `agent.md` and `.cursor/agent-protocol.md` still apply. This skill puts them in order; when they disagree with it, they win and you tell Ethan.

## Rules (no exceptions)

1. **No build without an approved plan doc.** Approval is Ethan saying so in chat (or JohnBazty's PR approval for printing, attendance QR and floor-plan work). "It's small", "it's obvious" or "the spec is already approved" are not approval of the plan.
2. **One feature per session, one branch per change** from an up-to-date `origin/main`: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`. Never commit to `main`.
3. **Tests first** for every rule in the plan: see the test fail, then write the smallest code that passes.
4. **Ask before every outward step,** each one separately: push, open or merge a PR, apply a migration to the live database (`npm run db:supabase`), run `tools/ai/*` scripts, deploy (`vercel`), delete anything. One yes covers one step.
5. **Never run destructive file commands** (`git worktree`, `git clean`, `git stash -u`, `git reset --hard`, `git checkout -- .`, `rm -r`, `Remove-Item -Recurse`, junctions). Never print or copy any `.env`.
6. **Never touch the `sti_ilms_rea` schema** or the role `sti_ilms_rea_app`. This repo owns `public` only.
7. **Only requirements cross over.** From STI ILMS REA, Koha or any reference repo, carry over the behavior (rules, fields, statuses, edge cases), never the code, SQL or text. Build it in this repo's own patterns.
8. **Never claim a check you did not run.** Quote the result lines. Say plainly what failed or was skipped.

## Steps

### 1. Start
- Read `wiki/hot.md` "Active Threads" and `wiki/entities/StiOrmocLibrary.md` (no wiki on this machine: `docs/johnbazty-handoff.md` if present). Trust them; do not re-read what they summarise.
- `git status --short` must be clean of tracked changes, or stop and ask. `git fetch`, then branch from `origin/main`.
- Check existing work: `git branch -a`, `git log --all --oneline -i --grep=<feature>`, `docs/*-plan.md` for the feature, `docs/FEATURES.md` if it exists. Already built or in progress: ask Ethan whether to extend, redo or skip.
- Large area (e.g. "circulation", "fines"): propose a split into sub-features and build one.

### 2. Find the requirement
Read the sources in this order. Higher ones win on scope; flag conflicts, never resolve them silently.

| Source | What it decides |
|---|---|
| `docs/source-of-truth.md` and its Final Draft PDFs (`pdftotext -layout docs/source/Final-Draft.pdf - \| grep -i <topic>`) | What the product must do |
| `C:\Users\Ethan\STI ILMS REA\docs\spec-decisions.md` | Ethan's answers; they win over a spec's own recommendations |
| `C:\Users\Ethan\STI ILMS REA\docs\specs\<slug>.md` (Status `approved`) | The detailed rules R1.., edge cases, acceptance criteria |
| `docs/schema-context.md`, `agent.md` | What exists today and how code must look |

No REA checkout on this machine, or the spec is not `approved`: stop and ask Ethan. Feature needs a map and spec from GitHub repos or a shipped app first: use the `reverse-feature` skill, then come back here.

**Translating an REA spec to this repo:**
- "Librarian" = Admin; "staff" = Library Staff (`library_staff`). Permissions are fixed per role; there is no per-account granting.
- REA-only details do not apply: job keys, advisory lock numbers, `auth_events`, memory/Postgres store pairs, PGlite, the `sti_ilms_rea` schema. Use this repo's equivalents or plan one.
- A value marked **[Librarian]** becomes a setting with the decided default, never a hard-coded number.
- Times stored UTC; calendar logic in Asia/Manila.

### 3. Gap check
Read the modules, routes, screens and tables the feature touches. For every spec rule write one line: **exists** (file:line), **partial** (what is missing) or **missing**. Plan only the gaps. Never change what a table or column means; plan a backward-safe migration instead.

### 4. Write the plan doc
`docs/<slug>-plan.md` in the `.cursor/agent-protocol.md` shape, Status `planned`:

1. Title. 2. Why (the requirement and its source). 3. Date created. 4. Date last updated. 5. Status. 6. How: data model, migration `NNN_<slug>.sql` with the next number from the tracker, API routes with roles, screens, flow, the rules it follows. 7. Implementation tracking: one checkbox per item, each naming the spec rules (R1, R2...) and the test that proves it. 8. Change log. Then **Open questions**, each with your recommended answer and why.

### 5. Approval gate (stop here)
- Explain the plan to Ethan in plain language: what it adds, what it leaves out, the migration, the risks.
- Ask the open questions **one at a time, recommendation first** (Claude Code: `AskUserQuestion`, up to 4 per round). Never offer "approve all recommendations"; Ethan answers each himself.
- Record every answer and the approval date in the change log; bump Date last updated.
- Printing, attendance QR and floor-plan work: commit, ask Ethan before pushing, then open a draft PR with `--reviewer JohnBazty` and wait for `APPROVED`.

### 6. Build
- Claude Code: spawn `library-builder` with the plan path and "plan approved by Ethan on <date>". Other tools: follow `.claude/agents/library-builder.md` yourself.
- It sets Status `inprogress`, builds one tracking item at a time, tests first, one hand-written `database/supabase/NNN_*.sql` per schema change, updates the migration tracker, `README.MD`, `database/supabase/README.md` and `docs/schema-context.md`, and commits by explicit path with `git commit -F <file>`.

### 7. Verify and review (at most three agents, one message)
- `plan-verifier`: every tracking item has a test, migrations and trackers agree; it runs `npm test`, `npm run typecheck`, `npm run build`, `npm run coverage`. Nobody else re-runs them.
- `security-reviewer` on `git diff origin/main...HEAD`: the one combined review (security first: sign-in, roles, input, SQL, files, money; then correctness and React). No separate `code-reviewer`.
- `database-reviewer` only when there is a migration or concurrent SQL.
- Other tools: run each agent file in `.claude/agents/` (or the user-level ones) as its own step.

### 8. Fix
- Send every CRITICAL, HIGH and MEDIUM finding and every verifier gap to the **same** builder in one fix pass (Claude Code: `SendMessage`, never a new builder).
- Re-run only the reviewer whose finding was fixed, on the fix commits.
- Fix LOW findings yourself, with a test where behavior changes. Leftover LOW items go in the PR body.
- UI change: run `npm run dev`, open http://localhost:5173, check the screen. STI colors only (`agent.md` "Frontend Visual Rules"), never color alone for meaning.

### 9. Finish
- Status becomes `built` only when `plan-verifier` says READY and tests, typecheck and build pass. Tick the tracking items, add a change-log row.
- `docs/FEATURES.md` exists: add or update the feature's row.
- Report to Ethan: branch, commits, files, migration number, test results, open items. Then ask, one step at a time: push? open PR? apply the migration to Supabase? Never merge or deploy unasked.
- After merge: save the wiki once (`save` skill, or the claude-obsidian core in WSL per `AGENTS.md`), and update `hot.md` "Active Threads" with the exact next step.

## Red flags: stop and go back a step

| Thought | Reality |
|---|---|
| "The REA spec is approved, so I can just build" | The plan doc for this repo needs its own approval. |
| "I'll answer the open questions with the recommendations" | Ethan answers each one. Ask. |
| "The REA code already works, I'll port it" | Only behavior crosses. Different stack, different patterns. |
| "Small fix, no plan doc needed" | A behavior change gets a plan doc, even a short one. |
| "Tests can come after" | Then you never saw them fail. Delete the code, write the test. |
| "I'll push so JohnBazty can see it" | Pushing is an outward step. Ask Ethan first. |
| "The migration is safe, I'll apply it" | Live database. Ask Ethan first. |
| "Spawn a code-reviewer too, to be safe" | Lean rule: at most three agents per feature. |
