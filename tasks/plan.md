# Plan: Library Self-Service Kiosk

Spec: `SPEC-kiosk.md`. Goal: a thin `/kiosk` UI in `apps/web` over existing APIs.
No new DB, adapter, or BFF. Returns out of scope. Offline = block.

## Decisions

- **Location (#2):** a `/kiosk` route set inside `apps/web` (new
  `src/features/kiosk/`). Reuses `enhancedRequest`, `enhancedCatalog`,
  `auth-api`/`auth-storage`, `PublicCatalogPage`, the Vite build and deploy. No
  new workspace.
- **Identity:** the kiosk logs in once as a Staff `desk.operate` service account
  (existing `auth-api`); token held in `auth-storage`. Students identified by
  scanned attendance QR only.
- **Camera:** one in-browser decoder for both attendance QR and copy barcode;
  manual entry fallback.

## Reused building blocks (already in repo)

- `features/catalog/enhanced-catalog-api.ts` → `enhancedRequest`,
  `enhancedCatalog.search/detail` (public catalog).
- `features/catalog/PublicCatalogPage.tsx` (`embedded` prop) for search UI.
- `features/auth/auth-api.ts`, `auth-storage.ts` (`getAccessToken`).
- Desk endpoints `/api/v1/admin/circulation-desk/{borrower,preview,checkout}`.
- Attendance endpoints `/api/v1/admin/attendance/scan/{resolve,check-in,check-out}`.

## Build order (each slice TDD, committed separately)

1. **Kiosk shell + routing.** `/kiosk` idle screen, task nav
   (Attendance / Borrow / Search), inactivity timeout that clears student state
   and returns to idle. Language toggle (en/fil/ceb) via a small per-screen
   string table in `features/kiosk/i18n.ts`. No backend yet.
2. **Kiosk auth.** Log in as the Staff `desk.operate` account using existing
   `auth-api`; store token; guard `/kiosk/*`. Surface "API unavailable → see a
   librarian" on any network/401 failure (the offline-block behavior).
3. **Camera input — reuse `features/circulation/DeskScanInput.tsx`.** It already
   decodes QR and CODE_128/39/EAN (via its `qr` flag), with camera, image upload,
   and typed/USB fallback, and an `onScan(value)` callback. Open #3 resolved — one
   component handles both. The kiosk flows import it directly; pass translated
   `label`/`actionLabel`. No new scan module.
   Known limit: DeskScanInput's camera/upload sub-strings and colors are the desk
   UI's (English, portal blue); not re-themed for the kiosk in v1 to avoid
   editing the shared desk component.
4. **Attendance flow.** Scan QR → `POST .../attendance/scan/resolve` → show name
   + whether checking in or out → `POST .../scan/check-in|check-out` → confirm →
   idle. (First task: read the attendance controller to confirm resolve/check-in
   request+response shapes.)
5. **Borrow flow.** Reuse `DeskScanInput` (qr for the student QR, barcode for the
   copy). Scan QR → `POST .../circulation-desk/borrower {payload,mode:'TakeHome'}`
   → scan copy barcode → `POST .../preview {payload,barcode,mode}` → show title,
   due date, blockers → on confirm `POST .../checkout {payload,barcode,mode,requestId}`
   with a fresh `requestId` per attempt → success or the API's blocker message.
6. **Search.** Mount `PublicCatalogPage embedded` (or call `enhancedCatalog.search`)
   in a kiosk layout; no identity. Availability already in the response.
7. **Polish + verify.** Full-screen kiosk CSS, large touch targets, idle reset
   covering every screen, i18n strings complete for all three languages.
   Run `npm test` and `npm run typecheck`.

## Risks

- **Desk endpoints need `desk.operate`** — the kiosk account must have it;
  provisioning is open #5 (ops, not code).
- **Postgres required** — desk service rejects MySQL. Dev/prod must run Supabase.
- **`requestId` idempotency** — generate per checkout attempt; reuse on retry of
  the *same* attempt only, else `DESK_REQUEST_REUSED` (409).
- **Camera in library lighting** (open #4) — manual fallback covers it.
- **Shared public tablet** — idle reset must wipe student state on every path;
  test it explicitly.

## Out of scope

Returns (librarian desk), in-library use mode, any API or DB change, app-wide
i18n, a local offline queue.
