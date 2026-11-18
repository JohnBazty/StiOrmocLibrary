# Main branch integration

- Date: 2026-10-11
- Status: built
- Why: bring `codex/library-revision-updates` up to date with `main` while preserving the current revision phases.
- Tracking: integrate `origin/main` at `befe9e5` into revision commit `94db0a1`.
- Recovery: `refs/codex/backups/before-main-integration-20261011` preserves the pre-merge commit; the earlier local-work stash also remains available.

## Implementation

Resolve overlapping login, authorization, circulation, responsive UI, and documentation changes. Preserve the current five-role permission model, email verification, account approvals, public catalog, and Phase 4/5 attendance and desk workflows. Integrate versioned borrowing policies and session invalidation from main.

- Added the Librarian borrowing-policies page and protected API, with configured limits flowing through the catalog, carts, reservations, history, and dashboards.
- Kept Phase 5 checkout gates and in-library assignment/return workflows. Added the upstream read-only take-home preflight and actor-bound confirmation support to the compatible circulation endpoints.
- Successful sign-in now invalidates prior JWT/cookie sessions. Cookie sign-in reads the user version separately from the linked account version.
- Kept current responsive screens, auth popups, role landing pages, provisioning, and phase plans. Restored Librarian authorization in clearance/fine services and floor-plan links where main's older consolidation conflicted.

Historical migration sources remain references. Do not replay either branch's migration directory or apply SQL as part of this Git merge. The applied revision sources through Postgres 024 and the MySQL reference through 048 keep their identities.

## Verification

- API isolated tests: **332 passed**, including session invalidation, divergent linked authentication versions, policy permissions, preflight, and current revision workflows. Tests use the MySQL fixture environment and do not create live database fixtures.
- Web tests: **149 passed across 54 files**.
- Type checking and production build: passed. The build retains the existing bundle-size advisory.
- Connected database: read-only schema readiness passed; policy list and active policy resolution succeeded. No migrations, data resets, or fixture writes were performed.
- All 49 Git conflict entries resolved. A normal merge commit preserves both parents; verify main ancestry and matching remote after publication.

## Changelog

- 2026-10-11: saved recovery reference and began resolving the merge.
- 2026-10-11: reconciled main features with current revision phases, archived competing SQL references, and completed the verification above.

## PostgreSQL-only follow-up, 2026-11-11

The revision merge landed in main at d0321a0. This follow-up removes the remaining retired SQL syntax from the API and asset-code backfill, and reconciles migration history before further schema work.

- Read public.schema_migrations in a read-only transaction. Verified 35 of 36 applied files byte-for-byte against live SHA-256 checksums, including the 001, 011, 013, 014 and 016 entries. Restored matching originals from Git history and the local release source for 030. Git preserves their original line endings.
- The ledger records 030_october17_maintenance.sql, 031_semester_enrollment.sql and 032_login_devices.sql under those names. The unapplied 028 enrollment draft was superseded by 031. Both previous branding filenames were absent from the ledger and had identical SQL. Keep one pending 033_rename_system_brand.sql. Reserve 034 for the next change.
- Removed database/upstream-main/. Applied advisor, preflight and borrowing-policy sources are now in database/supabase/. The old 013 consolidation file had no entry under that filename. Its source remains in Git history.
- The available 003_readiness_gapfill.sql source still differs from the live checksum. Its tables and the columns it adds exist in the live schema. Keep the historical file as-is and recover the exact applied source before replay. Any confirmed schema difference needs a new migration.

### Job runner decision for PR review

The live database contains library_job_runs from 013 and scheduled_job_state plus scheduled_job_runs from 019. The active revision runner uses 013 and includes semester closure, attendance checkout, in-library follow-up, reservation preparation, email delivery and collection review. The 019 implementation has per-job leases, run history and an overdue progress cursor. Both cover reservation expiry, overdue scanning and notification generation.

Proposal for the team: use the 019 lease and history tables as the eventual shared backend and port every active revision job to it before switching. Review how the worker and scheduler entry points will share a lease. Keep the job runner and its live tables as they are until that decision is approved.

### Changelog

- 2026-11-11: verified the live ledger, restored matching applied files, cleaned up the PostgreSQL queries and prepared the follow-up review.
