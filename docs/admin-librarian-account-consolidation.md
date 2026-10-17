# Consolidate the Admin and Librarian logins

## Why

The owner wants one combined Librarian/Admin account and explicitly selected `ADMIN-PORTAL-001` as the retained login. The previously separate temporary `LIB-TEST-001` login is retired. Preserve credentials, account/user identities, provenance and operational history.

| Field | Value |
| --- | --- |
| Date created | 2026-10-12 |
| Date last updated | 2026-10-16 |
| Status | `built` |

## How

- Keep account 5 / user 5 / School ID `ADMIN-PORTAL-001` and its existing password/profile.
- Set its account role and operational user role to the canonical `Librarian` role, which already has both library and account administration. Set its `roles` relationship to Librarian. This gives it the complete existing `/librarian` workspace through `/staff`.
- Archive the separate temporary account 47 / user 35 / `LIB-TEST-001`, disabling that login while retaining its IDs and all prior actor references. It has no open loans, requests, in-library assignments or attendance visits; two processed loans retain their real historical operator.
- Revoke earlier sessions through both linked authentication versions and expire outstanding recovery grants. Do not change either password hash or transplant the temporary profile.
- Snapshot affected rows into a private database schema before changing them. Perform guarded updates and paired management-history entries in one transaction. Repeat execution is a no-op after a completed consolidation. Reject unexpected identities/statuses, missing links and outstanding obligations.
- Keep historical Admin role/schema compatibility; do not grant all legacy Admin tokens Librarian access. No additional API endpoint or public account-merge form.

Supabase product migration 026 remains latest; next unused 027. MySQL reference 048 / next 049 unchanged. This is a targeted account data operation, not a table migration. No GitHub push or deployment is requested.

## Implementation tracking

- [x] Owner selected the retained login.
- [x] Inspect identity links, credential consistency, roles and open activity.
- [x] Implement guarded consolidation, private snapshot and rollback-on-error.
- [x] Verify preservation, session revocation, retry and permission behavior with tests.
- [x] Apply the approved consolidation and verify live access and archived login rejection.
- [x] Record results and update the current role/account documentation.

## Acceptance evidence

**2026-10-16 follow-up:** QA discovered that the retained account role had reverted to Admin while its operational profile stayed Librarian. The owner requested repair; the scoped transactional repair restored Librarian authority, preserved credentials/history and revoked earlier sessions. The exact writer of the drift remains unknown. Current account access and retry checks pass; see [repair evidence](revision-phase1-role-repair-20261016.md).

- Applied the explicitly scoped operation to the configured Supabase database. Private snapshot schema: `admin_librarian_merge_20261012_b57c1e10`. Browser roles have no snapshot schema/table privileges. No product table was added or removed; migration counters are unchanged.
- Database checks confirm one active Librarian and zero active Admin accounts. Retained account/user 5 are Active/Librarian, with canonical role ID 2; retired account 47/user 35 are Archived. Stored password hashes and profile identity fields match the private snapshot. Two loans processed by user 35 still refer to user 35.
- Running API checks through the Vite proxy confirm the retained identity can access `/auth/me`, both administration dashboards, active users, notifications, clearance, workspace tasks, Reports and collection review. The retired identity is visible in User Archive. Previous sessions and fresh tokens for the archived account return 401. Staff still receives 403 for Users and Reports.
- Five consolidation tests cover preservation, repeat execution, open activity, failed backup rollback and invalid identities. Full suite: **349 API + 157 web tests passed (506 total)**. Typecheck and production build passed; the existing bundle-size advisory remains.
- Repeated the live operation after completion: `changed: false`, with no new snapshot or account changes.
- Password-based sign-in was not performed during this operation: no password was requested, retrieved or changed. The owner continues using their existing password at `/staff`; earlier sessions must sign in again.
- Updated the sidebar role label to **Librarian / Admin** and documented the owner's amendment in the README, role instructions, current schema contract and revision plan. Earlier phase statuses and their outstanding human acceptance remain unchanged.

## Change log

- 2026-10-12: Owner requested account consolidation and selected `ADMIN-PORTAL-001`. Read-only inspection found one active Admin and one active temporary Librarian. Existing passwords are aligned; no open activity blocks retiring the temporary login. Work preserves historical operator/account references.
- 2026-10-12: Completed the consolidation and live access checks, preserved credentials/history, revoked prior sessions, verified retry safety and passed the full tests/build. No GitHub push or application deployment was performed.
