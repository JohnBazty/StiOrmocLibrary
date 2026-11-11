# Repair the combined Librarian/Admin role

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` |

## Why

Resolve QA defect P1-01: retained account 5 / user 5 / `ADMIN-PORTAL-001` has account role Admin but linked operational role Librarian (role ID 2), so School ID login selects restricted Admin authority. The owner requested fixing the QA errors; their prior decision specifies this login as the combined Librarian/Admin account.

## How

Use a deliberately scoped maintenance operation after verifying the original consolidation history and archived source identity. Lock both accounts and linked users, snapshot affected rows privately before updates, restore only the retained account's canonical Librarian authority, revoke its older authentication/recovery grants and append a repair event. Preserve passwords, names, emails, identities and historical operators. Repeated execution must be a verified no-op. Add a live QA preflight that rejects inconsistent account/profile roles before creating fixtures.

Read-only inspection found no non-system triggers on accounts/users and no current startup role rewrite in the inspected runtime. The historical upstream Admin consolidation SQL remains under `database/upstream-main/` as a non-executable reference; this does not establish that it caused the drift. The precise external writer is unknown. Do not invent a cause or change global role semantics.

No product DDL migration is needed. Postgres 026 / next 027 and MySQL reference 048 / next 049 remain unchanged.

## Implementation tracking

- [x] Confirm retained identity, linked roles, archived source and consolidation history.
- [x] Implement guarded repair, snapshot and retry behavior.
- [x] Test preservation, unexpected-state rejection and backup failure.
- [x] Apply and verify full workspace APIs, old-token rejection and Staff boundaries.
- [x] Add QA preflight and update the QA findings.

## Results

- Applied `apps/api/scripts/repair-merged-admin-role.ts --apply`. Default execution previews the specifically approved identities; it cannot modify an unrelated account. The service is not mounted as an HTTP route.
- Private transaction snapshot: `phase1_role_repair_20261016_801ab152`. Browser roles have no schema/table privileges. Stored password hashes, names, emails, School IDs, linked identities and archived status match the snapshot. No password was requested or changed.
- Retained account 5 and user 5 now both use Librarian authority; operational role ID remains 2. Source account 47/user 35 remain Archived. Original operator references and the two loans processed by user 35 remain intact. Appended `RoleReconciled` management history.
- Incremented retained account/user authentication versions and expired outstanding recovery codes/reset grants. Tokens issued before this repair return 401. The owner must sign in again at `/staff` with the existing password.
- Real stored-role API checks passed for identity, library/account dashboards, Users, notifications, clearance, workspace tasks, Reports and collection review. The actual Maintenance data endpoint `/api/v1/admin/maintenance/options` returns 200. Staff remains denied Users/Reports and the archived login remains denied authentication. The namespace root `/api/v1/admin/maintenance` has no GET handler, so a root 404 is expected after passing authorization; it is not a Maintenance failure.
- Seven focused repair/consolidation tests passed, including retry, credential/history preservation, missing-history rejection, unexpected linked role and failed-snapshot rollback. All **65 authentication/user API regression tests passed**. API TypeScript check passed.
- Full real Postgres Phase 1 recovery/personnel-login/permissions gate passed, including its new preflight for active account/profile role consistency. It captures codes instead of sending mail and removes its disposable fixtures. Repeat repair returned `changed: false` with no new snapshot or changes.
- Evidence logs: `output/phase1-role-repair-tests.log`, `output/phase1-role-repair-regression.log`, `output/phase1-role-repair-typecheck.log`, `output/phase1-role-repair-live.log`, `output/phase1-role-repair-extra-checks.log`, `output/phase1-role-repair-integration.log`. No browser/password-based sign-in of the real account was performed.

## Change log

- 2026-10-16: Owner requested fixes after Phase 1 QA. Confirmed the role mismatch; no password changes or broad role promotion are required.
- 2026-10-16: Completed guarded repair after private snapshot; verified stored roles, preserved data, authentication revocation, retry safety and live workspace access. P1-01 is resolved. No migration, push or deployment.
