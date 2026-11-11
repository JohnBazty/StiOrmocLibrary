# Local Setup and Development

## Requirements

- Node.js 22.18 or newer. Node.js 24 is recommended for the current development scripts.
- npm, included with Node.js.
- A modern browser.

A Supabase Postgres database (`DATABASE_URL`) is required for authentication and the live Category, Book/Research, inventory export, and Reservation modules. Other presentation-only screens may still use mock operational data while their integrations are completed.

Database setup is described in the repository `README.MD` (Configure the database).

## Install and run

From the repository root:

```bash
npm install
npm run dev
```

The command starts both applications:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`

Open `http://localhost:5173/login` for the secure React login screen. Port `4000` is the API only. Follow [Login and Authentication Setup](authentication-setup.md) before starting the API for the first time.

The API needs `DATABASE_URL` (Supabase Postgres) in `apps/api/.env`. Schema changes live in `database/supabase/`; apply one reviewed file at a time with `npm run db:supabase -w @sti-library/api -- <file>.sql` (see `database/supabase/README.md`).

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
| `DATABASE_URL` | None; required | Supabase Postgres connection string |
| `SESSION_SECRET` | No production default | Signs opaque session identifiers; use 32+ random characters |

The API loads `apps/api/.env`. Production requires strong, distinct session and JWT secrets.

## Mock-data locations

- Frontend presentation data: `apps/web/src/data/mockData.ts`
- API response data: `apps/api/src/data/mock-data.ts`

The duplication is temporary and deliberate: the interface remains easy to preview while API contracts are being finalized. During database integration, the frontend should read server data through an API client and the presentation copy should be removed.

## Database readiness

`GET http://localhost:4000/api/health` returns `databaseSchema.ready: true` when the required catalog, category, reservation, and authentication columns are available. A `503 DATABASE_MIGRATION_REQUIRED` response means a pending `database/supabase/` migration must be applied with `npm run db:supabase -w @sti-library/api -- <file>.sql`.
