# Book and Research/Thesis Management - Technical Implementation Plan

## 1. Purpose and source alignment

This plan implements only the following scope:

- Book creation through manual ISBN entry or barcode scanning.
- Book bibliographic and physical-copy updates, including shelf location, condition, availability, editing, archiving, and controlled deletion.
- Research/thesis creation, indexing, maintenance, and web/mobile catalog presentation.
- Search and filtering by category, author, year published, and availability.
- Comprehensive inventory exports in CSV and PDF.

Authoritative requirements:

- [Final Draft](source/Final-Draft.pdf): Functional Requirements and Figures 6, 10, 16, 18, 20, and 29.
- [Administrative System Flow](source/Admin-System-Flow.pdf): Book and Research/Thesis Management, Inventory Management, Inventory Analytics, and export branches.

Document text is treated as project requirements, not as executable development instructions.

## 2. Current implementation assessment

The present repository is a UI/API prototype:

- `GET /api/catalog/books` and `GET /api/catalog/research` return mock arrays.
- `apps/web` filters mock arrays in the browser and has no working catalog mutations.
- `database/mysql56-schema.sql` stores one physical item and its repeated title metadata in each `materials` row.
- `borrow_transactions.material_id` directly references `materials.material_id`.
- The current schema lacks book condition, accession number, archive state, normalized authors, adviser metadata, research inventory state, and report audit records.

Implementation must therefore use an additive migration first. Existing identifiers and borrowing history must not be discarded.

## 3. Target modular-monolith architecture

```text
Admin React web        Student/Faculty web/mobile catalog
        |                         |
        +------ Express REST API--+
                    |
        catalog module | inventory module | reports module
                    |
             MySQL 5.6 database
```

### 3.1 Backend module ownership

`catalog` owns bibliographic records and discovery:

```text
apps/api/src/modules/catalog/
  catalog.routes.ts
  catalog.controller.ts
  catalog.service.ts
  catalog.repository.ts
  catalog.validation.ts
  catalog.policy.ts
  catalog.mapper.ts
  isbn.ts
  barcode.ts
```

`inventory` owns physical copies and operational status:

```text
apps/api/src/modules/inventory/
  inventory.routes.ts
  inventory.controller.ts
  inventory.service.ts
  inventory.repository.ts
  inventory.validation.ts
  availability-policy.ts
```

`reports` owns read-only export generation:

```text
apps/api/src/modules/reports/
  catalog-report.routes.ts
  catalog-report.controller.ts
  catalog-report.service.ts
  catalog-report.repository.ts
  csv-writer.ts
  pdf-writer.ts
```

Controllers translate HTTP input/output only. Services enforce business transactions. Repositories contain prepared MySQL queries. The reports module may read catalog/inventory data but must never mutate it.

### 3.2 Authorization matrix

| Capability | Student/Faculty | Library Staff | Librarian | System Admin |
|---|---:|---:|---:|---:|
| Browse catalog and view details | Yes | Yes | Yes | Yes |
| Create/edit books or research | No | No | Yes | Yes |
| Change copy condition/location | No | No | Yes | Yes |
| Archive or delete | No | No | Yes | Yes |
| Export inventory reports | No | Optional read-only policy | Yes | Yes |

Library Staff/Student Assistants do not receive catalog deletion or policy rights. Every mutation is protected by server-side RBAC and CSRF middleware.

## 4. Target database model

The target separates reusable title metadata from individual physical copies. It remains compatible with MySQL 5.6, InnoDB, and `DEFAULT CHARSET=utf8`.

```text
categories --< catalog_records --< catalog_record_authors >-- authors
                    |  |
                    |  +-- book_details
                    |       |
                    |       +--< material_copies --< borrow_transactions
                    |
                    +-- research_theses

catalog_records --< catalog_change_logs
report_exports
```

### 4.1 `catalog_records`

One row represents one discoverable book edition or one research/thesis work.

