# Library Floor Plan

The floor-plan module separates physical inventory assignment from the picture students navigate. A shelf has one stable ID and one current label. The editor places that shelf on an area or floor; physical copies continue to use the compatible shelf label already used by catalog, inventory, and circulation screens.

## Administrator workflow

1. Open **Floor plan** below **Inventory** in the admin sidebar.
2. Existing shelf locations appear under **Unplaced shelves** after the migration. Place them on the correct area instead of creating duplicates.
3. Add or resize areas for new floors or future expansion. Add walls, entrances, exits, tables, desks, chairs, and printing areas as visual guides.
4. Select an object to rename it, add a short location note, resize or rotate it, or move it to another floor. A shelf also has a simple Columns and Rows control. New shelves default to 3 columns by 5 rows; both values can be changed from 1 to 12. An area can be deleted only when it is empty.
5. Use Category Management to move a category to another managed shelf. Every active copy in that category moves together. A populated shelf position cannot be removed until its books or research are reassigned.
6. **Save draft** keeps work private. **Preview** shows how the draft will look. **Publish** makes that revision visible to students and faculty and adds it to version history.
7. **Restore as draft** copies old geometry into the editor while preserving present-day shelf labels and copy assignments. Review and publish it explicitly.

The initial installation deliberately contains a blank `Main Library` draft. It imports shelf names and inventory assignments, but it does not invent the school’s physical layout. Existing assignments begin at Column 1 / Row 1. An administrator must arrange the real shelves, assign category compartments, and publish the result.

## Student and faculty workflow

**Library floor plan** appears below **Book catalog** in the user sidebar. Users can pan and zoom the published map, select a shelf, filter by a live category, or search by title, author, ISBN, or shelf. Matching shelves are highlighted and the results show each copy’s cover, availability, floor, and assigned shelf.

**View location** links from the catalog, cart, borrowing history, and reservation/pickup records open the same map. Before cart submission the link finds currently available copies. After a physical copy has been assigned, it locates that exact barcode/copy. The map moves to the shelf, flashes its saved column/row compartment, and keeps a yellow location indicator. Selecting the shelf opens its compartment grid, where the requested book is highlighted with its cover, call number, availability, and a View details link. Borrow, reserve, and cart actions remain in the Book Catalog.

If a book has a written shelf label that has not yet been placed on the published map, the interface keeps the catalog result visible and tells the user to ask the librarian. Categories remain dynamic database records; filtering a category can highlight multiple shelves because copies in one category may be stored in different locations.

The Create category and Edit category dialogs list the shelves created in Floor Plan and then show valid Column and Row dropdowns for the selected shelf. Administrators cannot type an unrelated shelf name or select a compartment outside the configured grid, and the API verifies the selection again before saving the category.

The category shelf is the authoritative home location. Saving a category synchronizes all of its active physical books and linked research copies to that shelf in one transaction. Reassigning categories uses the target category's shelf. The add-book form therefore fills Book location from the chosen category and does not allow a conflicting per-copy location.

The Admin Unified catalog table shows the authoritative shelf beside every title. **Change category** moves one selected catalog title, together with all of its active physical copies or linked research inventory, to the chosen category and that category's shelf. The operation uses the title row version to reject stale screens, keeps loan/reservation/availability state unchanged, and records the before/after assignment in `floor_plan_events`.

## Access and maintenance rules

- Admin can edit, transfer copies, save drafts, publish, restore, and upload backgrounds.
- Librarian can read the published map but cannot call editor endpoints.
- Student and Faculty can read the published map and book-location results.
- All layout inputs are server validated and every state-changing route is role protected.
- Background files use the existing controlled catalog-image storage path and validation.
- Concurrent admin saves are rejected with a revision conflict so one editor cannot unknowingly overwrite another.
- A shelf grid cannot be reduced while categories or active inventory occupy a removed column or row.
- Returning a book still makes it Available immediately. A separate waiting-for-reshelving scan remains future work.
