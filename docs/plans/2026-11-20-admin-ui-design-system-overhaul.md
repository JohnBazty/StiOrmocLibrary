# Admin UI/UX Audit, Critique & Phased Design System Overhaul

## Why

The current STI College Ormoc ILMS web interface suffers from severe visual inconsistency, redundant noise, silent prop drops in shared UI primitives, broken dark-mode contrast on legacy `#003399` pages, card-list layouts where scannable operational tables belong, raw technical strings, and frustrating dead-end validations (including allowing users to proceed through booking/borrowing/scheduling confirmations only to fail after submission).

This plan establishes two permanent repository skills (`sti-vaadin-design-system` and `sti-ux-qa-critic`), documents a full code-backed audit of the admin/librarian workspace and booking validation flows, and executes a phased UI/UX overhaul grounded in Vaadin Lumo, Vaadin Icons, and Vaadin Charts (via Figma MCP) strictly themed with STI College Ormoc's project palette and governed by the Vibe Monday UX Writing Handbook — **without altering any business rules, RBAC guards, or database schemas.**

| Field | Value |
| --- | --- |
| **Date created** | 2026-11-20 |
| **Date last updated** | 2026-11-20 |
| **Status** | `inprogress` |
| **Branch** | `feat/admin-ui-design-system-overhaul` |
| **Database / Migration impact** | None (latest applied `073`, next unused `074`; UI/validation overhaul only) |

---

## Executive Audit & Critique Summary (Admin Side + Booking Flows)

Audited against the 7 Hard Quality Gates in `sti-ux-qa-critic`:

### 0. Systemic Shared-Primitive Defects (affecting 20+ screens)
- `[P0 / Gate 4]` `components/ui.tsx`: `PageHeader` silently drops `description`, `StatCard` silently drops `note`, and `TableShell` silently drops `subtitle` — erasing page guidance and forcing ad-hoc duplicate `<p>` walls across screens.
- `[P0 / Gate 6]` `components/ui.tsx`: `StatusBadge` renders zero icons (violates `agent.md`), maps `overdue`/`blocked`/`unpaid` to yellow `#FFF200`, and misses ~20 live domain statuses (`Not Cleared`, `Low stock`, `In stock`, `Accruing`, `Refund pending`, `Scheduled`, `Completed`, `Cancelled`, `Archived`, `Deactivated`, `Published`, `Expired`, `Open`, `Closed`), making critical warnings visually identical to normal states.
- `[P0 / Gate 6]` `apps/web/src/index.css`: Dark-mode overrides only cover `#0b5ea2`, breaking contrast on `#003399` screens (`BookRegisterPage`, `StudentQrRosterPage`, `AdminBorrowingPoliciesPage`, `AdminFinePoliciesPage`, `ExportMenu`, `LateEnrollment`). Painting all body text `#0b5ea2` hides interactive hierarchy.
- `[P1 / Gate 5]` `components/ConfirmSaveDialog.tsx`: Hardcodes generic `"Are you sure?"` / `"Yes, save"` (violates Vibe UX Writing).
- `[P1 / Gate 6]` `components/ui.tsx`: `Button` `primary` and `secondary` hover classes are identical to default classes (zero visual hover feedback); 6 competing modal implementations + native `window.confirm()` / `window.prompt()`.

### 1. Proactive Zero-Dead-End Booking Validation Defects
- `[P0 / Gate 3]` `features/catalog/book-cart.ts` + `BookCatalog.tsx` + `BookCart.tsx`: `validateBookCartAddition` accepts `activeBookCount` and ignores it (`cart.length >= limit` only). `BookCatalog` discards `outstandingBalance` from `fetchCartState()`. Users at/near the 2-book cap or with unpaid fines are allowed to click Borrow -> Confirm -> Check Out -> "Yes, save" before failing on submit (`STUDENT_BORROW_LIMIT_REACHED`, `CIRCULATION_ELIGIBILITY_BLOCKED`, `BOOK_NO_LONGER_AVAILABLE`). Worse, `BookCart.tsx:96` can strip the only blocker and render an empty error (`silent failure`).
- `[P0 / Gate 3]` `features/reservations/ScheduleBorrowingForm.tsx` + `BorrowingSchedules.tsx`: Never fetches `borrowingScheduleApi.mine()` upfront — allows borrowers who already have 2 pending schedules or a duplicate schedule on the same title to pick a date, confirm `"Yes, save"`, and fail on submit (`SCHEDULE_LIMIT_REACHED` / `SCHEDULE_ALREADY_EXISTS`). Cancel errors render behind the modal backdrop.

