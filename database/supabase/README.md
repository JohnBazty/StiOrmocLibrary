-- ============================================================================
-- STI College Ormoc Integrated Library Management System — Supabase / Postgres schema drafts
-- ============================================================================
-- Status: Postgres is the only schema. 001-002 were converted from the retired MySQL tree,
--         plus curated MAIN product gap-fill for migrations 033–040.
-- Apply a reviewed file with: npm run db:supabase -w @sti-library/api -- 009_inventory_audit_orphan_history.sql
-- Requires DATABASE_URL=postgresql://… in apps/api/.env
--
-- Files:
--   001_from_baseline.sql                 — converted mysql56-schema
--   002_from_migrations.sql               — draft from MySQL migrations (partial)
--   003_readiness_gapfill.sql             — curated gap-fill
--   004_inventory_audit_action_reason.sql — readiness column
--   005_main_product_gapfill.sql          — MAIN 033–040 (profile, soft-delete,
--                                           floor plans, shelf grid, attendance QR,
--                                           printing receipts)
--   006_print_request_timestamps.sql      — print_requests started_at/ready_at/etc.
--   007_security_invoker_views.sql        — borrow_records / book_titles SECURITY INVOKER
--   008_cutover_schema_gaps.sql            — missing category description and asset-code history ledger
--   009_inventory_audit_orphan_history.sql  — nullable copy link for Deleted audit snapshots
--   010_phase3_archive_floor_image.sql      — archive actor and published floor image history
--   011_phase2_user_management.sql          — account auth versions and Admin management audit
--   012_phase2_book_quotations.sql           — private quotation history and lost charge resolution (applied)
--   013_phase2_job_runner.sql                — durable scheduled-run lease and metrics (applied)
--   014_phase2_invoices.sql                  — separate gated invoice ledger (applied)
--   015_phase6_registration_roles.sql        — pending verified accounts, Staff role, and avatar reviews (applied)
--   016_phase6_legacy_student_account_links.sql — backfill missing Student/Faculty login links (applied)
--   020_revision_phase1_password_recovery.sql — server-only hashed recovery challenges (applied)
--   021_revision_phase3_catalog.sql           — private import review, richer catalog, managed foundations and digital PDF metadata/bucket (applied)
--   022_revision_phase4_attendance.sql        — attendance policy, events, scan receipts and checkout provenance (applied)
--   023_revision_phase5_desk_circulation.sql   — in-library use and deduplicated desk confirmations (applied)
--   024_revision_phase5_reading_materials.sql  — native physical thesis links for in-library use (applied)
-- Latest applied migration: 036_sign_in_hardening.sql (on PR #19's branch).
-- 034_job_runner_hardening.sql (job table RLS in the repo, open-loan cursor index) was applied 2026-11-11.
-- 033_rename_system_brand.sql is pending review. 035 is reserved by PR #20, not applied.
-- 037_book_register.sql (register columns, per-copy cost) was applied 2026-11-13 from feat/book-register, for Ethan's test.
-- Next unused number: 038.
-- 031_semester_enrollment.sql supersedes the removed, unapplied 028 draft.
-- Preserve the original bytes of applied files. The 003 source still needs checksum reconciliation.
-- See docs/main-branch-integration.md for the live ledger audit.
-- Apply reviewed files individually; do not renumber previously applied files.
--
-- The MySQL tree (database/mysql56-schema.sql, database/migrations/) was removed
-- on 2026-11-10. Last commit that has it: a767d8825d645658bbec38e31e194471ede46b5f.
-- Restore one file: git show a767d88:database/migrations/<file> > <file>
--
-- Connection note: free-tier direct db.* host is often IPv6-only. Use Session
-- pooler (port 5432) with user postgres.<project-ref> when on IPv4 networks.
--

-- Revision Phase 4: 022_revision_phase4_attendance.sql applied after owner choices 1A/2A/3A.
-- Printing-only visits exclude seats; Librarian configures each event; entry/automatic
-- checkout cutoff is 6:55 PM before 7 PM closing.
-- Revision Phase 5: 023/024 applied; separate in-library ledger retains physical
-- assignments after attendance checkout. These were the latest product files at the time.


## Main integration — 2026-10-11

The main branch was reconciled with the current revision permission model and phase workflows. Borrowing policy management uses the Librarian workspace; prior login sessions are invalidated when a new login succeeds. The former reference directory is preserved in Git history. Checksum-matched applied sources now live in this directory. See `docs/main-branch-integration.md`.
