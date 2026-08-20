# SmartLib Inventory Management Implementation

## Module boundary

Inventory is a feature module inside the existing Node.js and Express modular monolith. It does not own bibliographic records or circulation policy:

- `catalog` owns titles, authors, categories, research metadata, and creation of physical copies.
- `inventory` owns barcode verification, physical condition overrides, copy-register queries, and audit history.
- `circulation` and `reservations` remain authoritative for Borrowed and Reserved availability.
- `reports` owns reusable streaming CSV and PDF rendering. Inventory exposes secured aliases for physical-copy reports.

The React implementation lives in `apps/web/src/features/inventory`. The API implementation lives in `apps/api/src/modules/inventory`. Both clients use `/api/inventory`; no separate service, database, or duplicate application is introduced.

## Data mapping and lifecycle

```text
titles (shared catalog metadata)
  1
  |
  +--< physical_copies (one accession/barcode per physical asset)
           |
           +-- material_id -> legacy circulation compatibility
           +-- last_scanned_at -> latest verification shown in the UI
           +--< inventory_audit_events (append-only history)

borrow_transactions + reservations -> authoritative loan/reservation locks
```

| UI field | Database source |
|---|---|
| Item Title | `titles.title` |
| Accession Number | `physical_copies.accession_number` |
| Barcode | `physical_copies.barcode` |
| Shelf | `physical_copies.shelf_location` |
| Condition | `physical_copies.condition_status` |
| Availability | `physical_copies.availability_status` |
| Last Verified | `physical_copies.last_scanned_at` |

`material_id` is preserved as the compatibility bridge to existing borrow and reservation records. Inventory never changes or reassigns that identifier.

## API contracts

All endpoints require an authenticated System Administrator/Admin or Librarian. Validation errors use HTTP 422, missing barcodes use 404, and unauthorized roles use 403.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/inventory/summary` | Active catalog/copy, damaged, and lost totals |
| `GET` | `/api/inventory/copies` | Paginated physical-copy register |
| `POST` | `/api/inventory/scans` | Verify a barcode and append a `Verified` event |
| `PATCH` | `/api/inventory/copies/condition` | Set `damaged` or `lost` and make the copy unavailable |
| `GET` | `/api/inventory/export.csv` | Stream physical-copy CSV |
| `GET` | `/api/inventory/export.pdf` | Stream branded physical-copy PDF |

Copy lists return `{ success, data, meta.pagination }`. `page` defaults to 1, `limit` defaults to 25, and the limit is capped at 100. Optional filters are `q`, `condition_state`, and `availability_status`.

Scanner body:

```json
{ "barcode": "BC-00042" }
```

Condition body:

```json
{ "barcode": "BC-00042", "condition_state": "damaged" }
```

The service locks the physical copy before mutation. Borrowed, Overdue, or actively reserved copies are rejected and the transaction is rolled back. A successful Damaged/Lost override writes `availability_status='Unavailable'`, updates the last verification timestamp, increments `row_version`, and records the before/after values in `inventory_audit_events`.

## Desktop scanner workflow

`useDesktopScanner` listens for fast keyboard-wedge input terminated by Enter. It ignores standard typing inside inputs, textareas, selects, and editable elements unless an element explicitly opts into scanner capture. A valid scan calls the API without navigation, updates `last_scanned_at`, refreshes the affected register, and shows a confirmation message.

## Development preview mode

Preview mode exists only for local layout and navigation evaluation. It must never be enabled in production.

1. In `apps/api/.env`, set `INVENTORY_PREVIEW_ENABLED=true`.
2. Start Vite with `VITE_INVENTORY_MOCK_AUTH=true` in its environment.
3. Run `npm run dev` and open `/admin/inventory`.

The React context exposes this in-memory preview identity:

```json
{ "user_id": null, "username": "admin_authenticated", "role": "Admin", "school_id": "" }
```

The server registers the session bootstrap only when `NODE_ENV` is not production and the explicit server flag is enabled. It accepts only loopback requests from the configured web origin, regenerates the session, and issues a CSRF token. Normal JWT/session authorization remains active for every Inventory API endpoint.

## Visual and accessibility rules

The module uses only `#003399`, `#FFF200`, and `#FFFFFF`, including opacity variants. Good, Damaged, and Lost states use different labels, icons, borders, and fill treatments, so meaning does not rely on color alone. The table includes a complete empty state, keyboard-accessible actions, progress labels, alerts, and modal semantics.

## Migration and operation

Run all migrations in order:

```powershell
npm run db:migrate -w @sti-library/api
```

Migration `20260820_006_inventory_audit_events.sql` is additive. It does not rewrite title, copy, material, loan, or reservation identifiers. `/api/health` reports `DATABASE_MIGRATION_REQUIRED` until the audit table and required columns are present.