| Column | MySQL 5.6 type | Rule |
|---|---|---|
| `catalog_record_id` | `BIGINT UNSIGNED` | Primary key, auto-increment |
| `category_id` | `INT UNSIGNED NULL` | FK to `categories`, `ON DELETE SET NULL` |
| `record_type` | `ENUM('Book','Research/Thesis')` | Required |
| `title` | `VARCHAR(255)` | Required |
| `normalized_title` | `VARCHAR(255)` | Lowercased searchable form maintained by API |
| `publication_year` | `SMALLINT UNSIGNED NULL` | Four-digit year validation in API |
| `publisher` | `VARCHAR(255) NULL` | Used for book details and APA output |
| `cover_image_path` | `VARCHAR(500) NULL` | File/object reference only |
| `search_text` | `TEXT` | Derived title, author, ISBN, department, and keywords cache |
| `lifecycle_status` | `ENUM('Active','Archived')` | Archived rows excluded from normal discovery |
| `created_by_user_id` | `BIGINT UNSIGNED` | FK to `users`, `ON DELETE RESTRICT` |
| `updated_by_user_id` | `BIGINT UNSIGNED NULL` | FK to `users`, `ON DELETE SET NULL` |
| `archived_by_user_id` | `BIGINT UNSIGNED NULL` | FK to `users`, `ON DELETE SET NULL` |
| `archived_at` | `DATETIME NULL` | Archive timestamp |
| `archive_reason` | `VARCHAR(255) NULL` | Required when archiving |
| `row_version` | `INT UNSIGNED` | Optimistic concurrency, starts at 1 |
| `created_at` | `TIMESTAMP` | Defaults to current timestamp |
| `updated_at` | `DATETIME NULL` | Set by application |

Indexes:

- `FULLTEXT KEY ft_catalog_search (title, search_text)` for normal text search.
- `KEY idx_catalog_filters (record_type, category_id, publication_year, lifecycle_status)`.
- `KEY idx_catalog_title (normalized_title(191))`.

MySQL 5.6 has no usable native JSON contract for this project and no generated-column dependency should be introduced. The service explicitly refreshes `normalized_title` and `search_text` in the same transaction as metadata changes.

### 4.2 `authors` and `catalog_record_authors`

`authors`:

