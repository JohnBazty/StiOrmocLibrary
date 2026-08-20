# STI Ormoc Smart Library - Implementation Plan

## Detailed module plans

- [Book and Research/Thesis Management](book-research-thesis-implementation-plan.md) - database normalization, catalog APIs, ISBN/barcode workflows, search/filtering, web/mobile views, and CSV/PDF inventory reporting.

## 1. System goal

Create a mobile-responsive Smart Library Management System for STI College Ormoc that replaces manual library workflows with one coherent digital platform. The feature interface remains backed by realistic mock operational data while the secure MySQL-backed authentication foundation is now implemented.

The production target remains a React frontend, a Node.js and Express modular-monolith API, and a MySQL database using the MySQL 5.6-compatible schema baseline.

## 2. Users and experiences

### Student and faculty experience

- View a personal dashboard, current loans, due dates, reservations, fines, notifications, and clearance status.
- Search and filter the book and research/thesis catalogs.
- Inspect availability, shelf location, metadata, and an APA-style reference.
- Submit borrow/reservation actions in the final database-backed version.
- Create and monitor printing requests.
- View QR attendance history and library visit activity.

### Librarian and administrator experience

- Monitor operational KPIs and recent activity.
- Manage catalog records, categories, physical copies, and research papers.
- Process borrowing, returning, overdue transactions, reservations, and fines.
- Monitor attendance, print queues, printing revenue, ink, and paper supplies.
- Review inventory condition and audit information.
- Manage user state and inspect clearance blocks.
- Open report templates for attendance, circulation, inventory, fines, and printing.

## 3. Architecture

Use a modular monolith with a single deployable API and one database boundary.

```text
apps/web                      apps/api
React + Vite + Tailwind  -->  Express REST API
student/admin routes          feature modules and services
responsive interface         mock repository now, Prisma later
                                      |
                            MySQL 5.6-compatible
```

The API is organized by domain module, but all modules run in one Node.js process. Modules communicate through services and shared domain types, not HTTP calls between internal features.

## 4. Initial prototype delivery

### Frontend

- Responsive shell with sidebar, top bar, breadcrumbs, notifications, and demo role switching.
- Institutional-email login with bcrypt verification, active-account checks, MySQL sessions, CSRF protection, and role-based dashboard routing.
- Student routes: overview, catalog, research, borrowing, reservations, printing, attendance, notifications, and clearance.
- Staff routes: overview, catalog, circulation, reservations, fines, inventory, printing, supplies, attendance, users, clearance, and reports.
- Realistic cards, tables, progress indicators, filters, statuses, and empty/error-ready components.

### Backend

- Express application with health and feature endpoints.
- Domain modules for dashboard, catalog, circulation, reservations, fines, attendance, printing, inventory, users, clearance, notifications, and reports.
- Mock repository acting as the current data source.
- A consistent JSON response shape suitable for later Prisma-backed services.
- No database connection is required for the prototype.

## 5. Data strategy

The prototype mock data follows `docs/schema-context.md`. API responses use stable identifiers and domain fields that can later map to Prisma models.

When MySQL is introduced:

1. Add Prisma and create models from the canonical schema context.
2. Replace module-level mock repository reads with Prisma repository implementations.
3. Keep routes, service contracts, and frontend response shapes stable.
4. Add transactions to borrowing, returns, reservation fulfillment, payments, and inventory adjustments.
5. Replace the demo identity middleware with validated JWT authentication and server-side role authorization.

## 6. Implementation phases

### Phase 1 - Navigable prototype

- Establish the monorepo workspace and development scripts.
- Build the Express module boundaries and mock endpoints.
- Build all major student and staff interface templates.
- Confirm that the project starts without MySQL and that navigation works.

### Phase 2 - Database foundation

- Create the Prisma schema and initial MySQL migration.
- Seed roles, demo users, catalog records, copies, and system policies.
- Implement repository interfaces and Prisma repositories.
- Add database-backed CRUD for users, catalog, and physical copies.

### Phase 3 - Operational workflows

- Implement borrowing and returning transactions.
- Implement reservations and waiting-list fulfillment.
- Implement fine calculation, payments, and clearance computation.
- Implement QR attendance check-in/check-out.
- Implement printing upload storage, price calculation, queue transitions, and payments.

### Phase 4 - Administration and reporting

- Add inventory audits and supply movement records.
- Add dashboards and exportable circulation, attendance, fines, inventory, and printing reports.
- Add notification generation for due dates, overdue items, reservations, and print status.

### Phase 5 - Security, testing, and deployment

- Add password hashing, JWT sessions, role authorization, validation, file restrictions, and audit logging.
- Add unit, integration, and browser-level tests for critical workflows.
- Configure production database, file storage, backups, monitoring, and deployment.

## 7. Acceptance criteria for the prototype

- One command installs all workspace dependencies.
- One command starts both the frontend and backend development servers.
- The application automatically opens in a demo student session.
- The demo role switch allows inspection of the librarian/admin workspace.
- Every major module described in the capstone document has a navigable template.
- Dashboard and table content comes from realistic mock data.
- The frontend production build succeeds.
- The API starts and exposes a passing health endpoint.
- Documentation explains the architecture, project structure, commands, mock-data layer, and database integration path.

## 8. Guardrails

- Keep the backend as one modular monolith; do not introduce microservices.
- Keep business rules in backend services rather than UI components.
- Treat each `materials` row as one individually barcoded physical item.
- Store uploaded files outside MySQL and keep only metadata/storage keys in the database.
- Use decimal values for money and UTC timestamps at rest.
- Preserve operational history; use statuses or deactivation instead of destructive record deletion.