### 2. Admin Operational Page Critique Highlights
- **Dashboard (`AdminDashboardPage`, `AdminAccountDashboardPage`)**: 6 stacked vertical zones; `UrgentCases` duplicates overdue rows without `ResponsiveTable`; `"Send email reminders"` fires unconfirmed batch emails scoped to hidden table filters; `CollectionSnapshot` flashes `"Reporting data unavailable."` on load; `AdminAccountDashboardPage` buries `unknown` clearance count in footer text with no drill-down and omits `credentials: 'include'`.
- **Borrow & Return (`AdminCirculationMonitor`, `CheckoutPreflightDialog`)**: Renders pickups and open loans as stacked `<article>` cards instead of scannable Vaadin Grid tables; yellow `#FFF200` success banner lacks `data-tone="success"`; `CheckoutPreflightDialog` exposes raw `warning.code`.
- **Book Queue & Scheduled (`AdminReservationQueuePage`, `AdminScheduledBorrowing`)**: `Book requests` stuffs nested 4-field `<dl>` boxes inside `<td>` (repeating `Requested` twice) and skips `ResponsiveTable`; sibling `Scheduled` tab flips to a 2-column card grid instead of a table; `"Pickup calendar needs review"` has no link to Library Schedule.
- **Printing & Supplies (`AdminPrintingQueuePage`, `AdminPrintSuppliesPage`)**: Primary row transitions buried inside `RowActions`; unconfirmed Cancel; missing busy guards on Mark ready / Confirm pickup; checks `number_of_copies >= 60` instead of `total_sheets`; broken Pause Reason UX (no Save button); admin invoice shows student copy; Supplies packs 5 subsystems with nested scroll traps, filter `<select>` hijacked as modal trigger, and visually identical `Low stock` / `In stock` badges.
- **Fines, Payments & Funds (`AdminFinesPage`, `AdminPaymentsPage`, `LibraryFundsPage`)**: Fines piles 4 subsystems on one page with raw DB ID column, `termId: 0` semester bug, and native `window.prompt` receipt reversal; Payments & Refunds & Funds Activity use card stacks instead of tables, omit search on Payments tab, use plain unbadged text statuses, and fail to persist `?view=refunds`; `TransferFeeSetup` cannot unset fee despite helper text; `MoneyOutDialog` shows a refund `<Undo2>` icon for bank setup/withdrawals.
- **Attendance & Clearance (`AdminAttendancePage`, `AdminClearancePage`)**: Permanently expanded 7-field event form pushes attendance logs down; capacity input bypasses validation; unthrottled 4-request keystroke storms; `Inside` shows `0 min` duration and yellow pill. Clearance hides modal errors behind backdrop, drops itemized `selected.fines`, uses native `window.prompt` silently returning on `< 10` chars, hides active URL filters with no UI controls, and renders Lost-book reports as cards.
- **Catalog, Inventory, Users & Policies**: `ConditionModal` defaults to `'good'` (accidental overwrite); Stocktake silently ignores scans when condition/location is empty; Archive & Category modal errors render behind backdrops; Reports exact-match free-text traps; `AdminUsersPage` flashes table empty on every keystroke; `EnrollmentPage` uses `<ul>` instead of table for roster; `AdminFinePoliciesPage` has zero card padding and submit-only cross-field rate checks; `WorkspaceNotificationsPage` has zero active-tab visual styling; `AdminAnnouncementsPage` broadcasts campus-wide with zero confirmation.

---

## How (Phased Implementation Strategy)

Every phase follows TDD (write/update Vitest + Testing Library tests first), preserves 100% of API contracts and business rules (`agent.md`, `docs/source-of-truth.md`), verifies `npm test -w @sti-library/web`, `npm run typecheck`, and `npm run build`, and lands as an **atomic git commit** so any phase can be reverted cleanly.

### Phase 1 — STI × Vaadin Lumo Foundation & Shared Primitives
- Upgrade `apps/web/src/index.css` with Lumo-structured STI CSS variables (light + dark, readable neutral ink `#132a3f`/`#1e293b`, `#0b5ea2` interactive brand, `#132a3f` sidebar chrome, `#FFF200` accent-only, strict semantic red/green/amber/blue/slate, dark-mode mapping for legacy `#003399`).
- Upgrade `apps/web/src/components/ui.tsx`: render `PageHeader.description`, `StatCard.note` + semantic tones, `TableShell.subtitle`, real `Button` hover/active/danger/success/size variants, icon-equipped semantic `StatusBadge` covering all 35+ domain statuses, plus shared `NoticeBanner`, `EmptyState`, `FormField`, and `LumoDialog` primitives.
- Upgrade `ConfirmSaveDialog.tsx` (Vibe UX Writing titles & specific CTAs, backwards-compatible), `ExportMenu.tsx`, `RowActions.tsx`, `PortalLayout.tsx`, and `AdminSidebarNavigation.tsx`.

### Phase 2 — Proactive Zero-Dead-End Booking, Cart & Schedule Validation
- Enforce `activeBookCount + selectedBookCount` in `book-cart.ts` + upfront limit/balance/availability checks in `BookCatalog.tsx` and `BookCart.tsx`, fixing the silent error stripping bug and adding empty-cart navigation CTA.
- Add upfront `borrowingScheduleApi.mine()` validation in `ScheduleBorrowingForm.tsx` (blocking 2-schedule cap and duplicate-title schedules before date picking/confirmation), plus in-modal error visibility and reschedule links in `BorrowingSchedules.tsx`.

