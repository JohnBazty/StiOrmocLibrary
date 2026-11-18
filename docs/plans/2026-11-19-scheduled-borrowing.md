# Scheduled borrowing

Status: built locally; hosted release not authorized

Approved 2026-11-19: Student and Faculty users may schedule two pending titles for an open pickup date tomorrow through seven calendar days ahead (Asia/Manila). Schedules do not reserve copies or consume loan slots. Automatic preparation starts one open library day before pickup, behind existing reservations; recheck eligibility and normal limits. Retry until pickup-day closing. Staff mark an automatically assigned copy ready; staff handover starts the loan. Scheduled holds expire at pickup-day closing, including copies never marked ready. Ordinary reservation deadlines stay unchanged. Closure cancels the schedule, releases any hold and notifies the owner to select another date. No guarantees, automatic replacement date or conversion to a waiting list after failure.

## Execution ledger

- Base: b8002d6; branch codex/scheduled-borrowing. Unrelated payment changes preserved. No live migration, push, merge or deployment authorized.
- Ruling: date edits use cancel and recreate; reject duplicate pending schedules and existing active same-title loans/requests. Scheduling does not block subsequent ordinary borrowing; preparation rechecks duplicates.
- Ruling: preparation runs during operating hours, from the previous open day's opening until pickup closing. Retry eligibility blocks without repeatedly notifying. Order schedules by pickup date then creation/id. A prepared request uses the normal reservation allowance; if that allowance or the title waitlist cap is full, retain the schedule for retry.
- Ruling: nullable scheduled pickup date on the linked ordinary reservation allows existing desk paths to enforce deadlines without changing ordinary reservations. Cancelled/completed request history remains authoritative.

## Tasks

- [x] Calendar rules, additive 047 migration and real-SQL security tests.
- [x] Schedule service, owner endpoints, transactional promotion and repeat-safe runner.
- [x] Scheduled deadline/closure guards on preparation, both desk checkout paths and request-based borrower identification.
- [x] Catalog scheduling form, user schedule list and staff pickup-date information.
- [x] Regression tests, full required checks, browser verification and final independent review.

## Verification

- Full API tests: 777 passed with `--test-concurrency=2`. Default parallel run exhausted PGlite WebAssembly memory in two payment tests; no product test failure was hidden.
- API coverage: 779 tests passed after batch/deadline regressions; subsequent request-based checkout regression passed (7 helper tests). Web coverage: all 112 files / 523 tests passed. Typecheck and production build passed after the checkout fix.
- Focused circulation/reservation/job-runner regression: 89 tests passed. Migration tests exercise actual SQL in PGlite and deny anon/authenticated access.
- Existing test fixtures needed corrections for prior changes: router wrappers and save confirmation in CategorySuggestion/UploadPreviews, and the required compartments array in ShelfEditor. No production behavior changed for those fixes.
- Logged-in synthetic Faculty browser check against the real local API: open-date choices, scheduling form, one review before save, desktop and mobile captures. No browser schedule was submitted. Student and Faculty scheduling/limits are both covered by service tests.
- Independent review corrected cancellation-versus-refresh races, changed closing-hour reconciliation, a stale request-based checkout deadline, and a worker batch holding the shared lock too long. Worker now releases the lock per schedule, processes at most 20 per pass, budgets 8 seconds, refreshes the clock per row, and persists continuation. Lock wait is capped at 1500ms and each statement at 5 seconds.
- Applied 047 only to isolated `sti_library_payment_branch_test` at 127.0.0.1:55432; hosted latest remains 045. No guessed API env file, hosted database access, hours change, push, merge or deployment. Existing local job timer remains off; automatic preparation is wired to the existing runner's `all` pass and named `borrowing-schedules` job.
- Local app restarted on API 4005 / web 5179. Screenshot artifacts: `%LOCALAPPDATA%/STILibraryLocal/scheduled-borrowing-desktop.png` and `scheduled-borrowing-mobile.png`.

## Catalog calendar entry — approved follow-up

The owner chose a compact calendar icon beside each physical book's Borrow/Reserve action. It has a 44px tap target, tooltip and title-specific accessible label. It opens the existing book panel with the pickup-date form at the top (`schedule=1`), preserving filters and clearing that entry flag on close. The full Schedule borrowing action remains in ordinary book details. Digital-only books have no calendar action; the existing same-title notice still prevents a duplicate request.

Verification: catalog tests cover available/unavailable books, direct date-picker entry, retained filters, no cart/reservation mutation and digital-only exclusion. All web tests with coverage, repository typecheck and production build passed. Logged-in Student browser checks verified desktop and 390px mobile layout, a 44px icon without horizontal overflow and a date picker visible immediately. No schedule was submitted and no backend/database changes were needed.

## Admin Scheduled tab — approved follow-up

The owner requested visibility of a November 21 schedule before preparation. Book queue now separates Book requests from Scheduled, with a direct `?tab=scheduled` view. Scheduled lists pending schedules only, with borrower name/School ID, role, title, pickup date, preparation start and waiting reason. Search, Student/Faculty role, inclusive pickup-date filters and 25-item pagination are supported. Prepared schedules remain in the ordinary request queue. There are no early Mark ready, checkout or allocation actions.

The new `GET /api/v1/admin/borrowing-schedules` is guarded by the existing active-session and `desk.operate` rules. Its repository issues SELECTs only and needs no migration. The panel refreshes in place every 30 seconds, prevents overlapping refreshes, aborts stale requests, preserves filters and retains confirmed rows on errors. Tabs support keyboard navigation.

Verification: actual-SQL filter/order/pagination/read-only and router role tests pass; UI tab, filtering, pagination and failed-refresh retention tests pass. Full coverage passed with 782 API tests and 529 web tests, using two workers to avoid local resource exhaustion; an earlier unrestricted web coverage run was stopped after worker shutdown timeouts. Repository typecheck and production build pass. A logged-in synthetic Staff browser confirmed the existing November 21 pending schedule appears, the tab has no early preparation/checkout actions, mobile has no horizontal overflow and switching back to Book requests works. A panel screenshot was inspected with borrower details masked. Independent review found no actionable issues. Local app restarted with the new endpoint. No hours, scheduler settings, migrations or payment files changed.
