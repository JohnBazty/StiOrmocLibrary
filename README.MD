# STI Ormoc Smart Library

A runnable full-interface prototype based on the STI Ormoc Smart Library capstone proposal. It uses a React, Vite, and Tailwind CSS frontend plus a Node.js and Express modular-monolith API.

The current version includes secure MySQL-backed login and role-based dashboard routing. The feature dashboards still use realistic mock operational data while database integration continues.

## Run the project

Requirements: Node.js 22.18 or newer and npm.

```bash
npm install
npm run db:schema -w @sti-library/api
npm run db:migrate -w @sti-library/api
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:4000`.

The application opens at the secure sign-in page. Use an active STI institutional account; the API directs Admin, Librarian, Faculty, and Student users to separate protected dashboards.

## Verification

```bash
npm run typecheck
npm run build
```

## Documentation

- [Implementation plan](docs/implementation-plan.md)
- [System context](docs/system-context.md)
- [Database schema context](docs/schema-context.md)
- [Local setup and development](docs/getting-started.md)
- [Mock API reference](docs/api-reference.md)
- [MySQL Server and Workbench setup](docs/mysql-workbench-setup.md)
- [MySQL 5.6 database schema](database/mysql56-schema.sql)
- [Authentication setup](docs/authentication-setup.md)
- [JWT role authentication](docs/jwt-role-authentication.md)
- [Book and Research/Thesis API contract](docs/book-research-thesis-module-api.md)
- [Category Management module](docs/category-management-module.md)
- [Reservation & Borrowing Management module](docs/reservation-borrowing-management-module.md)

## Project structure

```text
apps/
  web/    React + Vite + Tailwind CSS
  api/    Node.js + Express modular monolith
docs/     Plans, architecture, schema, and development guides
```