- `author_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `display_name VARCHAR(255) NOT NULL`
- `normalized_name VARCHAR(255) NOT NULL`
- unique/indexed normalized name

`catalog_record_authors`:

- `catalog_record_id BIGINT UNSIGNED NOT NULL`
- `author_id BIGINT UNSIGNED NOT NULL`
- `author_order SMALLINT UNSIGNED NOT NULL`
- composite primary key `(catalog_record_id, author_id)`
- unique key `(catalog_record_id, author_order)`
- cascading delete only from the link when a never-used catalog record is hard-deleted

This supports multiple authors and exact author filtering without storing comma-separated values as the source of truth.

### 4.3 `book_details`

One-to-one extension for book-specific metadata:

| Column | Type | Rule |
|---|---|---|
| `catalog_record_id` | `BIGINT UNSIGNED` | PK/FK to `catalog_records` |
| `isbn` | `VARCHAR(17) NULL` | Normalized ISBN-10 or ISBN-13; unique when present |
| `edition` | `VARCHAR(100) NULL` | Optional |
| `call_number` | `VARCHAR(100) NULL` | Searchable inventory field |

ISBN is stored without spaces or hyphens after checksum validation. A duplicate ISBN means the librarian is adding another physical copy of the existing edition, not a second title record.

### 4.4 `material_copies`

One row represents one individually scannable book copy.

| Column | Type | Rule |
|---|---|---|
| `material_copy_id` | `BIGINT UNSIGNED` | PK; preserves/matches legacy `material_id` during migration |
| `catalog_record_id` | `BIGINT UNSIGNED` | FK to `catalog_records`, `ON DELETE RESTRICT` |
| `barcode` | `VARCHAR(100)` | Required and globally unique |
| `accession_number` | `VARCHAR(100) NULL` | Unique when present |
| `shelf_location` | `VARCHAR(100)` | Required |
| `condition_status` | `ENUM('New','Good','Fair','Damaged','For Repair','Lost')` | Required |
| `availability_status` | `ENUM('Available','Borrowed','Reserved','Unavailable','Archived')` | Service-controlled state |
| `acquired_at` | `DATE NULL` | Optional |
| `last_scanned_at` | `DATETIME NULL` | Inventory audit tracking |
| `lifecycle_status` | `ENUM('Active','Archived')` | Required |
| archive/audit/version columns | Same pattern as `catalog_records` | Required for history/concurrency |

Indexes:

- unique barcode and accession number.
- `(catalog_record_id, lifecycle_status, availability_status)` for copy totals.
- `(availability_status, condition_status)` for inventory filters/reports.
- `shelf_location` and `last_scanned_at` indexes.

`availability_status` is a synchronized cache. Its source rules are active borrowing/reservation records, lifecycle state, and condition:

1. Active `Borrowed` or `Overdue` transaction -> `Borrowed`.
2. Ready/active reservation holding the copy -> `Reserved`.
3. Archived copy -> `Archived`.
4. Damaged, For Repair, or Lost condition -> `Unavailable`.
5. Otherwise -> `Available`.

The client may not directly label an item Borrowed or Reserved. A librarian may restore `Available` or set `Unavailable` only when no active borrowing/reservation conflicts exist.

### 4.5 `research_theses`

One-to-one extension for research/thesis metadata:

| Column | Type | Rule |
|---|---|---|
| `catalog_record_id` | `BIGINT UNSIGNED` | PK/FK to `catalog_records` |
| `research_code` | `VARCHAR(100)` | Required and unique |
| `adviser_name` | `VARCHAR(255)` | Required |
| `department_or_program` | `VARCHAR(150)` | Required |
| `abstract_text` | `MEDIUMTEXT` | Required |
| `keywords_text` | `TEXT NULL` | Search cache for keywords |
| `shelf_location` | `VARCHAR(100)` | Required physical location |
| `inventory_status` | `ENUM('Available for Viewing','Missing','Archived')` | Research is view-only |
| `last_scanned_at` | `DATETIME NULL` | Inventory audit timestamp |

Research/thesis records cannot be borrowed. The public/mobile representation returns `viewOnly: true` and never exposes a borrow action.

### 4.6 `catalog_change_logs`

Audit every create, edit, condition/location update, archive, restore, and delete:

- `change_log_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `catalog_record_id BIGINT UNSIGNED NULL`
- `material_copy_id BIGINT UNSIGNED NULL`
- `action_type ENUM('Create','Update','Archive','Restore','Delete')`
- `changed_by_user_id BIGINT UNSIGNED`
- `change_summary TEXT NOT NULL`
- `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

The log stores a concise field-change summary, not passwords or uploaded file bodies.

### 4.7 `report_exports`

- `report_export_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `requested_by_user_id BIGINT UNSIGNED NOT NULL`
- `report_scope ENUM('Books','Research/Thesis','All')`
- `output_format ENUM('CSV','PDF')`
- `filters_text TEXT NULL` containing a serialized, server-generated filter snapshot
- `row_count INT UNSIGNED NOT NULL`
- `generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

This is an audit record. Generated reports may be streamed directly and do not need to be permanently stored.

## 5. Migration strategy from `materials`

Create `database/migrations/202608xx_002_catalog_normalization.sql` and test it against a disposable copy of the current database.

1. Create the new tables without dropping or renaming `materials`.
2. Backfill `catalog_records`:
   - Book rows group by normalized ISBN when ISBN exists.
   - Books without ISBN group by normalized title, author, publication year, and category.
   - Each Thesis/Manuscript row becomes one research/thesis catalog record unless a verified research code identifies duplicates.
3. Backfill normalized authors and link tables.
4. Create `book_details`, `research_theses`, and `material_copies`.
5. Set `material_copies.material_copy_id` equal to the former `materials.material_id` so borrowing identifiers remain stable.
6. Add `borrow_transactions.material_copy_id`, backfill it from `material_id`, add the new FK/index, and update API reads.
7. Run reconciliation queries: source row count, copy count, active-loan count, duplicate barcode count, and orphan count must match expectations.
8. Deploy API dual-read compatibility for one release if existing clients still use `material_id`.
9. Only after verification, make `material_copy_id` required and retire the legacy FK/columns in a later migration.

No migration may hard-delete the current catalog or borrowing history.

## 6. Backend API contract

All list responses use `{ success, data, meta }`. Validation failures use HTTP 422; duplicates use 409; missing records use 404; authorization failures use 403.

### 6.1 Catalog discovery

| Method and route | Purpose |
|---|---|
| `GET /api/catalog/search` | Unified books/research discovery for web and mobile |
| `GET /api/catalog/books` | Paginated books with aggregated copy counts |
| `GET /api/catalog/books/:recordId` | Book metadata and physical copies |
| `GET /api/catalog/books/lookup/isbn/:isbn` | Validate ISBN and resolve an existing edition before Add Copy |
| `GET /api/catalog/research` | Paginated research/thesis list |
| `GET /api/catalog/research/:recordId` | Full view-only research/thesis metadata |
| `GET /api/catalog/categories` | Category filter options with record counts |
| `GET /api/inventory/scan/:barcode` | Resolve a scanned copy barcode |

Unified search parameters:

```text
scope=all|books|research
q=<title, author, ISBN, barcode, research code, or keywords>
categoryId=<id>
authorId=<id>
yearFrom=<yyyy>
yearTo=<yyyy>
availability=<status>
sort=relevance|title_asc|year_desc|year_asc
page=<positive integer>
limit=<1..100>
```

Archived records are excluded unless an authorized administrator passes `includeArchived=true`.

### 6.2 Book mutations

| Method and route | Purpose |
|---|---|
| `POST /api/catalog/books` | Create a book edition and first copy atomically |
| `POST /api/catalog/books/:recordId/copies` | Add another uniquely barcoded copy |
| `PATCH /api/catalog/books/:recordId` | Edit shared bibliographic data |
| `PATCH /api/inventory/copies/:copyId` | Update shelf, condition, accession, or allowed availability |
| `POST /api/inventory/copies/:copyId/archive` | Archive one copy after guard checks |
| `POST /api/catalog/books/:recordId/archive` | Archive a title and eligible copies |
| `POST /api/catalog/books/:recordId/restore` | Restore an archived title |
| `DELETE /api/inventory/copies/:copyId` | Hard-delete only a never-circulated, unreserved copy |
| `DELETE /api/catalog/books/:recordId` | Hard-delete only an empty, never-referenced title |

Create-book request:

```json
{
  "entryMode": "isbn_scan",
  "isbn": "9780132350884",
  "barcode": "BC-00128",
  "title": "Clean Code",
  "authors": ["Robert C. Martin"],
  "categoryId": 1,
  "publicationYear": 2008,
  "publisher": "Prentice Hall",
  "shelfLocation": "IT-A12",
  "condition": "Good",
  "accessionNumber": "ACC-2026-0128"
}
```

`entryMode` is `isbn_scan`, `barcode_scan`, or `manual`. Scanning does not bypass required-field validation.

### 6.3 Research/thesis mutations

| Method and route | Purpose |
|---|---|
| `POST /api/catalog/research` | Create and index research/thesis metadata |
| `PATCH /api/catalog/research/:recordId` | Update metadata and search index |
| `POST /api/catalog/research/:recordId/archive` | Archive and hide from public discovery |
| `POST /api/catalog/research/:recordId/restore` | Restore archived research |
| `DELETE /api/catalog/research/:recordId` | Hard-delete only a never-referenced draft/error record |

Required create fields are Title, one or more Authors, Adviser, Year Published, Abstract, Department/Program, category, research code, and shelf location.

### 6.4 Reporting

| Method and route | Purpose |
|---|---|
| `GET /api/reports/catalog/inventory.csv` | Stream filtered inventory CSV |
| `GET /api/reports/catalog/inventory.pdf` | Stream branded inventory PDF |

Both endpoints accept `scope`, category, author, year, availability, condition, and archive filters. The API re-runs the authoritative query; it never trusts row data sent from the browser.

## 7. Validation and transaction rules

### 7.1 ISBN and barcode entry

- Strip ISBN spaces and hyphens, permit only valid ISBN-10/ISBN-13 characters, and verify the checksum.
- Normalize custom barcodes with trim and uppercase rules; reject control characters and enforce a practical maximum length.
- Barcode must be globally unique. Return 409 with the existing copy summary when duplicated.
- ISBN duplication resolves to the existing book edition and opens the Add Copy flow.
- USB scanners work as keyboard-wedge input ending with Enter. Camera scanning uses the browser scanner adapter and returns the same normalized string.
- An external ISBN metadata lookup is optional behind an adapter; manual confirmation remains required and the module must work without that service.

### 7.2 Edit concurrency

Every edit sends `rowVersion`. The update uses:

```sql
UPDATE ...
SET ..., row_version = row_version + 1
WHERE id = ? AND row_version = ?;
```

Zero affected rows returns 409 `CATALOG_RECORD_CHANGED`, prompting the user to reload instead of overwriting another librarian's update.

### 7.3 Archive/delete guard

The service executes the guard in one database transaction:

1. Lock the copy and its active circulation rows using `SELECT ... FOR UPDATE`.
2. If any transaction is `Borrowed` or `Overdue`, return HTTP 409 `BOOK_CURRENTLY_BORROWED` with transaction and due-date context.
3. If an active reservation exists, return 409 `BOOK_HAS_ACTIVE_RESERVATION`.
4. If historical borrowing/reservation references exist, reject hard deletion and offer archive instead.
5. Hard-delete only a never-circulated copy. Delete a title only when no copies or historical references remain.
6. Write the archive/delete audit entry in the same transaction.

This prevents a race where a borrow operation starts while deletion validation is running. Database foreign keys remain `RESTRICT` as the final safety layer.

## 8. Search and filtering implementation

Search uses one server-side algorithm for admin web, user web, and mobile.

1. Normalize `q`: Unicode-safe trim, collapse spaces, and lowercase a comparison copy.
2. Detect exact identifiers first:
   - normalized ISBN -> `book_details.isbn` unique lookup;
   - barcode -> `material_copies.barcode` unique lookup;
   - research code -> `research_theses.research_code` unique lookup.
3. For ordinary text, use `MATCH(title, search_text) AGAINST (? IN BOOLEAN MODE)`.
4. For very short terms or zero full-text matches, use escaped prefix/substring `LIKE` fallback against normalized title and author fields.
5. Apply category, author, year range, availability, lifecycle, and scope filters as prepared-statement predicates.
6. Aggregate book availability by title using active copies; research results map inventory status to viewing availability.
7. Sort exact identifiers first, then relevance, then title for deterministic output.
8. Return paginated results and filter counts. Limit is capped at 100.

Availability semantics:

- Book filter `Available` means at least one active copy is available.
- Book `Borrowed` or `Reserved` filters mean at least one copy is in that state.
- Research `Available` means `Available for Viewing`; research never appears as borrowable.

Performance target for the campus-sized collection is p95 below 500 ms with 10,000 catalog records and common filters. Validate with `EXPLAIN` and seeded load tests.

## 9. Frontend view requirements

All new screens use only `#003399`, `#FFF200`, and `#FFFFFF`, including opacity variants. Statuses always include text/icons, never color alone.

