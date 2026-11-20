# New revisions Phase 1: Fixes and cleanups (no migrations, except 1a if confirmed)

- **Date created:** 2026-11-20
- **Date last updated:** 2026-11-20
- **Status:** inprogress (all 7 slices built and committed locally on their branches; reviews, live migration 078 and PRs pending Ethan's go-ahead)
- **Integration branch (local only):** `chore/revisions-phase-1` merges all 7 slice branches for whole-suite checks.
- **Source:** Ethan's `new-revisions.docx` (2026-11-20). Other phases: `2026-11-20-revisions-phase-2-catalog-circulation-maintenance.md` `2026-11-20-revisions-phase-3-policies-accounts-payments.md`
- **Migrations:** next unused number is **078** (see `.cursor/agent-protocol.md`); numbers are assigned when each slice is built.

## Why

Ethan's `new-revisions.docx` lists about 45 changes from user testing: bugs ("does not work"), wording and UI cleanups, and new maintenance screens. I mapped every item to its code. They group into three phases, ordered by risk:
1. Fixes and cleanups with no schema change, to ship first.
2. Catalog and circulation features that need migrations.
3. Policies, accounts, payments and printing, the largest group.

**Decisions already made:**
- Payments: make the hosted practice mode (Xendit test keys) work end to end. No real money.
- Faculty get no overdue fines and no violation fines. Warnings are still recorded.
- Registration rejects an ID that isn't on the roster, with a clear message and a tight per-IP rate limit.
- An imported copy with no shelf is stored as **Unassigned** (shelf is nullable) and shows up in shelf suggestions.

**Rules for every phase (CLAUDE.md and agent-protocol):**
- **Plan doc:** each phase gets a plan doc in `docs/plans/2026-11-2x-revisions-phase-N.md` with the standard shape and status `planned`.
- **Branches:** one `fix/` or `feat/` branch per slice listed below.
- **Build flow:** tests first, then `library-builder` → `plan-verifier` → `security-reviewer`. Add `database-reviewer` when a slice has a migration.
- **UI work:** use the `sti-vaadin-design-system` and `sti-ux-qa-critic` skills.
- **Migrations:** start at **078**, one file per schema change under `database/supabase/`, and update the tracker in `.cursor/agent-protocol.md`.
- **Go-ahead:** no push, merge, deploy or live migration without Ethan's go-ahead.

## How

**1a. Notification time is 8 hours early (`fix/manila-notification-time`)**
- **Confirm first:** read-only `SHOW timezone` and a sample `notification_timestamp` against the borrow time. The likely cause is the Supabase pooler ignoring the session time zone from `config/pg-pool.js`, so the API writes UTC clock time into a `TIMESTAMP` column.
- **Fix:** `notification.repository.ts` returns ISO strings with an offset. Write with `NOW() AT TIME ZONE 'Asia/Manila'`, or move the column to `timestamptz` (migration 078, only if needed).
- **Web:** one shared Manila formatter in `features/notifications/notification-display.ts`, used by `AdminNotificationsPage`, `AdminAnnouncementsPage` and `AdminRightQuickSidebar`.

**1b. Refresh button audit (`fix/refresh-buttons`)**
- Delete the dead mock `apps/web/src/pages/admin/AdminPages.tsx`; nothing imports it.
- `AdminReservationQueuePage.tsx:111` must refresh the active tab.
- `hooks/useLiveQuery.ts` `refresh()` must force a new request instead of reusing the one in progress.
- Add loading or disabled feedback on `StaffAttendancePage` and `StaffPrintingQueuePage`.
- Write the audit list into the plan doc.

**1c. Circulation and stocktake (`fix/desk-barcode-queue-fifo`)**
- **Borrower barcode:** in `features/circulation/DeskScanInput.tsx` and `CirculationDesk.tsx:329`, the borrower step accepts ID barcodes (CODE_128/39) on every desk, not just the dashboard. Change "Borrower QR" to "Scan barcode".
- **Book queue:** remove Move up and Move down from `AdminReservationQueuePage.tsx:358-376` and `ReservationQueueDialogs.tsx`, and keep only Cancel. Remove `POST /:reservationId/move` and `moveInQueue` from `book-request.service.ts:412`, so the queue is first come, first served.
- **Stocktake "Outside scope" bug** (`inventory/stocktake.service.ts`):
  - Shelf matching ignores letter case.
  - Copies added or moved after the count started are added to scope.
  - Good and Fair choices apply to inventory, so a For Repair copy can return to Good.
  - The message in `StocktakePage.tsx:196` shows the condition's label, not its raw key.

**1d. Add Book, ISBN and covers (`fix/add-book-isbn-cover`)**
- **Remove auto-fill:** drop the "Auto-fill missing information" button (`RequiredBookInformation.tsx`) and the lookup checkbox (`HoldingsImportRow.tsx:72`).
- **ISBN lookup** (`AddMultipleCopiesModal.tsx:221-284`):
  - A valid ISBN (`features/catalog/isbn.ts`) runs the lookup automatically and fills title, author, publisher, year and subjects.
  - Clearing the ISBN clears the fields the lookup filled.
  - An invalid ISBN shows an inline error and blocks saving.
- **Barcode only:** `bulk-book.service.ts:69-73`, `book-label.renderer.ts` and `BookLabelSheet` stop generating the QR code. Leave `qr_code_data` as legacy data.
- **Cover API:** `isbn-lookup.service.ts:181-244` accepts the Open Library redirects to `archive.org` and Google thumbnail hosts. Raise the hop and timeout limits for Vercel.

**1e. Wording, branding and login (`fix/login-labels-logo`)**
- **Login screen** (`LoginPage.tsx`):
  - Remove the "Remember this device" checkbox.
  - The label becomes "Student ID / Faculty ID", and the same change applies to the messages at lines 58 and 120.
  - Update the four auth tests that look up the label.
- **Account Activation:** "Account Registration" becomes "Account Activation" in `RegistrationPage.tsx:43` and related copy. Update `PublicAuthLayout.test.tsx:82`.
- **Official logo:** Ethan supplies the asset. It replaces the `LibraryBig` tiles in `PortalLayout.tsx` (Brand), `PublicAuthLayout.tsx`, `LoginPage.tsx` and `AdminLoginPage.tsx`, plus `public/logo.*` and the favicon. Add a favicon link in `index.html`.

**1f. Admin sidebar and schedule (`feat/admin-shortcuts-schedule`)**
- **Core shortcuts** (`AdminRightQuickSidebar.tsx:498`): add Library setup (`/librarian/maintenance`), Issue fines (`/librarian/fines`, opening the form), Reservation maintenance (`?tab=reservations`) and Pickup window (the same tab with an anchor). Paths are checked against the role.
- **Agenda:** each item shows a specific line kept to one or two lines: who, what, time and place.
- **Library schedule** (`LibrarySchedulePage.tsx:264-315`): add an "Apply to Monday–Saturday" action that copies one day's times to days 1-6. Sunday is excluded.
- **Cancel event** (`LibraryOperationsPanel.tsx:400-436`): use a proper confirm modal instead of the inline panel.
- **Paper log** (`conduct.service.ts:58-60`, `ViolationRecordForm.tsx:66`): remove the "dates before today" rule, so an entry is recorded on the day it was issued. Keep the guard that stops a paper-log entry at the fine step.

**1g. Hide Print supplies (`chore/hide-print-supplies`)**
- First move `PaperSizesDialog` (paper sizes and brand prices) into Printing settings (`PrintingServiceSetup.tsx`).
- Then remove the `/librarian/supplies` route (`App.tsx:175`) and its nav link (`admin-navigation.ts:22`). Keep the page file archived.

## Verification

- `npm test`, `npm run typecheck` and `npm run build` from the repo root. Each slice has new failing-first tests next to the code: `node --test` with supertest for the API, Vitest for the web.
- Migrations are checked against a PGlite or local test database. They are applied to live Supabase only with Ethan's go-ahead, then verified read-only.
- Check each slice in the browser with `npm run dev:api:stable` and `npm run dev:web` (the root dev script is broken), signed in as Admin, Librarian, Staff, Student and Faculty as relevant, on desktop and mobile. Specific checks:
  - The borrower barcode scans with the webcam.
  - The ISBN lookup fills and clears the fields.
  - The reservation calendar stops at the semester end.
  - A notification time matches the borrow time.
  - A DOCX upload produces a page count.
- `plan-verifier` before each PR. Each phase's plan doc moves `planned` → `inprogress` → `built` with a change log entry.

## Implementation tracking

- [x] 1a. Notification time is 8 hours early (`fix/manila-notification-time`). Cause: the transaction pooler drops `-c timezone=Asia/Manila`. Migration `078_app_role_manila_timezone.sql` written, **not applied**; library alerts stop stamping UTC; web formats in Manila. A read-only live check was not possible in the build session.
- [x] 1b. Refresh button audit (`fix/refresh-buttons`). Every live Refresh button was wired; they gave no feedback. New `RefreshButton` (busy, then "Updated") on 46 pages; dead mock `pages/admin/AdminPages.tsx` removed.
- [x] 1c. Circulation and stocktake (`fix/desk-barcode-queue-fifo`). Borrower School ID barcodes on every desk; queue move routes/buttons removed; stocktake scope ignores case/spaces and counts late-shelved copies; message shows the condition label. Restoring a For Repair copy to Good from a stocktake was **not** added (it would bypass the repair workflow).
- [x] 1d. Add Book, ISBN and covers (`fix/add-book-isbn-cover`). Automatic ISBN fill/clear; auto-fill button and import lookup tick box removed; new copies barcode only; Open Library covers via archive.org allowed, cover timeout 8-10 s.
- [x] 1e. Wording, branding and login (`fix/login-labels-logo`). Remember-device box removed; "Student ID / Faculty ID"; "Account Activation" and "Activate account"; `BrandLogo` uses `public/brand-logo.webp` (from `logo.jpg`) until the official file is supplied.
- [x] 1f. Admin sidebar and schedule (`feat/admin-shortcuts-schedule`). Librarian core shortcuts (Library setup, Issue fines, Reservation maintenance, Pickup window); short specific agenda lines; "Apply these hours to Monday-Saturday"; cancel-event modal; paper-log entries dated the day issued.
- [x] 1g. Hide Print supplies (`chore/hide-print-supplies`). Route redirects to Printing settings, which now has "Paper sizes and prices".
- [ ] Reviews (`security-reviewer`; `database-reviewer` for 078), then Ethan's go-ahead for push/PRs and for applying 078 to live Supabase.

## Change log

| Date | Change |
| --- | --- |
| 2026-11-20 | Plan drafted from `new-revisions.docx` and a code map of every item; Ethan approved the 3-phase split. Status `planned`. |
| 2026-11-20 | Ethan said start Phase 1; all 7 slices built tests-first on separate branches (1d, 1e, 1g done in the same session at Ethan's request). Status `inprogress`. 1c scope note: no Good-restore from stocktake. 1g adds paper prices to Printing settings so pricing stays editable. |
