# Attendance reference integration - approved scope and future push notes

Recorded 2026-11-13. Status: implemented in the UI working copy; automated verification passed. Browser review passed for the authenticated Librarian view.

## Owner decisions

Apply the friend-ui Attendance appearance and organization to the updated UI working copy while preserving current operations:

- Door attendance panel using the updated app's existing QR scanner and check-in/check-out flow.
- Seat capacity settings moved into Library operations, retaining the existing save operation, validation, reason and permission checks.
- Existing attendance charts inside a collapsible Usage Insights section.
- Event scheduling in its own collapsible section, retaining creation, editing, cancellation and service restrictions.
- Retain all current filters, logs, pagination, exports, attendance cutoff controls, role permissions and error handling.

Keep these two UPDATED-app behaviors unchanged:

1. Capacity/occupancy refresh every 10 seconds; do not replace it with the reference's 30-second operations refresh.
2. New events default to Allow walk-ins unchecked. Editing an existing event loads its saved value.

Copy presentation and adapt current handlers; do not replace whole files with reference implementations. Neither the original comparison clone nor the reference folder should be modified as part of this integration.

## Separate functional scope

The reference currently includes Library hours and Closed dates editors that are absent from the updated app. These require a separately identified functional/backend change, including permissions, validation and verification of effects on attendance, loan deadlines and fines. They must not silently enter an appearance-only change or PR. No implementation or verification of those additions is claimed here.

## Before a future commit or push

- Review the actual final diff against this scope and describe the final change accurately.
- Verify scanner behavior, the 10-second refresh, new-event walk-in default, saved-event settings, capacity saving, event changes, filters, exports and light/dark responsive layouts.
- Keep private environment files, credentials, local database/runtime files, local testing setup and unrelated changes out of the proposed commit.
- Current frontend work includes earlier public/auth/dashboard styling, app-wide brand blue, Maintenance actions, and category table spacing/sorting. Review and group those changes deliberately instead of attributing everything to Attendance.
- Obtain the owner's explicit confirmation before pushing, merging or deploying. This note is not permission to perform any of those actions.


## Implementation record

- AdminAttendancePage retains its capacity API, save handler and 10-second interval. The reference Door attendance panel uses that current capacity state and the existing scanner modal. The scanner API/component is unchanged.
- The existing capacity controls render inside Library operations through a presentation slot; no new capacity backend is introduced.
- Existing charts are in a keyboard-accessible collapsible Usage Insights section after the logs.
- Event scheduling is a separate collapsible section. Current event payloads, Manila time conversion, row versions, cancellation confirmation and unchecked new-event walk-in default remain. Staff users retain a read-only scheduled-event section.
- Operations and event lists retain their existing 30-second refresh cadence; the distinct capacity/occupancy polling remains 10 seconds.
- Attendance styling shares the existing scoped reference palette and charcoal surfaces. The scanner action keeps its yellow reference treatment.
- Focused tests cover capacity saving, scanner opening, the ten-second interval and cleanup, collapsed charts/export, new-event default, editing saved service decisions, cancellation versions, cutoff saving and Staff permissions.
- Full coverage run: 506 API tests and 319 frontend tests passed. Frontend statement coverage: 58.95%. Type checks and production build passed; the existing bundle-size warning remains. Diff whitespace checks passed. Backend/database/package/lockfile diff is empty.
- Library hours and Closed dates remain excluded from this batch. No push, merge or deployment.


## Browser review and limitations

Authenticated Librarian review passed for the Door attendance panel, capacity editor placement (base capacity read without saving), collapsed/open Usage Insights, separate event scheduler, unchecked walk-ins, keyboard controls and light/dark layouts. A narrow viewport measured 355 CSS pixels with document width 346 pixels, without horizontal overflow. Dark card surfaces measured RGB 34,35,46; the scanner button remained yellow with reference-blue text.

Physical camera/QR scanning, browser submission of capacity/event/cutoff changes and a separate authenticated Staff browser session were not exercised. Existing scanner implementation was retained; component tests cover scanner opening, mutation handlers, Staff read-only controls and the preserved behaviors. No settings or attendance records were saved during browser review.

Review URL: http://127.0.0.1:5174/librarian/attendance
Screenshots remain outside the repository: %LOCALAPPDATA%/STILibraryLocal/attendance-reference-preview.jpg and attendance-mobile-preview.jpg.
