# System Context

## Product definition

The STI Ormoc Smart Library Management System is a campus platform for students, faculty, librarians, and administrators. It unifies resource discovery and day-to-day library operations that were previously handled through logbooks, index cards, physical queues, and manually maintained records.

The product covers:

- Digital book and research/thesis catalogs
- Physical-copy inventory and condition tracking
- Borrowing, returning, due times, and overdue penalties
- Title-level reservations and waiting lists
- QR-based attendance and occupancy monitoring
- Online printing requests, status, payment summaries, and consumable stock
- User accounts, notifications, and library clearance
- Operational dashboards and exportable reports

## Current delivery mode

This repository currently provides a presentation-ready prototype.

- Authentication uses institutional email, bcrypt, MySQL-backed server sessions, CSRF tokens, and server-enforced role guards.
- The frontend exposes student and librarian/admin workspaces.
- The interface is navigable and uses realistic domain data.
- The Express API exposes mock endpoints with stable response shapes.
- Buttons and forms demonstrate intended behavior but do not persist changes.
- No MySQL server, Prisma client, file storage, email/SMS provider, or payment service is required.

The mock-only status is visible in the UI where actions would normally create records or exports.

## Visual system

The frontend uses a strict three-color STI palette:

- STI blue: `#003399`
- STI yellow: `#FFF200`
- White: `#FFFFFF`

Opacity variations of these three colors provide borders, muted text, selected states, and surface hierarchy. Do not introduce gray, green, red, violet, or any additional brand/status color. Status meaning must also be communicated through labels, icons, and wording so it never depends on color alone.

## Architecture boundary

```text
Browser
  |
  +-- React application
       - Student routes
       - Librarian/admin routes
       - Responsive navigation and shared components
       - Mock-first interface state
  |
  +-- /api requests through Vite development proxy
       |
       +-- Express modular monolith
            - Dashboard
            - Catalog
            - Circulation
            - Reservations
            - Fines
            - Attendance
            - Printing
            - Inventory
            - Users
            - Clearance
            - Notifications
            - Reports
                 |
                 +-- Mock data repository now
                 +-- Prisma and MySQL repository later
```

All backend modules share one Node.js process and one future MySQL database. Module separation is organizational and enforces ownership; it does not create distributed services.

## Student navigation

| Route | Purpose |
| --- | --- |
| `/student/dashboard` | Account summary, current loan, print status, occupancy, recommendations, and quick actions |
| `/student/catalog` | Book discovery, filters, copy availability, shelf location, borrowing/reservation entry points |
| `/student/research` | Research/thesis discovery by title, department, author, and year |
| `/student/borrowing` | Current loans, return times, history, and fines summary |
| `/student/reservations` | Waiting-list position and pickup status |
| `/student/printing` | Print-request form and job progress/history |
| `/student/attendance` | Demo QR pass and visit history |
| `/student/notifications` | Due-date, reservation, printing, and system updates |
| `/student/clearance` | Computed standing and blocking-factor explanation |

## Librarian/admin navigation

| Route | Purpose |
| --- | --- |
| `/admin/dashboard` | KPI overview, weekly attendance, category demand, circulation, and occupancy |
| `/admin/catalog` | Books, physical copies, categories, and research records |
| `/admin/circulation` | Borrowing, return, due, and overdue monitoring |
| `/admin/reservations` | Title waiting lists and pickup readiness |
| `/admin/fines` | Penalties, payment status, and audit-ready export entry points |
| `/admin/inventory` | Barcode-level copy condition and audit status |
| `/admin/printing` | Print queue, status, price, and service volume |
| `/admin/supplies` | Ink, paper, printer assignment, and reorder thresholds |
| `/admin/attendance` | QR logs, occupancy, purposes, and peak usage |
| `/admin/users` | Users, roles, activation state, and clearance standing |
| `/admin/clearance` | Computed student standing and override entry points |
| `/admin/reports` | Attendance, circulation, inventory, printing, and fines reports |

## Core business rules

- Students may hold no more than two active physical book copies.
- Faculty/staff limits are configurable.
- Each `materials` record is one physical item with its own barcode and availability state.
- The default student loan is due at 8:59 AM on the next operating day.
- The proposed penalty is PHP 2.00 per overdue hour after the due cutoff and PHP 10.00 per day beginning the following day.
- Users with unreturned resources or unpaid fines are not cleared unless an authorized and documented override applies.
- Printing progresses from `pending` to `printing`, `ready_for_pickup`, and `completed`; cancellation is allowed before completion.
- Attendance retains the check-in time even when no check-out has been recorded.

The eventual backend must calculate and enforce these rules. The client interface must never be the authority for availability, due times, fines, print totals, roles, or clearance.

## Production transition

The mock layer is designed to be replaced without redesigning the user interface:

1. Add Prisma models and migrations based on `docs/schema-context.md`.
2. Define repository interfaces in each backend module.
3. Move existing mock access behind `Mock...Repository` implementations.
4. Add parallel `Prisma...Repository` implementations.
5. Select the repository through configuration while preserving route response shapes.
6. Add JWT authentication, password hashing, role middleware, request validation, file-storage integration, and tests.

The first database-backed vertical slice should be users, catalog titles, and physical copies. Circulation should follow only after those records and constraints are stable.
