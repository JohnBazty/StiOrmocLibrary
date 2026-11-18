# Inventory row actions

| Field | Value |
| --- | --- |
| Date created | 2026-11-10 |
| Date last updated | 2026-11-10 |
| Status | `built` |

## Why

Make the Librarian’s inventory easier to scan by grouping copy actions under one control per row.

## How it works

Open **Actions** on a book or thesis row and choose an operation. The list expands within the row so it remains usable in the scrollable table and mobile card layout. Choosing an action opens its existing dialog. A disabled Delete option explains the requirement for that copy. The dropdown changes no inventory records by itself and requires no migration.

## Implementation tracking

- [x] Group the book and thesis actions and preserve the existing conditions for each operation.
- [x] Verify keyboard dismissal, the availability confirmation, and the Lost preselection with disposable data in tests.

## Change log

- **2026-11-10:** Added the Actions dropdown to the physical-copy and research inventory registers.
