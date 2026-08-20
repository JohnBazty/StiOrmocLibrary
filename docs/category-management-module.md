# Category Management Module

## 1. DDL and relational contract

The canonical structure is maintained in `database/mysql56-schema.sql`. Existing databases must apply `database/migrations/20260816_003_category_management.sql` after the Book and Research/Thesis migration.

The category record uses:

- `category_id`: unsigned auto-increment primary key retained for compatibility.
- `category_name`: required `VARCHAR(100)`, unique under `utf8mb4_unicode_ci` case-insensitive collation.
- `shelf_location`: required `VARCHAR(100)` physical location tag.
- `created_at` and `updated_at`: creation and mutation timestamps.

The table uses InnoDB. The unique name index, shelf index, and 95-character composite prefixes remain below the legacy MySQL 5.6 InnoDB index-byte limit with four-byte `utf8mb4` characters.

Category ownership remains normalized at `titles.category_id`. Physical-book totals join `titles` to active `physical_copies`; thesis totals join `titles` to active `research_records`. Existing `materials.category_id` remains a migration compatibility path and is updated by category reassignment.

## 2. Backend API contracts

| Method | Endpoint | Access | Contract |
|---|---|---|---|
| GET | `/api/categories` | Any authenticated role | Alphabetical category options with `totalBooksCount` and `totalThesisCount` |
| POST | `/api/categories` | Admin/Librarian | Create a unique validated category |
| PUT | `/api/categories/:categoryId` | Admin/Librarian | Replace the category name and shelf location |
| DELETE | `/api/categories/:categoryId` | Admin/Librarian | Delete only when the transactional active-asset count is zero |
| POST | `/api/categories/reassign` | Admin/Librarian | Move all normalized and legacy category references, then delete the old category in one transaction |

The established application uses a server-side session. The stored `System Administrator` role is the effective `Admin` claim for this API; `Librarian` is accepted directly. Student and Faculty mutation attempts return `403 CATEGORY_ADMIN_FORBIDDEN`.

Create and update bodies:

```json
{
  "categoryName": "Programming",
  "shelfLocation": "Shelf A-1"
}
```

Reassignment body:

```json
{
  "oldCategoryId": 4,
  "targetCategoryId": 7
}
```

Duplicate names return `422 CATEGORY_NAME_ALREADY_EXISTS`. Deleting a category with linked active assets returns `422 CATEGORY_HAS_ASSIGNED_MATERIALS`; the transaction is explicitly rolled back and no delete statement runs.

## 3. Validation

- Category names must be strings, are trimmed and whitespace-normalized, cannot be empty, and cannot exceed 100 characters.
- Uniqueness is checked before writes and enforced again by the database unique index to close concurrency races.
- Shelf locations must start with `Shelf` or `Aisle` and use letters, numbers, spaces, or hyphenated coordinates, such as `Shelf A-1` or `Aisle 3`.
- Identifiers must be positive integers and reassignment cannot target the same category.

## 4. Query and deletion behavior

The list repository uses two pre-aggregated derived tables, avoiding the book-by-thesis row multiplication caused by joining both inventories directly. Supporting indexes are `titles(category_id, record_type, lifecycle_status)`, `physical_copies(title_id, lifecycle_status, availability_status)`, and the unique `research_records(title_id)` index.

Deletion locks the category and its linked active inventory rows. Reassignment locks both category rows in ascending ID order, updates `titles` and transitional `materials`, deletes the empty old row, and commits once. Any failure rolls the operation back.

## 5. Frontend behavior

The Admin navigation exposes `/admin/categories`. The responsive grid shows category name, shelf tag, active book and thesis totals, Edit, Reassign, and Delete actions. Create and Edit use modal forms. Delete is muted and disabled when either active counter is above zero, with the exact tooltip: `Cannot delete category while materials are assigned to it.`

The interface uses only `#003399`, `#FFF200`, `#FFFFFF`, and their opacity variants.

## 6. Verification

```bash
npm test -w @sti-library/api
npm run typecheck
npm run build
```

The suite covers authorized creation/update, malformed fields, duplicate-name `422` responses, unauthorized `403` responses, transaction rollback with assigned assets, and atomic category reassignment.

