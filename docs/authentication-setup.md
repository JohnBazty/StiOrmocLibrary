# Login and Authentication Setup

## What is implemented

The Express application now provides a server-rendered vanilla HTML/CSS/JavaScript login at `http://localhost:4000/login`. Authentication uses the existing `roles` and `users` tables plus the new `auth_sessions` table.

- Institutional email validation: `@ormoc.sti.edu.ph` and `@sti.edu`
- Self-service Student/Faculty registration at `http://localhost:4000/register`
- bcrypt password verification with cost 12 for newly created accounts
- MySQL prepared statements through `mysql2/promise`
- MySQL-backed `express-session` records
- `HttpOnly`, `SameSite=Lax`, and production-only `Secure` cookies
- 30-minute rolling inactivity timeout
- session-ID regeneration after login
- synchronizer-token CSRF protection for login, logout, and every state-changing feature API request
- login rate limiting and security headers
- server-side role guards for dashboards and feature APIs

Public registration cannot grant the Librarian role. The role remains visible for an authenticated System Administrator workflow, and the backend rejects anonymous Librarian creation.

## 1. Prepare MySQL

For a new database, execute [database/mysql56-schema.sql](../database/mysql56-schema.sql) in MySQL Workbench.

If you already executed the earlier 15-table schema, execute only:

```text
database/migrations/20260815_001_auth_sessions.sql
```

The completed database contains 16 tables and 8 triggers.

## 2. Create a least-privilege application account

Run the following in Workbench while connected as `root`. Replace the example password before executing it.

```sql
CREATE USER 'sti_library_app'@'localhost'
  IDENTIFIED BY 'replace_with_a_long_unique_password';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON sti_ormoc_library.*
  TO 'sti_library_app'@'localhost';

FLUSH PRIVILEGES;
```

If Node connects with `127.0.0.1` and MySQL treats that as a different host on your installation, create the same account for `'sti_library_app'@'127.0.0.1'` or change `DB_HOST` to `localhost`.

## 3. Configure the API

From the repository root in PowerShell:

```powershell
Copy-Item apps\api\.env.example apps\api\.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Open `apps/api/.env`, paste the generated value into `SESSION_SECRET`, and set the MySQL username and password.

For local HTTP development, keep `NODE_ENV=development`. In production, set `NODE_ENV=production`, serve the application through HTTPS, and keep `SESSION_SECRET` outside source control. Production startup refuses secrets shorter than 32 characters.

## 4. Create the first user

The included account utility hashes the password with bcrypt and inserts the user through prepared statements. It asks for the password interactively so the password is not saved in shell history.

```powershell
npm.cmd run auth:create-user -w @sti-library/api -- --email admin@ormoc.sti.edu.ph --role "System Administrator" --id ADMIN-001 --name "Campus Administrator"
```

Valid role values are:

- `System Administrator`
- `Librarian`
- `Student`
- `Faculty`

Student example with optional education fields:

```powershell
npm.cmd run auth:create-user -w @sti-library/api -- --email student.123456@ormoc.sti.edu.ph --role "Student" --id 123456 --name "Juan Dela Cruz" --education "College" --course "BSIT" --section "BSIT-4A"
```

## 5. Start and verify

```powershell
npm.cmd run dev:api
```

Open `http://localhost:4000/login`.

Expected routing:

| Role | Destination |
| --- | --- |
| System Administrator | `/admin/dashboard` |
| Librarian | `/admin/dashboard` |
| Student | `/user/dashboard` |
| Faculty | `/user/dashboard` |

Test these security cases before deployment:

1. A Gmail/Yahoo address is rejected before submission.
2. An incorrect email/password returns one generic credentials error.
3. A deactivated user receives the required librarian-coordination warning.
4. A Student or Faculty cannot open `/admin/dashboard`.
5. An Administrator or Librarian cannot open `/user/dashboard`.
6. Login/logout requests without a valid CSRF token are rejected.
7. Logout removes the server session, clears the cookie, and returns to `/login?logout=1`.

## Production notes

- Use HTTPS so the session cookie receives the `Secure` flag.
- Place Express behind a trusted reverse proxy and keep `NODE_ENV=production`.
- Rotate `SESSION_SECRET` through deployment secrets management; rotation invalidates existing sessions.
- Schedule database backups and monitor failed login rate-limit events.
- Do not log passwords, password hashes, session IDs, or raw session payloads.
- Keep the application database account limited to the privileges it actually needs.
