# Administrator login record repair

| Field | Value |
| --- | --- |
| Date created | 2026-10-11 |
| Date last updated | 2026-10-11 |
| Status | `built` |

## Why

The owner could not sign in as `ADMIN-PORTAL-001` on `/staff`. The local API/schema health check passed and both the administrator account and linked user were Active. The password supplied in the owner's screenshot matched the linked user's hash but did not match the account hash used by school-ID personnel login.

## How

Repaired only this administrator's credential mismatch in a database transaction. Locked and verified the linked identities/status, verified the supplied existing password against the user record, and copied that verified hash into the account record. Incremented the account and linked user's authentication versions and cleared this account's outstanding password-recovery code/reset grants. Existing role, account status, operational records and other accounts were retained.

A private rollback snapshot of the two previous records was saved under the repository-ignored `apps/storage/private-backups/` directory. It contains existing password hashes, without plaintext passwords. Credentials and issued JWTs are excluded from this work record and command output.

No login fallback, role change or password-validation bypass was introduced. The source of the prior mismatch was not established; the current registration and recovery paths write both credential records. The repair affects the configured shared Supabase database, even though the application is running locally.

## Implementation tracking

- [x] Verify local service health and account status.
- [x] Verify mismatch using the owner's supplied credential without printing it.
- [x] Back up and repair only the linked administrator records transactionally.
- [x] Verify real personnel login through the Vite proxy and the resulting JWT session.

## Verification

`POST /api/v1/auth/login` via `localhost:5173`, using the personnel portal and the same existing password, returned HTTP 200, role Admin and `/admin/dashboard`. The resulting token was accepted by `GET /api/v1/auth/me` with HTTP 200. No token or password was printed or added to repository files.

## Change log

- 2026-10-11: Repaired and verified administrator login. No schema migration, GitHub push or deployment. Postgres next migration 025 / MySQL reference next 048 unchanged.
