# STI College Ormoc Integrated Library Management System

The STI College Ormoc Integrated Library Management System is a web-based library platform for STI College Ormoc. It combines a React administration and user portal with a modular-monolith Node.js API. The active local and deployed database is Supabase Postgres. MySQL was retired on 2026-11-10 (see [docs/mysql-removal-plan.md](docs/mysql-removal-plan.md)).

This guide explains how to prepare a Windows development computer, run and test the system, and prepare a production build.

## AI agents — read this first

1. Follow [`.cursor/agent-protocol.md`](.cursor/agent-protocol.md) (start-session protocol, plan statuses, Supabase migration tracker: latest applied **036**, **033–035** and payment **038–041** pending review, next unused **042**).
2. Read [AGENTS.md](AGENTS.md) and [agent.md](agent.md).
3. Database history: [docs/supabase-migration-plan.md](docs/supabase-migration-plan.md) and [docs/mysql-removal-plan.md](docs/mysql-removal-plan.md).

## Contents

**Latest local app:** from
`C:\Users\JOHN\Documents\SSL\StiOrmocLibrary-main-sync`, run
`npm run dev` and open `http://localhost:5173`. The same application contains the
latest payment features and reads the existing school database configuration.
`dev:stable` and `dev:payments` start this same app too; they do not switch to
sample records. Online checkout remains disabled until its real-data activation
is separately reviewed. Automated isolated payment QA is available as
`npm run qa:payments` and does not replace the normal application. See the
[integration record](docs/plans/2026-11-11-local-payment-integration.md).

