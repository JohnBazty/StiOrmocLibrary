# Restore the owner-selected personnel password

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` |

## Why

The owner reports invalid credentials at `/staff` for `ADMIN-PORTAL-001` and explicitly specifies the password to restore. Read-only bcrypt verification confirms that the specified password matches neither stored account nor linked user credential. The active account and linked operational role are correctly Librarian. The earlier role repair preserved the previous password; no cause of the historical password selection is established.

## How

Perform a scoped transaction for retained account 5 / user 5 only. Verify identity, Active status and Librarian role, hash the owner-selected password with bcrypt, synchronize both stored hashes, increment both authentication versions, clear this user's cookie sessions and invalidate outstanding recovery grants. Record an owner-requested password reset event without credentials. Verify normal password-based sign-in through the running local web proxy and authenticated Librarian access, then revoke the verification session. Do not store the password or tokens in this document, source files or evidence logs.

This is a targeted account operation. Product Postgres migration 026 / next 027 and MySQL reference 048 / next 049 are unchanged.

## Implementation tracking

- [x] Confirm the correct personnel portal, retained identity and stored credential mismatch.
- [x] Restore the explicitly requested password and revoke older authentication grants.
- [x] Verify password sign-in and Librarian dashboard access through the running service.
- [x] Revoke the verification session and document the result.

## Results

- Scoped transaction committed for account 5 / user 5. Both bcrypt comparisons passed after the update. Existing Active/Librarian statuses and identities were retained. Added a `PasswordReset` management event. No other account was targeted.
- Actual POST through `http://localhost:5173/api/v1/auth/login` with the staff portal returned HTTP 200, canonical Librarian authority and `/librarian/dashboard` redirect.
- Authenticated Librarian dashboard API returned HTTP 200. Revoked the verification session using the current-version repository operation; replay against `/api/v1/auth/me` returned HTTP 401. The owner can now sign in normally.
- No source authentication logic, migrations, deployment or GitHub push was changed or performed.

## Change log

- 2026-10-16: Owner supplied the desired password after confirming the failure occurs at `/staff`. Began a scoped credential repair; no role or schema change is required.
- 2026-10-16: Completed the authorized password synchronization, session/recovery revocation and password-based running-service verification. Removed the verification grant; credentials and tokens were not persisted to project files or evidence logs.
