# STI Library Proactive Validation & Flow Checklist (Gate 3)

Every workflow below MUST enforce **Layer 1 (Proactive Prevention)** + **Layer 2 (Inline Field Validation)** + **Layer 3 (Server Authority & Recovery)**.

## 1. Borrowing, Cart, Reservations & Scheduled Borrowing
- **Student 2-book limit:** Show live `Active + Requests: X / 2` status clearly. When `X >= limit`, disable `"Borrow book"` / `"Add to cart"` / `"Check Out"` upfront and display a direct `"View my books"` or `"Manage requests"` link — NEVER let the user open a confirmation modal and fail on submit.
- **Unpaid fines / clearance block:** Show exact balance upfront (`"Unpaid balance of ₱X.XX must be settled before borrowing"`) with `"View fines"` link; block checkout/schedule submission proactively.
- **Duplicate active title:** Mark titles the user already holds/requested as `"Already borrowed"` or `"Already requested"` directly on the item button rather than letting them click and hit an error dialog.
- **Scheduled borrowing (`ScheduleBorrowingForm`):** Before showing date selection/submit, verify user's pending schedule count (max 2), active holds on the same title, and open library dates. If limit reached or blocked, show the reason and link to `"View scheduled requests"` immediately.
- **Library closed hours:** Tell the user immediately if counter handover/borrowing is currently outside library hours, with the next opening time from the schedule.

## 2. Circulation Counter (`CirculationDesk` / `AdminCirculationMonitor`)
- **Borrower scan/lookup:** Show borrower standing, active loans count, fines, and blockers immediately on lookup — before scanning a book copy.
- **Copy barcode scan:** Validate non-empty input inline; show eligibility/warnings in plain language (never raw `warning.code`).
- **Override / Cancel / Lost / Return dialogs:** Live character counter and inline validation for required reasons (min 10 chars); disable confirm button with explicit inline hint until valid.

## 3. Fines & Online Payments (`AdminFinesPage`, `AdminPaymentsPage`, `LibraryFundsPage`)
- **Cash / partial payment:** Validate numeric amount `> 0` and `<= remaining balance` inline before enabling `"Record payment"`. Show computed remaining balance live before saving.
- **GCash verification:** Validate 13-digit numeric reference inline (`"Enter the 13-digit GCash reference number"`) and require receipt verification check before approving.
- **Waivers / refunds / withdrawals:** Require plain-language audit reason inline; confirm exact peso amount and recipient in a specific confirm dialog.

## 4. Printing Queue & Supplies (`AdminPrintingQueuePage`, `AdminPrintSuppliesPage`)
- **State machine clarity:** Only show valid next status actions (`pending -> printing -> ready_for_pickup -> completed`, or `cancelled` before completion). Never offer invalid transitions.
- **Supply stock / restock / deduct:** Validate positive quantities, non-negative reorder thresholds, and stock sufficiency inline (cannot use more stock than available). Highlight low/empty supplies clearly with amber warning / red critical badges and explain printer availability impact.
- **File preview rule (`agent.md`):** Keep `SelectedFilePreview` (`display="icon"` for Printing service; uncropped image preview for image choosers).

## 5. Catalog, Inventory, Categories, Shelves & Users
- **Catalog / Add Book / Copies:** Validate required fields (title, author, category, valid ISBN format when entered, positive integer copy count, shelf capacity) inline before review step. Keep optional metadata collapsed.
- **Deletion / Archive guards:** Disable destructive delete on actively borrowed copies or categories with active books, with an inline tooltip/note explaining why (`"Return active loan before removing this copy"`).
- **Bulk enrollment / imports:** Keep preview-before-save with row-level issue filtering; block import only on real errors and highlight exact failing rows.
- **Policies & Schedule (`AdminBorrowingPoliciesPage`, `AdminFinePoliciesPage`, `LibrarySchedulePage`, `ClearanceScheduleEditor`):** Validate `closeTime > openTime`, `dateFrom <= dateTo`, non-negative rates/caps inline before review/save.
