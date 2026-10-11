# Revision Phase 1 — local implementation

| Field | Value |
| --- | --- |
| Date created | 2026-10-10 |
| Date last updated | 2026-10-11 |
| Status | `built` (local) |
| Parent plan | [Revisions implementation plan](revisions-implementation-plan.md) |

## Why

Implement the approved login, Librarian authority, school-email password recovery, and red-error changes while preserving account identities and existing workflows.

## How

- Infer the stored role from School ID/password. Public login serves Student/Faculty; `/staff` is the unlisted shared personnel login. Preserve old personnel URLs through redirects.
- Give Librarian account administration in addition to existing operations. Keep the existing technical Admin account as a protected recovery/bootstrap account; do not change or delete identities. Staff remains limited to its current desk tasks and announcement publishing.
- Add server-only, hashed password-recovery challenges. Codes expire after ten minutes, three wrong codes lock recovery for fifteen minutes, verified recovery tokens are single-use, and passwords/session versions update together.
- Reuse the configured school-email sender, with password-recovery-specific messages. No credentials are added to tracked files.
- Use accessible red error alerts with text/icons. Registration success/pending-approval information remains a status message.
- Add only reviewed, additive Supabase DDL if needed; use the repository's single-file migration runner and recheck the live ledger first.

## Implementation tracking

- [x] Read repository instructions, revision plan, schema, and existing auth/permission code.
- [x] Verify the configured database is Supabase and an active Librarian exists using aggregate queries without exposing credentials.
- [x] Implement server-resolved login and shared personnel screen.
- [x] Apply Librarian permissions consistently across routes, services, navigation, and notifications.
- [x] Implement and verify recovery codes, reset tokens, sender, and account/session revocation.
- [x] Prepare/apply the reviewed additive recovery schema and update the migration tracker.
- [x] Verify red errors and accessible authentication forms.
- [x] Run focused security/workflow tests, typechecks, builds, and local smoke checks.
- [x] Record final results and remaining operational limitations.

## Migration tracker

At start: tracked files through `016`, but live ledger through `019`. Applied reviewed `020_revision_phase1_password_recovery.sql`; next **021**. MySQL reference remains `047` unapplied / next **048**. Supabase connector project listings do not include the configured STI project, so inspect the configured database through the existing Postgres connection. Do not operate on unrelated listed projects.

## Change log

- **2026-10-10:** Started Revision Phase 1 at the owner's request. Confirmed the configured Supabase database has active Admin, Librarian, Staff, and Student accounts. Existing account IDs and data are preserved. Local implementation only; no GitHub push or deployment.

## What changed

- Public `/login` now has School ID/password, Log In, registration and Forgot Password. There is no role selector or personnel-login link. Shared `/staff` accepts Librarian, Staff and the retained technical Admin using stored roles. Old `/admin/login` redirects. Authorized users opening another workspace return to their own dashboard without discarding a valid token.
- Main Librarian has operational navigation plus Account overview, Users, User Archive, Approvals and Notifications. Account/photo reviews and deactivation enforce the same account-management permission at API/service boundaries. Notification links use the reviewer's workspace. Staff retains desk operations, announcement publishing and personal notifications.
- Password recovery includes request/code/new-password screens and server-side safeguards. Plain codes and temporary reset grants are kept out of storage/logs; only HMAC digests enter the database. Request responses are neutral for unknown/ineligible accounts and delivery failures; a failed delivery invalidates that challenge's code.
- Actual errors use red with white text and a warning icon in both themes. Registration/profile success and approval-wait messages remain statuses. Account approvals still use custom confirmations without requiring Audit reason. Deactivation retains its existing reason/history contract.

## Acceptance evidence

- `npm test`: **282 API tests + 113 frontend tests passed** (395 total), including auth, recovery, account ownership, existing operational regression tests and the recovery form.
- `npm run typecheck`: passed. `npm run build`: passed. Existing large-bundle advisory remains; it is not a build failure.
- `node apps/api/scripts/verify-revision-phase1.js`: real Supabase recovery using a disposable linked account; verifies persisted wrong-code counts across resends, 15-minute lock, current-password rejection, single-use reset, old password rejection, old JWT rejection/new JWT acceptance, Librarian account APIs, Staff denial and notification paths. It also verifies RLS/no browser grants and existing account counts. No email is sent by this gate; its fixture account/user/challenge was removed.
- Browser verification on the local Vite app: updated public form with no role/personnel link; real invalid-login response rendered red/white with icon in light/dark themes; recovery screen; `/admin/login` redirect to `/staff`. Original theme was restored.
- Supabase migration `020` applied once via the repository runner. Existing external OTP/history tables and migrations through `019` remain intact. Health includes the new recovery columns only for Postgres.
- Local server: `npm run dev:stable`; web `http://localhost:5173/login`, personnel `http://localhost:5173/staff`, API port 4000.

## Operational limits and following phases

- This is local implementation and acceptance. No GitHub push or application deployment. The local API uses the already shared Supabase database; its additive recovery schema is applied there.
- Recovery reuses the configured sender. Provider request/failed-delivery behavior is tested; no real user's password was changed or recovery email sent during this run. A real inbox trial must be initiated by the account owner through Forgot Password. Missing/invalid legacy school email requires library assistance; it is not editable here.
- Maintenance's new policy-management UI remains Revision Phase 3; Reports' real overview/navigation remains Revision Phase 8. Phase 1 establishes Librarian authority for existing operations; it does not expose the known mock Reports overview as a finished feature.
- Other revision phases remain `planned`. Invoice issuance, interactive floor-plan tooling, View Location and feedback stay archived/deferred under the owner's existing decisions.
- Supabase ledger-source reconciliation remains separate work before any whole-directory migration replay. MySQL is preserved as a historical rollback reference, not enabled for this work.

## Completion change log

- **2026-10-11:** Repaired a later credential mismatch for `ADMIN-PORTAL-001`: the owner's existing password matched its linked user but not the school-ID account record. Verified the owner-supplied password, backed up both records privately, aligned only this account's hash and invalidated prior authentication versions/recovery grants. Personnel login and JWT `/me` both returned HTTP 200. No general credential fallback or authorization change. See [repair record](admin-login-record-repair.md).

- **2026-10-10:** Completed local Revision Phase 1. Applied Supabase `020`, passed security/workflow gates and builds, verified browser states and started the local web/API. Preserved existing identities, data and unrelated uncommitted work. Next Postgres `021`, MySQL reference next `048`.
- **2026-10-11:** Owner explicitly authorized resetting `ADMIN-PORTAL-001` after its displayed password failed verification. Updated only that account and its linked operational user's bcrypt password/authentication versions, invalidated outstanding recovery grants, and preserved other accounts. Restarted the local API after existing failed attempts reached its in-memory login limit. Verified personnel login through the Vite proxy returns Admin with `/admin/dashboard`, the new session is accepted, and the prior authentication version is rejected. The temporary password was provided to the owner and is not stored in repository files. This updates the configured shared Supabase account; no schema migration, GitHub push or application deployment occurred. Current Postgres next number is `022`; MySQL next remains `048`.
