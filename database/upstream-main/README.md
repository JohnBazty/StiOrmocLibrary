# Upstream main migration references

Imported on 2026-10-11 from `origin/main` (`befe9e5`). These files preserve main's original migration identities as reference material. They are not a migration queue.

Main's numbering overlaps already applied Phase 2 and revision sources. In particular, its role consolidation would remove the current Librarian/Staff permission boundaries. Do not run this directory or replay it against the existing database. Reconcile an individual source against the live migration ledger and current schema before any future migration work.

The current revision remains applied through Postgres 024 (next 025). The MySQL rollback reference remains through 048 (next 049). No SQL was executed during the Git integration. See `docs/main-branch-integration.md`.