### 9.1 Admin web - Books and Research/Thesis Management

Route: `/admin/catalog`

Header actions:

- Add Book
- Add Research/Thesis
- Export CSV
- Export PDF

Book tab:

- Search title, author, ISBN, barcode, accession, or call number.
- Filter chips/dropdowns for Category, Author, Year Published, Availability, Condition, and Archived.
- Table columns: Barcode, Accession Number, Title, Author, ISBN, Category, Year, Shelf Location, Condition, Availability, Date Added, and Actions.
- Title rows may expand to show all physical copies and real-time available/total counts.
- Row actions: View, Edit Bibliographic Data, Edit Copy, Add Copy, Archive, Restore, and Delete when eligible.
- Blocked deletion dialog must explain the active borrower/transaction and offer Cancel, View Borrowing, or Archive After Return guidance. It must never hide a failed API guard.

Research/Thesis tab:

- Search by Title, Author, Department/Program, Research Code, and keywords.
- Filter by Category, Author, Department, Year Published, Viewing Availability, and Archived.
- Table columns: Research ID, Title, Author(s), Adviser, Year, Department, Shelf, Availability, Date Added, and Actions.
- Detail drawer displays complete abstract, keywords, APA citation, inventory state, and audit timestamps.
- Analytics cards/charts show total research, department/program distribution, year-published trends, and missing/archived records as required by Figure 18.

