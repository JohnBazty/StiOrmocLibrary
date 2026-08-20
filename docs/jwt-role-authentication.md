# JWT Role Authentication

This module adds a versioned JWT login boundary without removing SmartLib's existing MySQL-backed session authentication. New clients authenticate with a school ID and an explicit role selection. The older email payload remains accepted for backward compatibility while clients migrate.

## Database migration

The normalized authentication migration is `database/migrations/20260820_007_normalized_accounts_authentication.sql`. It adds:

- `accounts`, which owns school-ID credentials, contact number, role, and account lifecycle;
- `student_profiles`, which owns student names and academic metadata in a one-to-one row;
- a nullable compatibility link to `users`, with an idempotent backfill for existing accounts.

Apply it to an existing database:

```bash
npm run db:migrate -w @sti-library/api
```

The canonical fresh-install definition remains in `database/mysql56-schema.sql`.

## API contract

### `POST /api/v1/auth/login`

Request:

```json
{ "login_as": "Student", "school_id": "STI-2026-1234", "password": "user password" }
```

Successful `200` response data includes a signed HS256 token, a 15-minute lifetime, the account's safe profile, and the role dashboard path. The token carries `accountId`, backward-compatible `userId`, `schoolId`, `role`, plus standard issuer, audience, subject, issued-at, and expiry claims.

Authentication errors use generic `401 INVALID_CREDENTIALS` responses. Deactivated users receive `403 ACCOUNT_DEACTIVATED`. Input errors return `422 AUTH_VALIDATION_FAILED`. Login attempts are rate-limited.

### `POST /api/v1/auth/register`

Public registration is Student-only and accepts the fields shown by the mobile registration flow:

```json
{
  "school_id": "STI-2026-1234",
  "first_name": "Juan",
  "last_name": "Dela Cruz",
  "contact_number": "0917 123 4567",
  "program_strand": "BSIT",
  "year_grade_level": "2nd Year",
  "password": "strong password",
  "confirm_password": "strong password"
}
```

The service normalizes the school ID, validates every required field, performs a duplicate preflight, hashes with bcrypt cost 12, then inserts the account and profile in one transaction. Duplicate school IDs and field failures return `422`; unique-index races are translated to the same safe duplicate response. Passwords are never logged or returned.

### Protected checks

- `GET /api/v1/auth/me`
- `GET /api/v1/admin/dashboard` — Admin only
- `GET /api/v1/librarian/dashboard` — Librarian only
- `GET /api/v1/faculty/dashboard` — Faculty only
- `GET /api/v1/student/dashboard` — Student only

Send `Authorization: Bearer <token>`. Existing feature APIs also accept valid bearer tokens and keep their own module RBAC rules. Cookie-session mutations still require CSRF tokens; bearer-token requests do not rely on browser cookies and therefore do not use the cookie CSRF check.

## Frontend routing

The login page performs usability validation, submits credentials to the API, validates the returned token structure, stores it in `sessionStorage`, and routes by role:

| Role | Dashboard |
|---|---|
| Admin | `/admin/dashboard` |
| Librarian | `/librarian/dashboard` |
| Faculty | `/faculty/dashboard` |
| Student | `/student/dashboard` |

React route guards reject missing, expired, or mismatched roles before rendering a protected view. This client check is only a user-experience boundary; the API independently verifies the JWT signature, issuer, audience, expiry, and role before returning protected data.

## Production configuration

Set a unique random `JWT_SECRET` of at least 32 characters in `apps/api/.env`. Do not commit it. Production startup fails if the JWT or session secret is missing or weak.

```dotenv
JWT_SECRET=replace-with-a-long-random-production-secret
JWT_ISSUER=sti-ormoc-smart-library-api
JWT_AUDIENCE=sti-ormoc-smart-library-web
JWT_EXPIRES_IN_SECONDS=900
```

Passwords are bcrypt hashes, never encrypted or stored as plaintext. JWTs are deliberately short-lived and are cleared on sign-out or failed authorization.

## Verification

```bash
npm run typecheck
npm run build
npm test -w @sti-library/api
```

The automated suite covers transactional normalized registration, duplicate prevention, validation boundaries, all four role redirects and token claims, role-selection mismatch, invalid credentials, and denial of an Admin endpoint when a Student bearer token is supplied.
