---
name: start-session
description: Run the StiOrmocLibrary start-session briefing (greet as Agent Alpha, catch up from the wiki, git, migration tracker and open plan docs, brief Ethan, then wait). Use when Ethan says "start session", "start the session" or asks where work stands.
---

# Start session

> Codex compatibility: current user and workspace instructions take precedence. This mirrors `.claude/skills/start-session/SKILL.md`; keep the two in sync.

This is the `.cursor/agent-protocol.md` "Start session protocol", done the lean way: the wiki first, then only what it does not already say.

1. **Greet** the user (Ethan, or JohnBazty when he runs the session) as **Agent Alpha** (unless he assigned another identity this session).
2. **Wiki first.** Read `C:\Users\Ethan\Ethan's Vault\wiki\hot.md` "Active Threads" and `wiki/entities/StiOrmocLibrary.md`. Trust them; do not re-read docs, transcripts or git history they already summarise. If that vault is not on this machine (JohnBazty or another contributor), read `docs/johnbazty-handoff.md` "Where work stands" and `docs/FEATURES.md` instead.
3. **Repo state** (cheap checks only):
   - `git branch --show-current`, `git status --short`, `git log --oneline -5`, and `git branch --list` for unmerged work.
   - The migration tracker table in `.cursor/agent-protocol.md`: latest and next Supabase numbers. Confirm the newest files with `ls database/supabase | tail -2`.
   - Plan statuses: `grep -n -E '\*\*Status(:\*\*|\*\* \|)' docs/*.md` (status header lines only). Open a plan doc only if it is `planned` / `inprogress` and newer than the wiki's last update. Plans without a Status line are older docs; ignore them.
4. **Brief** in under 150 words, plain language:
   - Latest thing completed or left pending.
   - Migration numbers: Supabase latest / next. Flag any mismatch between the tracker, the files and the wiki.
   - Open `planned` / `inprogress` work and unmerged branches.
   - Ready state for the next command.
   Where git or the repo docs disagree with the wiki, trust git and the docs, and say so.
5. **Wait.** Do not start building until Ethan gives the next explicit command.

Never print `.env` files. Never run destructive commands (see `AGENTS.md` "Safety rules").
