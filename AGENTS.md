# Repository Instructions

## First stop for AI agents

1. Read the **AI agents — read this first** section at the top of [README.MD](README.MD) when present, otherwise continue below.
2. Follow [`.cursor/agent-protocol.md`](.cursor/agent-protocol.md) for session start, plan status values, and the MySQL migration tracker.
3. When Ethan says **`start session`**, run that Start session protocol before building.

## Before making design, implementation, or database decisions

1. Read [docs/source-of-truth.md](docs/source-of-truth.md) and consult its preserved Final Draft and Administrative System Flow PDFs for the relevant feature.
2. Read and follow [agent.md](agent.md).
3. Check the currently implemented schema contract in [docs/schema-context.md](docs/schema-context.md).
4. For hosted database work, also read [docs/supabase-migration-plan.md](docs/supabase-migration-plan.md).

The PDFs define the target product. The schema context describes the current database implementation. When they differ, plan a backward-safe migration instead of silently changing table meanings. The MySQL tree remains the rollback reference while the API dual-drives MySQL and Supabase Postgres.
