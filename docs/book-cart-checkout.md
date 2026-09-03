# Book cart and checkout

SmartLib keeps cart state in browser session storage for navigation continuity, but treats it only as a display selection. `POST /api/v1/borrow/submit-request` revalidates identity, role, capacity, copy condition, availability, and reservation ownership inside one MySQL transaction.

## Transaction lifecycle

1. The user selects active Book titles in the catalog.
2. Checkout sends only unique normalized `title_ids`; client-provided availability or copy identifiers are never trusted.
3. The service locks the linked user and eligible `physical_copies` rows with `FOR UPDATE`.
4. A Student projected above two distinct active commitments receives `422 STUDENT_BORROW_LIMIT_REACHED`; Faculty have no cap.
5. Each title is assigned one active Available copy that is neither Lost nor Damaged and has no active copy reservation.
6. The service inserts one `borrow_transactions` Pending row per copy under a shared `request_group_id`, changes both copy ledgers to Reserved, and creates the admin alert before commit.
7. The admin circulation monitor displays these rows in its pending-counter-claim ledger.
8. A librarian scans the assigned barcode and school ID. The existing Pending row becomes Borrowed, its due time is set to 8:59 AM on the next operating day, and availability becomes Borrowed.

The `borrow_records` database view is read-only compatibility output. All writes continue through `borrow_transactions`.