Add Book wizard:

1. Select Scan ISBN, Scan Barcode, or Manual Entry.
2. Capture/validate the identifier and display duplicate status.
3. Enter or confirm bibliographic fields.
4. Enter physical-copy fields: unique barcode, accession number, shelf, and condition.
5. Review and save.
6. On success, show the created title/copy and offer Add Another Copy.

Add Research/Thesis form:

- Title, repeatable Author inputs, Adviser, Year Published, Abstract, Department/Program, Category, Research Code, Shelf Location, Keywords, and Viewing Availability.
- Show inline validation and an APA citation preview before save.

### 9.2 Web/mobile catalog views

The read API is shared. The current responsive web catalog can consume it immediately; the dedicated React Native client uses the same DTOs later.

Unified discovery view:

- Search field with All, Books, and Research/Thesis scope selector.
- Filter sheet/drawer for Category, Author, Year Published, and Availability.
- Result cards label the record type and show title, author, year, category, and availability.

Book details:

- Cover, Title, Author, ISBN, Category, Publisher, Year, Shelf Location, available/total copy counts, condition summary, and APA citation.
- Borrow/reserve actions belong to the circulation module; this module only returns eligibility-facing availability.

Research/thesis details:

- Title, Authors, Adviser, Year Published, Department/Program, Category, Abstract, Keywords, Shelf Location, Availability for Viewing, and APA citation.
- Display a clear View Only notice; no borrow button is rendered.