1. [System overview](#system-overview)
2. [Prerequisites](#prerequisites)
3. [Clone and install](#clone-and-install)
4. [Configure the database](#configure-the-database)
5. [Configure environment variables](#configure-environment-variables)
6. [Initialize the database](#initialize-the-database)
7. [Create a System Administrator](#create-a-system-administrator)
8. [Run the application](#run-the-application)
9. [Verify the installation](#verify-the-installation)
10. [Common development commands](#common-development-commands)
11. [Optional inventory preview mode](#optional-inventory-preview-mode)
12. [Production build](#production-build)
13. [Troubleshooting](#troubleshooting)
14. [Project structure](#project-structure)
15. [Security checklist](#security-checklist)

## System overview

```text
React + Vite + Tailwind CSS web application
                    |
                    | /api requests
                    v
Node.js + Express modular-monolith API
                    |
                    v
           Supabase Postgres database
```

The repository is an npm workspace:

- `apps/web` — React, Vite, TypeScript, and Tailwind CSS frontend.
- `apps/api` — Node.js, Express, TypeScript, authentication, business modules, and SQL queries (Postgres).
- `database/supabase` — ordered Postgres schema files for Supabase.
- `docs` — architecture, database, feature, and development documentation.

Implemented live database areas include authentication, categories, normalized books/research records, physical-copy inventory, thesis inventory, reservations, and inventory CSV/PDF reports. Some remaining presentation screens still use mock operational data while their backend modules are developed.

Revision Phase 8 adds live actionable Librarian/Staff tasks, owner-scoped dashboard links and a Librarian Reports page with 13 filtered source reports and CSV/PDF exports. The active report overview uses real database records. Local technical checks passed; human Librarian acceptance remains open. See [implementation evidence](docs/revision-phase8-local-implementation.md) and [trial guide](docs/revision-phase8-librarian-trial.md).

The owner-approved combined Librarian/Admin login is `ADMIN-PORTAL-001` at `/staff`, using its existing password and opening `/librarian/dashboard`. The temporary `LIB-TEST-001` login is archived with its history preserved. See [account consolidation record](docs/admin-librarian-account-consolidation.md).

## Prerequisites

Install the following software before continuing:

| Software | Requirement |
| --- | --- |
| Git | Current Windows release |
| Node.js | `22.18` or newer; Node.js 24 is recommended |
| npm | Installed with Node.js |
| Database | A Supabase Postgres project (`DATABASE_URL`) |
| Browser | Current Chrome, Edge, or Firefox |

Verify Git, Node.js, and npm in PowerShell:

```powershell
git --version
node --version
npm --version
```

## Clone and install

Open PowerShell in the folder where you keep development projects:

```powershell
git clone https://github.com/JohnBazty/StiOrmocLibrary.git
Set-Location StiOrmocLibrary
npm install
```

If the repository is already on your computer:

```powershell
Set-Location C:\path\to\StiOrmocLibrary
git pull origin main
npm install
```

Run all commands in this guide from the repository root unless a section says otherwise.

## Configure the database

The system uses Supabase Postgres only. Create or obtain access to the Supabase project, then copy its Session pooler connection string (port 5432) into `DATABASE_URL` in the next step. Never commit it.

## Configure environment variables

Create the API environment file from the supplied example:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Open `apps/api/.env` and configure it:

```env
PORT=4000
WEB_ORIGIN=http://localhost:5173
NODE_ENV=development

DATABASE_URL=postgresql://postgres.<project-ref>:CHANGE_ME@<pooler-host>:5432/postgres
DB_CONNECTION_LIMIT=10

SESSION_SECRET=REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
JWT_SECRET=REPLACE_WITH_A_DIFFERENT_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
JWT_ISSUER=sti-ormoc-smart-library-api
JWT_AUDIENCE=sti-ormoc-smart-library-web
JWT_EXPIRES_IN_SECONDS=900
REPORT_INTEGRITY_SECRET=REPLACE_WITH_A_THIRD_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
ATTENDANCE_QR_SECRET=REPLACE_WITH_A_FOURTH_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
```

Generate three different secrets by running this command three times:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Copy separate generated values into `SESSION_SECRET`, `JWT_SECRET`, `REPORT_INTEGRITY_SECRET`, and `ATTENDANCE_QR_SECRET`. Keep the attendance QR secret stable because changing it invalidates downloaded passes.

Important:

- Do not use the example placeholder values in production.
- Do not share or commit `apps/api/.env`.
- The `.gitignore` already excludes `.env` files.
- `WEB_ORIGIN` must exactly match the frontend origin, including its port.

The frontend uses Vite's development proxy and normally requires no environment file. It forwards `/api` requests to `http://localhost:4000`.

## Initialize the database

The schema lives in `database/supabase/` as numbered Postgres files. Apply a reviewed file with:

```powershell
npm run db:supabase -w @sti-library/api -- 016_configurable_borrowing_policies.sql
```

Never edit an already-applied file. Create the next numbered file instead (see the tracker in `.cursor/agent-protocol.md`). Back up the database before applying production changes.

## Create a System Administrator

The dedicated administrator portal is located at `/admin/login`. It requires an `Admin` identity in the normalized `accounts` table.

### 1. Create the secure credential

Run the interactive account utility:

```powershell
npm run auth:create-user -w @sti-library/api -- --email admin@ormoc.sti.edu.ph --role "System Administrator" --id ADMIN-001 --name "Campus Administrator"
```

The command prompts for the password without displaying it. Passwords must contain 8–72 characters and are hashed with bcrypt before storage.

Use a real authorized institutional address ending in `@ormoc.sti.edu.ph`. Change `ADMIN-001` to the administrator's official school or staff identifier.

### 2. Synchronize the normalized login identity

After the account utility finishes, execute this idempotent SQL in the Supabase SQL editor. Change `ADMIN-001` if you selected another identifier.

```sql
INSERT INTO accounts
  (user_id, school_id, contact_number, password_hash, role, account_status)
SELECT
  u.user_id,
  u.school_id,
  NULL,
  u.password_hash,
  u.user_role,
  CASE u.account_status WHEN 'Active' THEN 'Active' ELSE 'Deactivated' END
FROM users u
WHERE u.school_id = 'ADMIN-001'
ON CONFLICT (school_id) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  account_status = EXCLUDED.account_status,
  user_id = COALESCE(accounts.user_id, EXCLUDED.user_id);
```

Confirm the identity without displaying its password hash:

```sql
SELECT account_id, school_id, role, account_status
FROM accounts
WHERE school_id = 'ADMIN-001';
```

The result should show `role = Admin` and `account_status = Active`.

### Student registration

Students may register through:

```text
http://localhost:5173/register
```

Public registration always creates an active Student account. Administrative and Librarian privileges must never be accepted from a public registration form.

## Run the application

Start the frontend and API together:

```powershell
npm run dev
```

Expected addresses:

| Service | Address |
| --- | --- |
| Web application | `http://localhost:5173` |
| Standard login | `http://localhost:5173/login` |
| Student registration | `http://localhost:5173/register` |
| Administrator login | `http://localhost:5173/admin/login` |
| API | `http://localhost:4000` |
| API health check | `http://localhost:4000/api/health` |

The terminal uses `WEB` and `API` prefixes. Keep it running while using the system. Stop both development servers with `Ctrl+C`.

### Run only one application

Use two terminals when debugging the applications separately.

Terminal 1:

```powershell
npm run dev:api
```

Terminal 2:

```powershell
npm run dev:web
```

The frontend needs the API for authentication and database-backed modules.

## Verify the installation

### 1. Check API health

Open `http://localhost:4000/api/health` or use PowerShell:

```powershell
Invoke-RestMethod http://localhost:4000/api/health | ConvertTo-Json -Depth 8
```

A successful response reports:

- `success: true`
- `status: healthy`
- `databaseSchema.ready: true`

A `503 DATABASE_MIGRATION_REQUIRED` response means migrations are missing.

### 2. Test administrator login

1. Open `http://localhost:5173/admin/login`.
2. Enter the administrator School ID.
3. Enter the password created by the account utility.
4. Confirm that the browser opens `/admin/dashboard`.

### 3. Run automated verification

```powershell
npm test
npm run typecheck
npm run build
```

All three commands should finish without failures.

## Common development commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install every workspace dependency |
| `npm run dev` | Run frontend and API together |
| `npm run dev:web` | Run only Vite on port 5173 |
| `npm run dev:api` | Run only Express on port 4000 |
| `npm run auth:create-user -w @sti-library/api -- ...` | Create a bcrypt-protected institutional user |
| `npm test` | Run API and frontend test suites |
| `npm run typecheck` | Check API and frontend TypeScript |
| `npm run build` | Produce API and frontend production builds |
| `npm run start -w @sti-library/api` | Start the compiled API |

## Optional inventory preview mode

Inventory preview mode bypasses normal login only for local layout evaluation. Never enable it in production.

Add this line to `apps/api/.env`:

```env
INVENTORY_PREVIEW_ENABLED=true
```

Create `apps/web/.env.local`:

```env
VITE_INVENTORY_MOCK_AUTH=true
```

Restart both development servers and open:

```text
http://localhost:5173/admin/inventory
```

Safety controls restrict preview bootstrapping to development, the configured local origin, and loopback requests. Remove both flags when testing real authentication.

## Production build

Create the production outputs:

```powershell
npm run build
```

Generated folders:

- `apps/api/dist` — compiled API.
- `apps/web/dist` — static frontend assets.

Start the compiled API:

```powershell
$env:NODE_ENV = 'production'
npm run start -w @sti-library/api
```

The frontend output must be served by a static web server or hosting platform. Configure that server to:

1. Serve `apps/web/dist`.
2. Return `index.html` for React client-side routes.
3. Reverse-proxy `/api` to the Express API.
4. Use HTTPS.

Before production deployment:

1. Back up the database.
2. Use a dedicated production database account.
3. Configure strong, distinct `SESSION_SECRET` and `JWT_SECRET` values.
4. Set the exact HTTPS frontend URL in `WEB_ORIGIN`.
5. Keep `INVENTORY_PREVIEW_ENABLED` disabled.
6. Apply migrations before starting the new API version.
7. Run tests, type checking, and the production build.
8. Store uploaded files outside the database and outside the Git repository.

The current application does not provide a Docker or one-command cloud deployment configuration.

## Troubleshooting

### `DATABASE_URL` is required

The API refuses to start without a Postgres connection string. Set `DATABASE_URL` in `apps/api/.env` and restart.

### Connection refused or timeout

The direct Supabase host is often IPv6-only. Use the Session pooler (port 5432) with user `postgres.<project-ref>` on IPv4 networks.

### `DATABASE_MIGRATION_REQUIRED`

A required table or column is missing. Apply the pending file from `database/supabase/`, restart the API, and check `/api/health` again.

### `Unexpected token '<', "<!doctype" is not valid JSON`

The frontend received an HTML page instead of an API JSON response.

1. Confirm the API is running on port `4000`.
2. Confirm Vite is running on port `5173`.
3. Confirm the frontend request begins with `/api`.
4. Check the Vite proxy target in `apps/web/vite.config.ts`.
5. Restart both applications.

### Login reports invalid credentials

Check all three identity values:

- The selected `Login as` role must match the database role.
- The School ID must match `accounts.school_id`.
- The account must be `Active`.

For the dedicated administrator portal, confirm `accounts.role = 'Admin'`.

### Port 5173 or 4000 is already in use

Stop the process using that port, or change both the configured port and the corresponding proxy/origin configuration. Vite intentionally uses strict port `5173`.

## Project structure

```text
StiOrmocLibrary/
├── apps/
│   ├── api/
│   │   ├── scripts/                 Database and account utilities
│   │   ├── src/
│   │   │   ├── config/              Environment and Postgres pool
│   │   │   ├── core/                Errors, sessions, schema readiness
│   │   │   └── modules/             Modular-monolith business modules
│   │   └── .env.example
│   └── web/
│       └── src/
│           ├── components/          Shared interface components
│           ├── features/            Auth, catalog, categories, inventory
│           ├── layouts/             Admin and user portal shell
│           └── pages/               Portal pages
├── database/
│   └── supabase/                    Ordered Postgres schema files
├── docs/                             Architecture and feature guides
├── agent.md                          Development architecture contract
├── package.json                      Workspace scripts
└── README.md                         This setup guide
```

## Security checklist

- Never commit `.env`, database backups, real user exports, or uploaded files.
- Never store plain-text passwords; use the provided bcrypt account flows.
- Use the least-privileged database role the application needs.
- Use unique production secrets with at least 32 characters.
- Keep RBAC checks in the API; frontend route guards are not sufficient.
- Keep prepared SQL statements and server-side request validation.
- Use HTTPS and secure cookies in production.
- Back up the database before applying production migrations.
- Do not enable mock authentication or inventory preview in production.

## Additional documentation

- [Product source of truth](docs/source-of-truth.md)
- [Architecture guide](agent.md)
- [Schema context](docs/schema-context.md)
- [Authentication setup](docs/authentication-setup.md)
- [Inventory implementation](docs/inventory-management-implementation.md)
- [Book and Research/Thesis API](docs/book-research-thesis-module-api.md)
- [Category Management](docs/category-management-module.md)
- [Reservation and Borrowing Management](docs/reservation-borrowing-management-module.md)

## Quick setup checklist

- [ ] Install Git, Node.js, and access to the Supabase project.
- [ ] Clone the repository and run `npm install`.
- [ ] Copy and configure `apps/api/.env`.
- [ ] Check the live migration ledger. Apply only individually reviewed Supabase SQL files.
- [ ] Create and synchronize an Admin (Librarian) account.
- [ ] Run `npm run dev`.
- [ ] Confirm `/api/health` reports a ready schema.
- [ ] Sign in through `/admin/login`.
- [ ] Run tests, type checking, and the production build.


## Main integration — 2026-10-11

The main branch was reconciled with the current revision permission model and phase workflows. Borrowing policy management uses the Librarian workspace; prior login sessions are invalidated when a new login succeeds. The original SQL references remain in Git history. The follow-up reconciliation verified the live filenames and restored matching migration sources to the Supabase directory. See `docs/main-branch-integration.md`.
