# Repository Instructions

## First stop for AI agents

1. Read the **AI agents — read this first** section at the top of [README.MD](README.MD) when present, otherwise continue below.
2. Follow [`.cursor/agent-protocol.md`](.cursor/agent-protocol.md) for session start, plan status values, and the MySQL migration tracker.
3. When Ethan says **`start session`**, run that Start session protocol before building.

## Owner-installed skills

Caveman is installed for this repository at `.agents/skills/caveman/SKILL.md`. Use its concise reply style by default at the owner's request, until they ask for normal mode. Preserve clear nontechnical explanations, required progress updates, verification results and material limitations. Full explanations, plans and other saved documents retain the detail their task needs. This is a reply-style skill, not a token cap or permission to skip work.

The owner's Claude skill collection is adapted for Codex under `C:/Users/JOHN/.codex/skills/claude-*`. Select and read the relevant skill when it improves the task: UI/UX and baseline UI for interface work; systematic debugging and webapp testing for defects and QA; React/coding standards for implementation; database/SQL/API security for relevant backend work. Do not load all skills for every request. Follow each Codex entrypoint's compatibility notes and this repository's requirements. Missing source helper files are not installed capabilities. See [installation and limits](docs/codex-local-skills-20261016.md).

## Before making design, implementation, or database decisions

Design every feature for a person with no technical background. Follow the owner's plain-language and reduced-workflow requirement in `agent.md`, including automatic recognition and clear review before saving.

1. Read [docs/source-of-truth.md](docs/source-of-truth.md) and consult its preserved Final Draft and Administrative System Flow PDFs for the relevant feature.
2. Read and follow [agent.md](agent.md).
3. Check the currently implemented schema contract in [docs/schema-context.md](docs/schema-context.md).
4. For hosted database work, also read [docs/supabase-migration-plan.md](docs/supabase-migration-plan.md).

The PDFs define the target product. The schema context describes the current database implementation. When they differ, plan a backward-safe migration instead of silently changing table meanings. The MySQL tree remains the rollback reference while the API dual-drives MySQL and Supabase Postgres.