Kiosk implementation is not a separate deliverable in this phase, but it can reuse these public catalog endpoints without API redesign.

## 10. Inventory report requirements

### 10.1 CSV

- UTF-8 CSV with a header row and one record per physical book copy or research item.
- Book columns include record/copy IDs, barcode, accession number, title, authors, ISBN, category, year, shelf, condition, availability, lifecycle, and dates.
- Research columns include research code, title, authors, adviser, department, year, category, shelf, viewing status, lifecycle, and dates.
- Escape formulas beginning with `=`, `+`, `-`, or `@` to prevent spreadsheet formula injection.
- Stream in primary-key chunks rather than loading the entire inventory into memory.

### 10.2 PDF

- A4 landscape layout with STI header, generated timestamp in Asia/Manila, requester, active filters, and page numbers.
- Summary section: total titles, total copies, available, borrowed, reserved, unavailable, damaged/repair/lost, archived, and total research/theses.
- Detail tables with repeating headers and readable wrapping.
- Research appendix grouped by department/program and year.
- Use a server-side PDF library such as PDFKit; sanitize all user-entered content before rendering.

Headers include safe `Content-Disposition` filenames such as `smartlib-inventory-2026-08-16.csv`. Each successful export writes `report_exports` with requester, filters, format, and row count.

## 11. Testing and acceptance criteria

### Backend tests

- Valid and invalid ISBN-10/ISBN-13 checksum cases.
- Barcode normalization and duplicate conflicts.
- Existing ISBN creates a copy instead of a duplicate title.
- Prepared search/filter queries for every required filter and combined filters.
- Book and research pagination and archived exclusion.
- Copy status derivation for borrowed, reserved, damaged, lost, and archived states.
- RBAC and CSRF rejection for every mutation/export route.
- Optimistic concurrency conflicts.
- Deletion blocked for Borrowed and Overdue items.
- Deletion/borrow race test proves the row lock prevents inconsistent state.
- Historical items can be archived but not hard-deleted.
- CSV formula-injection escaping and correct column count.
- PDF generation opens successfully and contains expected totals/headers.

### Frontend tests

- Scanner/manual wizard states and duplicate identifier recovery.
- Required-field, year, ISBN, and barcode validation.
- Combined filters persist in the URL and can be cleared.
- Loading, empty, offline/error, unauthorized, stale-edit, and deletion-conflict states.
- Responsive admin table/drawer and mobile detail views.
- Keyboard navigation, visible focus, accessible labels, and status text.

### Definition of done

- No catalog screen imports mock book/research arrays.
- All catalog writes persist through MySQL transactions.
- Existing borrow records still resolve to the same physical copies after migration.
- Search/filter behavior is identical across admin web, user web, and mobile DTOs.
- Borrowed books cannot be deleted even under concurrent requests.
- CSV and PDF exports match the selected filters and inventory totals.
- Schema context, API reference, and migration rollback/recovery instructions are updated.

## 12. Delivery sequence

1. **Schema and migration:** add normalized catalog/copy/research/audit/report tables and verify reconciliation.
2. **Repository and service layer:** replace mock catalog reads, implement DTOs, validation, policies, and transactions.
3. **Book operations:** scanner/manual create, add-copy, edit, availability/condition updates, archive/delete guards.
4. **Research/thesis operations:** create/edit/archive, indexing, analytics queries, and view-only DTOs.
5. **Unified search:** full-text/identifier search, required filters, pagination, and performance tests.
6. **Admin frontend:** management tabs, forms, scanner integration, conflict dialogs, and analytics.
7. **Web/mobile catalog contract:** unified discovery and detail views; remove mock data from current web screens.
8. **Reporting:** streamed CSV, branded PDF, report audit records, and UI downloads.
9. **Hardening:** RBAC/CSRF, concurrency, migration recovery, load testing, accessibility, and documentation.

Do not start destructive legacy-column removal until all reconciliation, integration, and rollback tests pass.
