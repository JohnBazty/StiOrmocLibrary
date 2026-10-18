# Kiosk tasks

Order = dependency order. Each ≤~5 files, TDD, committed separately.
See `tasks/plan.md` and `SPEC-kiosk.md`.

- [x] 1. Kiosk shell + routing
  - Acceptance: `/kiosk` renders idle screen with Attendance/Borrow/Search nav;
    inactivity timeout returns to idle and clears any student state; en/fil/ceb
    toggle switches visible strings.
  - Verify: component tests for idle-reset and language switch; `npm run typecheck`.
  - Files: `features/kiosk/KioskApp.tsx`, `i18n.ts`, `useIdleReset.ts`, route in `App.tsx`.

- [x] 2. Kiosk auth + API-down handling
  - Acceptance: kiosk logs in as the Staff `desk.operate` account via existing
    `auth-api`; `/kiosk/*` guarded; network/401 shows "see a librarian", never a blank fail.
  - Verify: test that a failed request renders the block message.
  - Files: `features/kiosk/kiosk-session.ts`, guard in `KioskApp.tsx`.

- [x] 3. Camera scan — `features/kiosk/KioskScanner.tsx`
  - Tablet kiosk: the camera auto-starts and decodes (QR, or CODE_128/39/EAN
    when qr is false) via html5-qrcode; manual entry is the fallback. Translated
    labels, `role="alert"` on camera errors. Open #3 closed (one decoder, both
    symbologies). DeskScanInput left untouched for the desk UI.

- [x] 4. Attendance flow
  - Acceptance: scan QR → resolve → show name + in/out → check-in/out → confirm → idle.
  - Verify: test the resolve→check-in/out call sequence against a mocked API.
  - Files: `features/kiosk/AttendanceFlow.tsx`, `attendance-api.ts`.
  - Pre: read attendance controller for resolve/check-in request+response shapes.

- [x] 5. Borrow flow
  - Acceptance: scan QR → borrower → scan barcode → preview (title/due/blockers)
    → confirm → checkout with a fresh `requestId`; blockers surfaced verbatim.
  - Verify: test full sequence + that a blocker response stops checkout.
  - Files: `features/kiosk/BorrowFlow.tsx`, `desk-api.ts`.

- [x] 6. Search
  - Acceptance: no-identity search lists matches with availability.
  - Verify: renders results from a mocked `enhancedCatalog.search`.
  - Files: `features/kiosk/SearchFlow.tsx` (wraps `PublicCatalogPage embedded`).

- [x] 7. Polish + verify
  - Acceptance: full-screen kiosk layout, large touch targets, idle reset on
    every screen, all three languages complete.
  - Verify: `npm test` and `npm run typecheck` green.
  - Files: `features/kiosk/kiosk.css`, i18n strings.
