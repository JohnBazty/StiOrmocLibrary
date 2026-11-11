# Login and Authentication Setup

## What is implemented

The Express application now provides a server-rendered vanilla HTML/CSS/JavaScript login at `http://localhost:4000/login`. Authentication uses the existing `roles` and `users` tables plus the new `auth_sessions` table.

- Institutional email validation: `@ormoc.sti.edu.ph` and `@sti.edu`
- One canonical self-service Student registration page at `http://localhost:5173/register`. The API address `http://localhost:4000/register` redirects to this page.
- bcrypt password verification with cost 12 for newly created accounts
- parameterized Postgres queries through `pg`
- Postgres-backed `express-session` records (`SqlSessionStore`)
- `HttpOnly`, `SameSite=Lax`, and production-only `Secure` cookies
- 30-minute rolling inactivity timeout
- session-ID regeneration after login
- synchronizer-token CSRF protection for login, logout, and every state-changing feature API request
- login rate limiting and security headers
- server-side role guards for dashboards and feature APIs

Public registration cannot grant the Librarian role. The role remains visible for an authenticated System Administrator workflow, and the backend rejects anonymous Librarian creation.

## 1. Prepare the database

The API runs on Supabase Postgres only (MySQL was retired on 2026-11-10). The schema is in `database/supabase/`; apply reviewed files one at a time with `npm run db:supabase -w @sti-library/api -- <file>.sql`. See `database/supabase/README.md`.

## 2. Database credentials

Use the Supabase connection string (session pooler) as `DATABASE_URL`. Never commit it.

## 3. Configure the API

From the repository root in PowerShell:

```powershell
Copy-Item apps\api\.env.example apps\api\.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Open `apps/api/.env`, paste the generated value into `SESSION_SECRET`, and set `DATABASE_URL`.

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
