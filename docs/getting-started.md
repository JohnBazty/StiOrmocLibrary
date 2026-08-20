# Local Setup and Development

## Requirements

- Node.js 22.18 or newer. Node.js 24 is recommended for the current development scripts.
- npm, included with Node.js.
- A modern browser.

MySQL is required for authentication and the live Category, Book/Research, inventory export, and Reservation modules. Other presentation-only screens may still use mock operational data while their integrations are completed.

When you are ready to install the database, follow [MySQL Server and Workbench Setup](mysql-workbench-setup.md).

## Install and run

From the repository root:

```bash
npm install
npm run db:schema -w @sti-library/api
npm run db:migrate -w @sti-library/api
npm run dev
```

The command starts both applications:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`

Open `http://localhost:5173/login` for the secure React login screen. Port `4000` is the API only. Follow [Login and Authentication Setup](authentication-setup.md) before starting the API for the first time.

`db:migrate` executes pending SQL files in filename order and records their SHA-256 checksums in `schema_migrations`. It is safe to run again; applied migrations are skipped, and edited migration files are rejected.

## Run one application

```bash
npm run dev:web
npm run dev:api
```

Run these in separate terminals when debugging only one side of the system.

## Check the project

```bash
npm run typecheck
npm run build
```

The production output is written to:

- `apps/web/dist`
- `apps/api/dist`

After building, the API can be started with:

```bash
npm run start -w @sti-library/api
```

## Environment configuration

Copy `apps/api/.env.example` to `apps/api/.env` when environment-specific values are introduced.

| Variable | Current default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Express API port |
| `WEB_ORIGIN` | `http://localhost:5173` | Allowed development browser origin |
| `DB_HOST`, `DB_PORT` | `127.0.0.1`, `3306` | MySQL connection address |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | See `.env.example` | Application database credentials |
| `SESSION_SECRET` | No production default | Signs opaque session identifiers; use 32+ random characters |

The API loads `apps/api/.env`. Production requires strong, distinct session and JWT secrets.

## Mock-data locations

- Frontend presentation data: `apps/web/src/data/mockData.ts`
- API response data: `apps/api/src/data/mock-data.ts`

The duplication is temporary and deliberate: the interface remains easy to preview while API contracts are being finalized. During database integration, the frontend should read server data through an API client and the presentation copy should be removed.

## Database readiness

`GET http://localhost:4000/api/health` returns `databaseSchema.ready: true` when the required catalog, category, reservation, and authentication columns are available. A `503 DATABASE_MIGRATION_REQUIRED` response means `npm run db:migrate -w @sti-library/api` must be run.
