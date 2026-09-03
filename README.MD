# STI Ormoc Smart Library

SmartLib is a web-based library management system for STI College Ormoc. It combines a React administration and user portal with a modular-monolith Node.js API and a MySQL relational database.

This guide explains how to prepare a Windows development computer, configure MySQL and MySQL Workbench, initialize the database, create an administrator, run the system, test it, and prepare a production build.

## Contents

1. [System overview](#system-overview)
2. [Prerequisites](#prerequisites)
3. [Clone and install](#clone-and-install)
4. [Configure MySQL](#configure-mysql)
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
           MySQL relational database
```

The repository is an npm workspace:

- `apps/web` — React, Vite, TypeScript, and Tailwind CSS frontend.
- `apps/api` — Node.js, Express, TypeScript, authentication, business modules, and MySQL queries.
- `database` — MySQL 5.6-compatible baseline schema and ordered migrations.
- `docs` — architecture, database, feature, and development documentation.

Implemented live database areas include authentication, categories, normalized books/research records, physical-copy inventory, thesis inventory, reservations, and inventory CSV/PDF reports. Some remaining presentation screens still use mock operational data while their backend modules are developed.

## Prerequisites

Install the following software before continuing:

| Software | Requirement |
| --- | --- |
| Git | Current Windows release |
| Node.js | `22.18` or newer; Node.js 24 is recommended |
| npm | Installed with Node.js |
| MySQL Server | MySQL 5.6-compatible; MySQL 8.4 LTS is recommended locally |
| MySQL Workbench | Current Windows release |
| Browser | Current Chrome, Edge, or Firefox |

Verify Git, Node.js, and npm in PowerShell:

```powershell
git --version
node --version
npm --version
```

MySQL Workbench is only a graphical management client. MySQL Server must also be installed and running.

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

## Configure MySQL

### 1. Install and start MySQL Server

During MySQL installation:

1. Enable TCP/IP.
2. Use port `3306` unless it conflicts with another service.
3. Configure MySQL as a Windows service.
4. Create and securely save the MySQL `root` password.
5. Confirm that the Windows MySQL service is running.

Do not place the root password in source files or commit it to Git.

### 2. Create a Workbench administrator connection

In MySQL Workbench, select the `+` button beside **MySQL Connections** and use:

| Setting | Value |
| --- | --- |
| Connection Name | `Local MySQL Administrator` |
| Connection Method | `Standard (TCP/IP)` |
| Hostname | `127.0.0.1` |
| Port | `3306` |
| Username | `root` |

Select **Test Connection**, enter the root password, and save the connection.

### 3. Create the project database account

Open the administrator connection and execute the following SQL. Replace `CHANGE_ME_STRONG_PASSWORD` with a password used only for this local database account.

```sql
CREATE DATABASE IF NOT EXISTS `sti_ormoc_library`
  CHARACTER SET utf8
  COLLATE utf8_general_ci;

CREATE USER IF NOT EXISTS 'sti_library_app'@'127.0.0.1'
  IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';

GRANT ALL PRIVILEGES
  ON `sti_ormoc_library`.*
  TO 'sti_library_app'@'127.0.0.1';

FLUSH PRIVILEGES;
SHOW GRANTS FOR 'sti_library_app'@'127.0.0.1';
```

`ALL PRIVILEGES` is appropriate for a local account restricted to this single development schema. Use narrower privileges for production after the deployment process is finalized.

If an older MySQL version does not accept `CREATE USER IF NOT EXISTS`, run `CREATE USER` without `IF NOT EXISTS` for a new account.

### 4. Create the application Workbench connection

Create a second Workbench connection:

| Setting | Value |
| --- | --- |
| Connection Name | `STI Ormoc Library - App` |
| Hostname | `127.0.0.1` |
| Port | `3306` |
| Username | `sti_library_app` |
| Default Schema | `sti_ormoc_library` |

Test and save it. Use this connection for normal development and keep the root connection for database administration only.

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

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=sti_library_app
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD
DB_NAME=sti_ormoc_library
DB_CONNECTION_LIMIT=10

SESSION_SECRET=REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
JWT_SECRET=REPLACE_WITH_A_DIFFERENT_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
JWT_ISSUER=sti-ormoc-smart-library-api
JWT_AUDIENCE=sti-ormoc-smart-library-web
JWT_EXPIRES_IN_SECONDS=900
REPORT_INTEGRITY_SECRET=REPLACE_WITH_A_THIRD_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
```

Generate three different secrets by running this command three times:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Copy separate generated values into `SESSION_SECRET`, `JWT_SECRET`, and `REPORT_INTEGRITY_SECRET`.

Important:

- Do not use the example placeholder values in production.
- Do not share or commit `apps/api/.env`.
- The `.gitignore` already excludes `.env` files.
- `WEB_ORIGIN` must exactly match the frontend origin, including its port.

The frontend uses Vite's development proxy and normally requires no environment file. It forwards `/api` requests to `http://localhost:4000`.

## Initialize the database

### Recommended command-line method

Run the canonical baseline schema:

```powershell
npm run db:schema -w @sti-library/api
```

Then apply every pending migration in filename order:

```powershell
npm run db:migrate -w @sti-library/api
```

The migration runner creates a `schema_migrations` ledger containing migration filenames, SHA-256 checksums, and application timestamps.

It is safe to run `db:migrate` again:

- Unapplied migrations are executed in order.
- Applied migrations are skipped.
- An applied migration whose file was later edited is rejected.

Never edit an already-deployed migration. Create a new migration file instead.

To run one migration explicitly:

```powershell
npm run db:migrate -w @sti-library/api -- 20260820_011_backfill_published_research_inventory.sql
```

### MySQL Workbench method

The command-line method is preferred because it maintains the migration ledger. To execute the baseline manually:

1. Open the `STI Ormoc Library - App` Workbench connection.
2. Select **File > Open SQL Script**.
3. Open `database/mysql56-schema.sql`.
4. Select the lightning-bolt button to execute the complete script.
5. Refresh the **Schemas** panel.
6. Run `npm run db:migrate -w @sti-library/api` afterward to register and apply the versioned migrations.

Do not execute only highlighted fragments of the baseline unless you understand their foreign-key order and trigger dependencies.

### Confirm the schema

In Workbench:

```sql
USE `sti_ormoc_library`;

SELECT COUNT(*) AS tables_created
FROM information_schema.tables
WHERE table_schema = 'sti_ormoc_library';

SELECT migration_name, applied_at
FROM schema_migrations
ORDER BY migration_name;
```

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

After the account utility finishes, execute this idempotent SQL in Workbench. Change `ADMIN-001` if you selected another identifier.

```sql
USE `sti_ormoc_library`;

INSERT INTO `accounts`
  (`user_id`, `school_id`, `contact_number`, `password_hash`, `role`, `account_status`)
SELECT
  u.`user_id`,
  u.`school_id`,
  NULL,
  u.`password_hash`,
  u.`user_role`,
  CASE u.`account_status`
    WHEN 'Active' THEN 'Active'
    ELSE 'Deactivated'
  END
FROM `users` u
WHERE u.`school_id` = 'ADMIN-001'
ON DUPLICATE KEY UPDATE
  `accounts`.`password_hash` = VALUES(`password_hash`),
  `accounts`.`role` = VALUES(`role`),
  `accounts`.`account_status` = VALUES(`account_status`),
  `accounts`.`user_id` = IFNULL(`accounts`.`user_id`, VALUES(`user_id`));
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
| `npm run db:schema -w @sti-library/api` | Execute the canonical baseline schema |
| `npm run db:migrate -w @sti-library/api` | Apply pending migrations |
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
8. Store uploaded files outside MySQL and outside the Git repository.

The current application does not provide a Docker or one-command cloud deployment configuration.

## Troubleshooting

### `Access denied for user ... (using password: NO)`

The API did not receive a database password.

1. Confirm `apps/api/.env` exists.
2. Set `DB_PASSWORD` to the application database account password.
3. Restart the API.

Do not add quotes unless the quotes are part of the password.

### `ER_ACCESS_DENIED_ERROR`

The username or password is incorrect, or the account lacks schema privileges.

1. Test the same account in Workbench.
2. Confirm `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
3. Run `SHOW GRANTS FOR 'sti_library_app'@'127.0.0.1';` as root.

### `ECONNREFUSED 127.0.0.1:3306`

MySQL Server is not running or is using another port. Start the Windows MySQL service and confirm its configured port.

### `Unknown database 'sti_ormoc_library'`

Run:

```powershell
npm run db:schema -w @sti-library/api
```

### `DATABASE_MIGRATION_REQUIRED`

Run:

```powershell
npm run db:migrate -w @sti-library/api
```

Then restart the API and check `/api/health` again.

### `Applied migration ... has changed`

An already-applied SQL migration was edited. Restore the original migration file from Git and create a new migration for the change.

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

### The schema runs in Workbench but the API still fails

Workbench and the API may be using different accounts or servers. Compare:

```sql
SELECT DATABASE(), CURRENT_USER(), VERSION();
```

with `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_NAME` in `apps/api/.env`.

## Project structure

```text
StiOrmocLibrary/
├── apps/
│   ├── api/
│   │   ├── scripts/                 Database and account utilities
│   │   ├── src/
│   │   │   ├── config/              Environment and MySQL pool
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
│   ├── migrations/                  Ordered, versioned SQL migrations
│   └── mysql56-schema.sql           Canonical baseline schema
├── docs/                             Architecture and feature guides
├── agent.md                          Development architecture contract
├── package.json                      Workspace scripts
└── README.md                         This setup guide
```

## Security checklist

- Never commit `.env`, database backups, real user exports, or uploaded files.
- Never store plain-text passwords; use the provided bcrypt account flows.
- Use a dedicated MySQL account instead of `root` for the application.
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
- [Detailed MySQL Workbench tutorial](docs/mysql-workbench-setup.md)
- [Authentication setup](docs/authentication-setup.md)
- [Inventory implementation](docs/inventory-management-implementation.md)
- [Book and Research/Thesis API](docs/book-research-thesis-module-api.md)
- [Category Management](docs/category-management-module.md)
- [Reservation and Borrowing Management](docs/reservation-borrowing-management-module.md)

## Quick setup checklist

- [ ] Install Git, Node.js, MySQL Server, and MySQL Workbench.
- [ ] Clone the repository and run `npm install`.
- [ ] Create the `sti_library_app` MySQL account.
- [ ] Copy and configure `apps/api/.env`.
- [ ] Run `db:schema` and `db:migrate`.
- [ ] Create and synchronize a System Administrator account.
- [ ] Run `npm run dev`.
- [ ] Confirm `/api/health` reports a ready schema.
- [ ] Sign in through `/admin/login`.
- [ ] Run tests, type checking, and the production build.
