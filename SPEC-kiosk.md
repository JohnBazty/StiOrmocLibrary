# Spec: Library Self-Service Kiosk

## Objective

A touch-screen, self-service **kiosk front-end inside this monorepo** that lets a
student, with no librarian help:

1. **Log attendance** — check in / check out by showing their attendance QR.
2. **Borrow books** — self-checkout.
3. **Search the catalog** — find a book and see availability.

The kiosk is a new UI over the **existing API**. It is not a new system: no new
database, no API adapter, no second copy of any data. Returns are **out of
scope** — the librarian scans returning books in the existing app.

Users: *student* (walk up, do one task, leave; shared public tablet) and
*librarian* (handles exceptions).

### Acceptance criteria

- **Attendance:** student shows attendance QR to the tablet camera → kiosk calls
  the existing scan flow (`/scan/resolve` → `/scan/check-in` or `/scan/check-out`)
  → confirms name + in/out → returns to idle.
- **Borrow:** identified student scans a copy barcode → kiosk calls
  `circulation .../borrowing/preflight` → shows title + due date or the API's
  refusal reason (fines/limit) → on confirm calls `confirm-checkout` → success.
- **Search:** anyone (no identity) types a query → kiosk calls the public
  catalog titles endpoint → shows matches + availability. Informational only.
- **Idle reset:** after a short inactivity timeout the kiosk clears the current
  student and returns to idle.

## Where it lives

- New workspace `apps/kiosk` (React + Vite + Tailwind, same as `apps/web`), or a
  `/kiosk` route set inside `apps/web`. Decide in Plan; prefer whichever reuses
  the existing API client with least new code.
- Runs full-screen (browser kiosk mode) on a tablet.

## Auth model

- The kiosk runs under one dedicated **Staff service account** holding the
  `desk.operate` library permission (both attendance scan and desk borrow are
  guarded by it). The kiosk authenticates as this account via the existing JWT
  login; the student never logs in.
- The student is identified only by their signed attendance QR `payload`,
  validated server-side by `validateAttendanceCredential` — the same QR drives
  both attendance and borrow.
- The desk circulation service already performs checkout **on behalf of** a
  student from the QR payload (open #1 resolved — no API change needed).
- Requires the Postgres (Supabase) backend; the desk service rejects MySQL
  (`DESK_SCHEMA_UNAVAILABLE`).

## Reused API (existing — do not rebuild)

- **Attendance:** `POST /api/v1/admin/attendance/scan/resolve`,
  `/scan/check-in`, `/scan/check-out` (JWT + `desk.operate`).
- **Search:** `GET /api/public/catalog/titles` (public, rate-limited),
  `GET /api/public/catalog/titles/:id`.
- **Borrow (desk, on behalf):** `POST /api/v1/admin/circulation-desk/borrower`,
  `/preview`, `/checkout` (guard `desk.operate`). Bodies:
  - `borrower`: `{ payload: <QR>, mode: 'TakeHome' }` → borrower + eligibility + blockers.
  - `preview`: `{ payload, barcode, mode: 'TakeHome' }` → copy blockers (the preflight).
  - `checkout`: `{ payload, barcode, mode: 'TakeHome', requestId }` → performs the
    loan via `confirmCheckout`; idempotent on `requestId` (16–64 char
    `[A-Za-z0-9_-]`) via `circulation_scan_receipts`.
  Borrowing rules (limits, fines) stay enforced by the API; the kiosk only
  surfaces the returned blockers. Kiosk uses `mode:'TakeHome'` only; in-library
  use is out of scope.

## Input

- **Attendance QR + copy barcode:** tablet **camera**, decoded in-browser by one
  maintained QR/barcode library. Fallback to manual entry if the camera is
  unavailable.

## i18n

- Kiosk screens only: `en`, `fil`, `ceb`. A small per-screen string table in the
  kiosk, language toggle on the idle screen. The rest of the portal stays
  English — no app-wide i18n framework.

## Offline

- If the API is unreachable, the kiosk **blocks** the action and shows "try
  later / see a librarian." No local queue — queuing borrows risks
  double-lending, and the API is the authority on limits.

## Testing

- Reuse the repo's existing test setup (`npm test`).
- Unit: QR/barcode decode handling, the refusal-message mapping, idle-reset
  clears student state.
- Integration: kiosk calls against the existing API with a Staff kiosk session
  (attendance scan, preflight, confirm-checkout).
- The API's own modules already have tests; the kiosk adds tests only for new
  kiosk logic.

## Boundaries

- **Always:** call existing endpoints; clear student state on idle reset and
  after each task; keep the Staff kiosk credentials server-side / in device
  config, never in shipped JS.
- **Ask first:** any change to the existing API or database; adding a
  dependency; pinning the stack.
- **Never:** build a new DB, an adapter layer, or a second copy of
  catalog/patron/attendance data; store student QR or borrowing history in the
  kiosk; commit secrets or real student data.

## Success criteria

- A student completes attendance, borrow, and search at the kiosk with no staff
  help, each reflected correctly in the existing system.
- Kiosk exposes no other student's data; idle reset wipes state between users.
- No kiosk/Staff credentials in browser-delivered assets.
- API down → clear message, no corrupted state, no queued borrow.

## Open questions

1. ~~Checkout-on-behalf~~ — resolved: use desk circulation endpoints above.
2. **`apps/kiosk` vs `/kiosk` route in `apps/web`** — decide in Plan.
3. **Copy barcode vs attendance QR** are different codes/formats; confirm the
   one decode library handles both, else two decoders.
4. Tablet model / camera quality — adequate for QR in library lighting?
5. **Kiosk Staff account provisioning:** who creates the `desk.operate` account
   and how its JWT reaches the tablet (device config, not shipped JS).