### Phase 3 — Admin Core Operations (Dashboard, Borrow & Return, Book Queue & Scheduled)
- Overhaul `AdminDashboardPage`, `AdminAccountDashboardPage`, `DashboardActionCards`, `DashboardTaskTable`, `DashboardAnalytics`, `CollectionSnapshot`, `UrgentCases` (STI-themed Vaadin Charts style, confirmed batch reminders, `ResponsiveTable`, `"Clear filters"`, unknown-clearance link).
- Convert `AdminCirculationMonitor` pickups and open loans from stacked `<article>` cards to scannable Vaadin Grid (`ResponsiveTable`) tables, fix yellow success banner, clean `CheckoutPreflightDialog` plain-language warning titles.
- Clean `AdminReservationQueuePage` table (remove nested `<dl>` clutter and duplicate text, wrap in `ResponsiveTable`, green success banner) and convert `AdminScheduledBorrowing` card grid to a matching `ResponsiveTable` with date validation and schedule link.

### Phase 4 — Admin Printing, Supplies, Fines, Payments, Funds, Attendance & Clearance
- Overhaul `AdminPrintingQueuePage` & `AdminPrintSuppliesPage` (inline primary action, Cancel confirm, busy guards, `total_sheets` check, fixed Pause Reason Save, tabbed Supplies without scroll traps or hijacked `<select>`).
- Overhaul `AdminFinesPage`, `AdminPaymentsPage`, `LibraryFundsPage` (tabbed Fines, modal receipt reversal replacing `window.prompt`, fixed `termId: 0` bug, tabular Payments/Refunds/Funds ledger with search & URL tab sync, fixed `TransferFeeSetup` unset & modal icons).
- Overhaul `AdminAttendancePage` & `AdminClearancePage` (collapsible Event Scheduling drawer, debounced AbortController loads, enforced capacity validation, in-modal Clearance errors + itemized `selected.fines`, modal confirm replacing `window.prompt`, visible URL filters, tabular Lost-book reports).

### Phase 5 — Catalog, Inventory, Stocktake, Users, Policies & Settings Consistency
- Fix `InventoryDashboard` (`ConditionModal` initial value bug, unified Books/Research toolbar), `StocktakePage` (explicit inline scan errors, visual hierarchy, `ResponsiveTable`), `CatalogManagementPage` / `BookArchivePage` / `CategoryManagementPage` (in-modal errors, drop raw DB IDs), `BookRegisterPage` / `OperationalReports` (date validation, Clear filters).
- Fix `AdminUsersPage` (debounced search without table flash, readable detail summary), `EnrollmentPage` (tabular roster, inline domain validation), `StudentQrRosterPage` (dark mode + Enrollment link).
- Fix `AdminBorrowingPoliciesPage`, `AdminFinePoliciesPage` (padding + inline cross-field rate validation), `LibrarySchedulePage`, `AdminAnnouncementsPage` (publish confirmation + date validation), `WorkspaceNotificationsPage` (active tab styling), `FloorPlanImagePage`.

---

## Implementation Tracking

- [x] **Milestone 0:** Create and commit project skills `sti-vaadin-design-system` and `sti-ux-qa-critic` in both `.agents/skills/` and `.claude/skills/`, registered in `AGENTS.md` and `CLAUDE.md` (commit `8c458b5`).
- [x] **Milestone 0b:** Complete code-backed Admin Side & Booking Validation Audit and save phased plan (`docs/plans/2026-11-20-admin-ui-design-system-overhaul.md`).
- [x] **Phase 1:** STI × Vaadin Lumo tokens, shared primitives (`ui.tsx`, `ConfirmSaveDialog`, `ExportMenu`, `RowActions`, `PortalLayout`, `AdminSidebarNavigation`) + tests + commit.
- [ ] **Phase 2:** Proactive zero-dead-end validation in `book-cart.ts`, `BookCatalog.tsx`, `BookCart.tsx`, `ScheduleBorrowingForm.tsx`, `BorrowingSchedules.tsx` + tests + commit.
- [ ] **Phase 3:** Admin Dashboard, Borrow & Return, Book Queue & Scheduled Borrowing overhaul + tests + commit.
- [ ] **Phase 4:** Admin Printing, Supplies, Fines, Payments, Funds, Attendance & Clearance overhaul + tests + commit.
- [ ] **Phase 5:** Admin Catalog, Inventory, Stocktake, Users, Policies, Schedule, Announcements & Notifications overhaul + tests + commit.
- [ ] **Final QA:** Full `npm test`, `npm run typecheck`, `npm run build`, combined security/correctness/React diff review, and desktop/mobile visual verification.

---

## Change Log

| Date | Change |
| --- | --- |
| 2026-11-20 | Created skills `sti-vaadin-design-system` (Vaadin Lumo, Icons, Charts via Figma MCP + STI palette + Vibe Monday UX Writing Handbook) and `sti-ux-qa-critic` (7-gate UX QA & page critic). Completed full Admin Side & Booking Validation audit and saved 5-phase implementation plan. |
