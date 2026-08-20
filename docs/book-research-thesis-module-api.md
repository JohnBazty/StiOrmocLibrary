# Book and Research/Thesis Module - Implementation Contract

## Runtime boundary

This module follows the existing modular monolith and server-side session model. `System Administrator` is the stored database role corresponding to the API's effective `Admin` role. Administrative catalog routes accept only `System Administrator`/`Admin` and `Librarian`; other authenticated roles receive `403 CATALOG_ADMIN_FORBIDDEN`.

All mutation requests also pass through the application's CSRF middleware. SQL values are passed through `mysql2` prepared statements. User-supplied strings are never interpolated into a query.

## API contracts

| Method | Route | Role | Purpose |
|---|---|---|---|
| GET | `/api/catalog/search` | Authenticated | Unified book/research search with optional `q`, `scope`, `categoryId`, `author`, `publicationYear`, `availability`, `page`, and `limit` filters |
| GET | `/api/catalog/admin/categories` | Admin/Librarian | Category options |
| GET | `/api/catalog/admin/copies` | Admin/Librarian | Physical-copy register with accession, shelf, condition, availability, and last scan |
| POST | `/api/catalog/registry/parse` | Admin/Librarian | Normalize/check an ISBN, barcode, or accession scan and find a registry match |
| POST | `/api/catalog/books` | Admin/Librarian | Create a title and physical copy in one transaction |
| PUT | `/api/catalog/books/:titleId` | Admin/Librarian | Replace validated book bibliographic metadata |
| POST | `/api/catalog/books/:titleId/archive` | Admin/Librarian | Archive a book title and its copies; blocked for borrowed/overdue copies |
| DELETE | `/api/catalog/books/:titleId` | Admin/Librarian | Hard-delete only a title with no active loan and no physical copies |
| POST | `/api/catalog/research` | Admin/Librarian | Create and index a research/thesis record |
| PUT | `/api/catalog/research/:titleId` | Admin/Librarian | Replace validated research/thesis metadata |
| POST | `/api/catalog/research/:titleId/archive` | Admin/Librarian | Archive a research/thesis title |
| DELETE | `/api/catalog/research/:titleId` | Admin/Librarian | Hard-delete a research title with no physical copies/history |
| PATCH | `/api/inventory/copies/:copyId` | Admin/Librarian | Update shelf, condition, or availability with row locking |
| POST | `/api/inventory/copies/:copyId/archive` | Admin/Librarian | Archive a copy after an active-loan guard |
| DELETE | `/api/inventory/copies/:copyId` | Admin/Librarian | Delete a copy only when it has no active loan or borrowing history |
| GET | `/api/reports/catalog/inventory.csv` | Admin/Librarian | Stream a formula-safe CSV export using keyset batches |
| GET | `/api/reports/catalog/inventory.pdf` | Admin/Librarian | Stream a branded PDF inventory report |

The write contract uses JSON request bodies. Invalid body or filter data returns `422` with a stable error `code`; field validation uses `CATALOG_VALIDATION_FAILED` and `details.errors`.

## Critical transaction rule

Physical-copy deletion and archiving lock the copy row and query `borrow_transactions` in the same transaction. A `Borrowed` or `Overdue` transaction returns:

```json
{
  "success": false,
  "code": "PHYSICAL_COPY_HAS_ACTIVE_LOAN",
  "message": "Cannot archive/delete ... because it is currently borrowed/overdue."
}
```

The transaction is rolled back and released before the response; the protected mutation statement is not executed.

## Deployment prerequisite

Run `npm run db:migrate -w @sti-library/api` before using these endpoints. The checksum-tracked runner applies the additive catalog, category, reservation, and authentication migrations in order. It creates `titles`, `authors`, `research_records`, and `physical_copies` without deleting or silently remapping legacy `materials` rows. Complete and reconcile a legacy backfill before production cutover when legacy material rows exist.

The React CSV and PDF buttons use authenticated fetch requests so JWT-only and session logins both pass server RBAC. The API streams reports; it does not assemble the complete inventory in server memory.

## Verification

Run from the repository root:

```bash
npm test -w @sti-library/api
npm run typecheck
npm run build
```

Tests cover successful book/thesis transactions, `422` validation responses, Admin/Librarian RBAC, combined prepared query filters, CSV/PDF generation, and the borrowed/overdue mutation rollback rule.
