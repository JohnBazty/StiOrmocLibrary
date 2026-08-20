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
| `GET` | `/api/attendance` | Attendance | QR attendance logs |
| `GET` | `/api/printing` | Printing | Printing queue records |
| `POST` | `/api/printing` | Printing | Returns a generated mock request without persistence |
| `GET` | `/api/inventory` | Inventory | Physical-copy audit records |
| `GET` | `/api/inventory/supplies` | Inventory | Ink and paper stock |
| `POST` | `/api/inventory/copies/:copyId/archive` | Inventory | Lock and archive an eligible copy; requires a body `reason` |
| `DELETE` | `/api/inventory/copies/:copyId` | Inventory | Lock and delete a never-circulated eligible copy |
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
