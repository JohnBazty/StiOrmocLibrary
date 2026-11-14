# Category table spacing and sorting - 2026-11-13

Owner approved a spacing fix and Sort by controls for ID, category name, shelf location, book copies, active theses and date added, with ascending/descending order.

CategoryManagementPage now gives the shelf label its own inline-flex yellow badge and displays Column/Row below it. Table cells align vertically; category names and descriptions have consistent widths and line spacing. Numeric counts use tabular figures. The same component serves Maintenance > Categories and the standalone Categories page.

Sorting is local to the displayed category list. Default: category name ascending. Numbers sort numerically, text uses natural case-insensitive ordering, shelf ties use column/row, and unknown dates remain last. Equal values use ID for consistent ordering. The API response array is copied before sorting. Totals, edit/delete/reassign controls and API contracts are unchanged; no database writes are made by sorting.

Verification: 506 API tests and 315 frontend tests passed under coverage; frontend statement coverage 58.59%. Type checks and final production build passed, with the pre-existing large-bundle warning. Tests cover all six fields in both directions, source-order preservation, unknown/tied dates and existing deletion restrictions. Browser verified live ID sorting, keyboard navigation, shelf text and desktop/mobile light/dark appearance. At 390px, document width was 382px and sorting controls measured 44px high. No category mutations were submitted.

No backend, schema, environment, dependency or lockfile changes. No commit/push/merge/deployment. Screenshot remains outside the repository at %LOCALAPPDATA%/STILibraryLocal/categories-spacing-preview.jpg.
