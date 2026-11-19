# Stocktake: webcam barcode scanning with condition pop-up and KPI updates

Why: Staff need to turn on the computer's webcam inside Stocktake, scan a copy's Code 128 label, identify the book's condition in a pop-up, and have damaged or repairable copies marked and saved directly into the matching inventory KPI filters (`Books in repair` / `Damaged copies`, and research equivalents).

Date created: 2026-11-20
Date last updated: 2026-11-20
Status: built

## What changed

### 1. Lookup and condition-update API (`apps/api/src/modules/inventory/`)
- **`GET /api/v1/admin/stocktake/:id/lookup?code=...&codeType=barcode|accession`** (`stocktake.routes.ts`, `stocktake.service.ts`): looks up a scanned code inside an active count without saving yet. Returns title, accession, barcode, shelf, recorded condition, availability, lifecycle, loan state, whether the item is in scope, and whether it was already counted. Protected by `requireLibraryPermission('library.manage')`.
- **`POST /api/v1/admin/stocktake/:id/scan`** (`stocktake.service.ts`, `stocktake-report.ts`):
  - Saves the count observation idempotently by `requestKey`.
  - When the chosen condition is `for_repair` or `damaged`, calls the existing canonical inventory services (`overrideInventoryCondition` for books, `auditThesisCondition` for research) so the copy's condition, availability (`Unavailable`, unless currently `Borrowed`), reservation hold release, and audit log are updated cleanly.
  - Copies in `Good` or `Worn but usable` (`fair`) remain count observations only; archived or `Lost` copies are never overwritten automatically; unchecked copies are never marked lost automatically.
  - Stores the applied condition/version in the scan snapshot so retries with the same `requestKey` never double-update inventory and the count report does not falsely flag its own condition update as an unexpected mid-count change.
  - Returns `scanResult.inventory` (`none`, `applied`, `unchanged`, `skipped`, or `failed` with a user-safe reason).
- **No database migration needed:** uses existing `stocktake_scans.scan_source = 'scanner'` and `lookup_snapshot`. Latest migration remains **073**, next unused **074**.

### 2. Webcam scanner and condition pop-up (`apps/web/src/features/inventory/`)
- **`StocktakeCameraScanner.tsx`**: continuous webcam reader powered by `html5-qrcode` (already installed).
  - Reads **Code 128** copy labels only (uses `useBarCodeDetectorIfSupported` where available, requests 1280×720).
  - Requires **2 matching reads within 1 second** before accepting a code (drops half-read/blurred frames).
  - Trims surrounding spaces and rejects empty, over-100-character, or control-character reads while preserving leading zeros.
  - Ignores the same code for **3 seconds** after acceptance and restarts the hold when the pop-up closes.
  - Pauses reads while the condition pop-up is open; supports switching between multiple connected cameras cleanly (waiting for the previous camera to stop before starting the next); releases the camera on unmount, tab hide, count switch, review/cancel, or finished count.
  - Plain-language recovery messages for blocked permission, missing camera, camera in use, or non-HTTPS pages; typed and Barcode-to-PC scanning remain available at all times.
- **`StocktakeConditionDialog.tsx`**: accessible modal pop-up shown when the webcam detects a label.
  - Displays the book/research title, accession, barcode, shelf, recorded condition, and warnings (already counted, outside scope, on loan/in use, archived, or recorded lost).
  - Preselects the item's recorded condition (never preselects for a lost copy).
  - Clearly explains where `Damaged, can be repaired` (`Books in repair` / `Research in repair`) and `Damaged beyond repair` (`Damaged copies` / `Damaged research`) will be saved.
  - Detects unrecognized 13-digit `978`/`979` codes and explains that publisher ISBNs identify titles rather than individual copies, while still allowing staff to record an unrecognized code for review.
  - Keeps the pop-up open on network failure and reuses the same `requestKey` on retry (generating a new key if the user changes the condition).
- **`StocktakePage.tsx` & `BarcodeToPcInstructions.tsx`**:
  - Adds the `Scan with camera` toggle (enabled once a location is chosen), recent 5 camera scans list, plain-language status feedback, and direct KPI filter links (`See Books in repair`, `See Damaged copies`, `See Research in repair`, `See Damaged research`).
  - Adds plain-language webcam instructions alongside the existing Barcode to PC guide.
- **`InventoryDashboard.tsx`**:
  - Honors valid `?condition=` query parameters for both books (`Good`, `Fair`, `For Repair`, `Damaged`, `Lost`) and research (`?resource=research&condition=...`) so KPI links from Stocktake land directly on the matching filtered list.

## Implementation tracking

- [x] 1. Branch `feat/stocktake-webcam-scan` created; unrelated files untouched
- [x] 2. Failing tests written first for API lookup/scan/KPI update, `StocktakeCameraScanner`, `StocktakeConditionDialog`, `StocktakePage`, and `InventoryDashboard`
- [x] 3. `StocktakeCameraScanner` with stable-read, repeat-hold, pause, camera switch serialization, and plain error handling
- [x] 4. API lookup route + scan inventory condition update (`for_repair` / `damaged`) + idempotency and report baseline update
- [x] 5. `StocktakeConditionDialog` + `StocktakePage` wiring, recent scans list, KPI filter links, and `InventoryDashboard` query-filter fix
- [x] 6. Updated instructions card with webcam scanning steps
- [x] 7. Run `npm test`, `npm run typecheck`, `npm run build`, and coverage
- [x] 8. Run dev app and inspect Stocktake screen in browser (real hardware webcam + printed label check noted for Ethan)
- [x] 9. Combined security, correctness, and React review of branch diff; fix findings
- [ ] 10. Ask Ethan before push or PR

## Change log

- 2026-11-20: Plan created from code review of stocktake, `DeskScanInput`, and label renderer.
- 2026-11-20: Updated design per Ethan's flow (webcam scan → condition pop-up → `for_repair`/`damaged` updates live inventory and KPI filters), implemented with tests, and marked `built` after verification.
