# API Reference

## Response shape

Successful mock endpoints return:

```json
{
  "success": true,
  "message": "Request completed",
  "data": {}
}
```

The Vite development server proxies `/api` to the Express server on port 4000.

## Book catalog and overview

All `/api/v1/catalog` routes require a valid Bearer JWT. Catalog reads allow Admin, Librarian, Student, and Faculty accounts.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/catalog/categories` | Exact category IDs and names currently managed by library administrators. |
| `GET` | `/api/v1/catalog/books` | Paginated live book catalog with physical-copy stock counts. |
| `GET` | `/api/v1/catalog/books/:titleId` | Complete metadata and current stock overview for one active book title. |
| `POST` | `/api/v1/catalog/books/:titleId/reservations` | Submit a Student or Faculty wait-list request through the circulation compatibility bridge. |
| `GET` | `/api/v1/catalog/research` | Search active view-only research by title, authors, adviser, department, and year. |
| `GET` | `/api/v1/catalog/research/:titleId` | Complete read-only research metadata, shelf access, and abstract. |
| `POST` | `/api/v1/admin/books/add-bulk` | Admin/Librarian-only transactional multi-copy registration; returns one QR image and Code 128 label image per accessioned copy. |
| `POST` | `/api/v1/admin/catalog/bulk-entry` | Canonical Admin/Librarian bulk-entry contract used by the database-driven catalog modal; preserves the older `/admin/books/add-bulk` alias. |
| `GET` | `/api/v1/admin/books/assets/:id` | Admin/Librarian-only physical-copy metadata with QR and barcode image data. |
| `GET` | `/api/v1/admin/books/assets/:id/barcode.png` | Download one high-density Code 128 PNG attachment. |
| `GET` | `/api/v1/admin/books/assets/:id/qr.png` | Download one high-density QR PNG attachment. |
| `GET` | `/api/v1/catalog/copies/:barcode` | Authenticated barcode-only copy inspection for cart/catalog views; deliberately omits QR data. |

Research routes expose no mutation, borrowing, reservation, or cart endpoint. Their response metadata and every record explicitly return `viewOnly: true`.

Asset visibility is also enforced at the query and response boundaries. Administrative asset routes select and serialize `physical_copies.qr_code_data`; the catalog copy route does neither. A Student or Faculty token receives a barcode image, title, author, accession, and shelf only, while attempts to use the administrative QR routes return `403`.

The list endpoint accepts any combination of `q`, `title`, `author`, `isbn`, `category_id`, `category_name`, `publication_year`, `page`, and `limit`. Query values are bound as prepared-statement parameters. Each item includes `totalCopiesCount`, `availableCopiesCount`, `currentAvailabilityStatus`, and its preferred active shelf location, calculated from `physical_copies` rather than cached UI state.

## Endpoints

| Method | Endpoint | Module | Response |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Core | Service and data-source status |
| `GET` | `/api/auth/csrf` | Authentication | Create/read the synchronizer CSRF token |
| `POST` | `/api/auth/login` | Authentication | Validate credentials and establish a role-based session |
| `POST` | `/api/v1/auth/register` | Authentication | Transactionally create a normalized Student account and academic profile |
| `POST` | `/api/v1/auth/login` | Authentication | Authenticate school ID, selected role, and password; issue a signed JWT |
| `POST` | `/auth/register` | Authentication | Create an active Student/Faculty account; Librarian requires Administrator session |
| `GET` | `/api/auth/me` | Authentication | Return the authenticated session user |
| `POST` | `/auth/logout` | Authentication | Destroy the session and redirect to the login screen |
| `GET` | `/api/dashboard/student` | Dashboard | Student summary and recommendations |
| `GET` | `/api/dashboard/admin` | Dashboard | KPIs, attendance, demand, and recent activity |
| `GET` | `/api/catalog/books` | Catalog | Current mock book-title listing |
| `POST` | `/api/catalog/books` | Catalog | Transactionally create a normalized title and physical copy; Librarian/System Administrator only |
| `GET` | `/api/catalog/research` | Catalog | Current mock research and thesis listing |
| `POST` | `/api/catalog/research` | Catalog | Transactionally create validated thesis metadata and optional physical manuscript copy; Librarian/System Administrator only |
| `GET` | `/api/circulation` | Circulation | Borrow and return transactions |
| `GET` | `/api/reservations` | Reservations | Waiting-list records |
| `GET` | `/api/fines` | Fines | Fine and payment-status records |
| `GET` | `/api/v1/fines/me` | Fines | Student/Faculty fine, infraction, and lost-book replacement history with balances |
| `GET` | `/api/v1/fines/receipts` | Fines | Student/Faculty cash receipt history |
| `GET` | `/api/v1/fines/receipts/:receiptId` | Fines | Read an owned digital receipt and its balance allocations |
| `GET` | `/api/v1/fines/receipts/:receiptId.pdf` | Fines | Stream an owned digital PDF cash receipt |
| `GET` | `/api/v1/admin/fines` | Fines | Filtered fine audit list and assessed, collected, waived, and outstanding summaries |
| `GET` | `/api/v1/admin/fines/terms` | Fines | List configured semesters for fine reports |
| `GET` | `/api/v1/admin/fines/report.pdf` | Fines | Export the active fine filters as a table-formatted PDF audit report |
| `POST` | `/api/v1/admin/fines/infractions` | Fines | Issue a documented non-circulation fine and notify the user |
| `POST` | `/api/v1/admin/fines/payments` | Fines | Allocate a cash payment and create one immutable digital receipt |
| `POST` | `/api/v1/admin/fines/:fineId/adjustments` | Fines | Append a documented waiver, reduction, or void |
| `GET` | `/api/v1/admin/fines/receipts/:receiptId` | Fines | Read any authorized receipt and its allocations |
| `GET` | `/api/v1/admin/fines/receipts/:receiptId.pdf` | Fines | Stream an authorized digital PDF receipt |
| `POST` | `/api/v1/admin/fines/receipts/:receiptId/reverse` | Fines | Reverse a receipt with a mandatory reason without deleting its audit record |
| `GET` | `/api/attendance` | Attendance | QR attendance logs |
| `GET` | `/api/v1/printing/service-status` | Printing | Service-level request acceptance state and optional pause reason |
| `GET` | `/api/v1/printing/pricing` | Printing | Server-side price rules |
| `GET` | `/api/v1/printing/requests` | Printing | Authenticated user's print history |
| `POST` | `/api/v1/printing/requests` | Printing | Validate and persist one PDF/DOCX multipart request |
| `PUT` | `/api/v1/printing/requests/:id/cancel` | Printing | Cancel an owned pending request |
| `GET` | `/api/v1/admin/printing/queue` | Printing | Filtered administrative queue |
| `GET` | `/api/v1/admin/printing/service-status` | Printing | Read the service-level acceptance state |
| `PATCH` | `/api/v1/admin/printing/service-status` | Printing | Pause or resume student print submissions |
| `POST` | `/api/v1/admin/printing/requests/:id/cash-payment` | Printing | Record exact counter cash payment |
| `PATCH` | `/api/v1/admin/printing/requests/:id/status` | Printing | Apply a valid queue transition |
| `GET` | `/api/v1/admin/printing/requests/:id/document` | Printing | Securely download the protected PDF/DOCX and audit the staff action |
| `GET` | `/api/v1/admin/printing/supplies` | Printing | Bottle and ream stock summary |
| `POST` | `/api/v1/admin/printing/supplies/ink` | Printing | Register an ink type with an initial whole-bottle quantity and required cost per bottle |
| `POST` | `/api/v1/admin/printing/supplies/ink/:id/restock` | Printing | Add whole bottles with a required server-validated cost per bottle |
| `POST` | `/api/v1/admin/printing/supplies/paper/:id/restock` | Printing | Add whole reams with a required server-validated cost per ream |
| `POST` | `/api/v1/admin/printing/supplies/ink/:id/use-bottle` | Printing | Deduct one unopened ink bottle and audit who loaded it and when |
| `POST` | `/api/v1/admin/printing/supplies/paper/:id/open-ream` | Printing | Deduct one unopened paper ream and audit who opened it and when |
| `POST` | `/api/v1/admin/printing/supplies/ink/:id/movements` | Printing | Record a whole-bottle movement |
| `POST` | `/api/v1/admin/printing/supplies/paper/:id/movements` | Printing | Record a ream movement |
| `GET` | `/api/v1/admin/printing/revenue/summary` | Printing | Paid requests, sheets, copies, and revenue for a daily, selected week-of-month, or monthly period |
| `GET` | `/api/v1/admin/printing/revenue/entries` | Printing | Paid request details without stock expenses |
| `GET` | `/api/v1/admin/printing/expenses/summary` | Printing | Ink, paper, and total restocking costs without revenue or net calculations |
| `GET` | `/api/v1/admin/printing/restocks` | Printing | Filtered restock history with unit costs and balance snapshots |
| `GET` | `/api/v1/admin/printing/stock-usage` | Printing | Manual bottle-loading and ream-opening audit records |
| `GET` | `/api/v1/admin/printing/reports/revenue.pdf` | Printing | Stream a revenue-only PDF containing requests, sheets, copies, and collected revenue |
| `GET` | `/api/v1/admin/printing/reports/stock-expenses.pdf` | Printing | Stream a restocking-expense PDF without revenue or net-impact columns |
| `GET` | `/api/v1/admin/printing/finance/*` | Printing | Deprecated combined-finance compatibility routes; not used by the active interface |
| `GET` | `/api/v1/admin/printing/report.pdf` | Printing | Stream a table-formatted queue PDF |
| `GET` | `/api/v1/admin/printing/supplies/report.pdf` | Printing | Stream a table-formatted supplies PDF |
| `GET` | `/api/inventory` | Inventory | Physical-copy audit records |
| `GET` | `/api/inventory/supplies` | Inventory | Ink and paper stock |
| `POST` | `/api/inventory/copies/:copyId/archive` | Inventory | Lock and archive an eligible copy; requires a body `reason` |
| `DELETE` | `/api/inventory/copies/:copyId` | Inventory | Lock and delete a never-circulated eligible copy |
| `POST` | `/api/inventory/thesis/:researchInventoryId/archive` | Inventory | Archive an idle bound research/thesis copy with a reason |
| `DELETE` | `/api/inventory/thesis/:researchInventoryId` | Inventory | Delete a never-used bound research/thesis copy |
| `GET` | `/api/users` | Users | Demo user records |
| `GET` | `/api/clearance` | Clearance | Demo user's computed standing |
| `GET` | `/api/notifications` | Notifications | Student notifications |
| `GET` | `/api/reports` | Reports | Report-template definitions |

## Database integration rule

Keep endpoint paths and response objects stable while replacing the mock arrays with repository calls. Mutating endpoints must later add server-side validation, authorization, database transactions, and audit records before they are used with real school data.

## Catalog validation and physical-copy safeguards

Book and thesis creation require an authenticated CSRF token and Librarian or System Administrator role. Thesis metadata validates Title, one or more Authors, Adviser, Year Published, Abstract, Research Code, and Department/Program before beginning the insert transaction.

Physical-copy archive/delete routes lock the `physical_copies` row and matching `borrow_transactions` rows with `FOR UPDATE`. A `Borrowed` or `Overdue` transaction returns:

```json
{
  "success": false,
  "code": "PHYSICAL_COPY_HAS_ACTIVE_LOAN",
  "message": "Cannot delete copy ACC-00042 because it is currently overdue. Process its return before trying again.",
  "details": {
    "physicalCopyId": 7,
    "materialId": 42,
    "transactionId": 1047,
    "transactionStatus": "Overdue"
  }
}
```

The response status is `422 Unprocessable Entity`. A copy with completed borrowing history may be archived but cannot be hard-deleted.
# Cross-portal circulation (JWT)

| Method | Endpoint | Roles | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/reservations/request` | Student, Faculty | Join a book-title waiting queue. |
| `GET` | `/api/v1/reservations` | Student, Faculty | Read the authenticated user's reservation records. |
| `PUT` | `/api/v1/reservations/:reservationId/cancel` | Student, Faculty | Cancel an owned waiting request and realign the queue. |
| `GET` | `/api/v1/borrowing/history` | Student, Faculty | Read personal capacity and borrowing history. |
| `POST` | `/api/v1/borrow/submit-request` | Student, Faculty | Atomically assign available copies and create a grouped pending-claim request from `title_ids`. |
| `GET` | `/api/v1/admin/reservations` | Admin, Librarian | Read the contextual reservation queue. |
| `POST` | `/api/v1/admin/borrowing/confirm-checkout` | Admin, Librarian | Confirm a barcode checkout. |
| `GET` | `/api/v1/admin/borrowing/monitor` | Admin, Librarian | Read active, due, overdue, and returned records. |
| `PUT` | `/api/v1/admin/borrowing/:transactionId/return` | Admin, Librarian | Complete a return and advance the queue. |
| `POST` | `/api/v1/admin/borrowing/:transactionId/calculate-penalty` | Admin, Librarian | Persist the current overdue calculation. |
| `GET` | `/api/v1/admin/notifications` | Admin, Librarian | Read shared circulation/reservation alerts. |
### POST `/api/v1/circulation/fulfill-claim`

Admin/Librarian-only physical desk checkpoint. Accepts `{ "school_id": "...", "barcode": "..." }`. The selected borrower and barcode must match a linked `Pending` claim whose reservation is `ready_for_pickup`. On success the loan becomes `Borrowed`, the reservation becomes `claimed`, and the due time is fixed to 8:59 AM on the next operating day.

## Admin attendance and active users (JWT)

| Method | Endpoint | Roles | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/admin/attendance/academic-terms` | Admin, Librarian | List configured semester date ranges. |
| `GET` | `/api/v1/admin/attendance/summary` | Admin, Librarian | Aggregate visits, unique visitors, current presence, peak hour, and average duration. |
| `GET` | `/api/v1/admin/attendance/logs` | Admin, Librarian | Paginated attendance logs filtered daily, weekly, monthly, or by academic term. |
| `GET` | `/api/v1/admin/attendance/report.pdf` | Admin, Librarian | Stream a branded PDF using the same active filters as the dashboard. |
| `GET` | `/api/v1/admin/users/summary` | Admin, Librarian | Count active Student, Faculty, and staff accounts. |
| `GET` | `/api/v1/admin/users/programs` | Admin, Librarian | List program/unit values for active-account filtering. |
| `GET` | `/api/v1/admin/users/active` | Admin, Librarian | Paginated read-only directory where `accounts.account_status = 'Active'`. |
### ISBN metadata lookup

`GET /api/v1/admin/books/isbn/:isbn` is restricted to Admin and Librarian JWTs. It validates ISBN-10/ISBN-13 checksums, searches the local `titles`/`authors` catalog first, then queries Google Books and Open Library through fixed server-side endpoints. The response supplies only `title`, `author`, `publisher`, and `publicationYear` for the bulk-entry autofill workflow. Catalog creation remains a separate explicit transaction, and cover, copies, category, call number, and shelf location are never populated by the lookup.
