# File previews across the library system

- **Why:** Users must recognize the image or document they selected before sending or publishing it.
- **Date created:** 2026-10-17
- **Date last updated:** 2026-10-17
- **Status:** built

## How

Use `SelectedFilePreview` in all ten current file pickers (nine active screens/components and the retained, unrouted interactive floor-plan editor). Show the full filename, size, image/PDF contents, a readable Word sample or spreadsheet sample, and a removal button. Keep the existing upload validation and permission checks. Previewing does not save a transaction. The printing service still analyzes the selected document automatically to calculate its official page count and price; import inspection still recognizes columns automatically.

Floor-plan publishing and saved QR/code images need an explicit action after selection. Images must remain uncropped in the review. Office previews are samples, not an authoritative page count or exact print layout. Do not use external document-viewing services. Release temporary browser URLs after replacement or closing.

Images use temporary local URLs. PDFs use an on-demand PDF.js canvas renderer with page navigation and an original-file link. Fonts, character maps, workers and image decoders are bundled locally, including license files. This avoids blank embedded PDF plugins on mobile/in-app browsers. See [Mozilla's rendering examples](https://mozilla.github.io/pdf.js/examples/). Loading tasks, render tasks and object URLs are released when removed or replaced.

DOCX shows a limited text and embedded-raster-picture sample. XLSX/CSV shows at most 30 rows, 24 columns and 30 worksheets; saved values are displayed without calculating formulas. Word fields, external document relationships, scripts and embedded HTML are not executed. Office reading is capped at 8 MB compressed, 32 MB declared expanded data, 12 MB per part and 2,000 ZIP entries. The preview has separate loading and failure messages; it does not replace server validation or increase existing form upload limits.

## Coverage

- Catalog cover, digital-book PDF and supplier replacement quotation.
- Profile picture, including an uncropped selection in addition to the circular avatar.
- Student print document uses a compact PDF/DOCX icon, filename, size and remove control per the owner's later clarification. Contents are not rendered here; automatic server page counts and quotes remain.
- Excel/CSV holdings import, preserving column recognition, review, overlap handling and resumable saves.
- Published floor image and the retained interactive editor's background selection, without restoring its route.
- Attendance QR image and circulation QR/barcode image, with explicit reading after preview.

The cover is encoded from the selected file at submission, preventing an older FileReader completion from replacing a newer selection. Successful uploads clear native file inputs; failed uploads retain their selected file for retry. Removing a print file also invalidates its quote and ignores analysis results arriving afterward. Digital upload permission confirmation remains required.

## Implementation tracking

- [x] Shared preview with readable loading/failure states and bounded local document reading.
- [x] Cover, digital book, quotation, profile, printing and holdings-import pickers.
- [x] Floor-plan and code-image review before publishing/scanning.
- [x] Focused tests, frontend build and visual check using disposable files.
- [x] Record coverage and device limits.

## Verification

- **79 tests passed in 13 files** covering preview cleanup/replacement, late reads, malformed Office input, CSV quoting, spreadsheet types, PDF page navigation/worker cleanup, upload failure retry, no publishing/scanning on selection, digital permissions, profile review, import overlap/save handling and existing circulation flows.
- After the Printing service clarification, **16 focused component/printing tests passed** (including both PDF and DOCX icons, no content parsing in icon mode, removal and official page counting). The frontend production build passed again.
- Frontend production build passed. Existing main-bundle size warning remains; PDF and ZIP readers are loaded on demand.
- Browser checks used disposable generated PNG/PDF/DOCX/XLSX/CSV files. Contents were visibly rendered; removing a selection cleared it. The initial native PDF iframe was blank and was replaced with the verified canvas renderer.
- Verified 390 × 844 viewport without horizontal page overflow and the normal 1280-pixel desktop viewport. No browser warning/error logs appeared during the sample checks. Temporary fixture page/source and agent tab were removed; viewport restored.
- Evidence: `output/upload-preview-qa-20261017/image-mobile.png`, `word-mobile.png`, `pdf-mobile.png`, `image-desktop.png` and `build.txt` (ignored local files).
- Limits: browser checks used the actual shared component with synthetic files; individual form workflows used mocked APIs in component tests. No real files were submitted, real records changed, live camera/scanner used, physical phone tested or deployment performed. Password-protected/damaged/oversized/unsupported previews show a readable fallback rather than claiming success. Word previews are samples, not exact page layouts.

## Change log

- 2026-10-17: Started owner-requested system-wide upload previews. No database changes or migration required; applied Postgres remains 027, draft 028 is unapplied; MySQL reference 048 / next 049.
- 2026-10-17: Completed picker integration, explicit floor-image publishing/code-image reading, PDF canvas rendering after browser evidence showed a blank native viewer, focused tests and responsive sample verification. Recorded the permanent upload-preview rule in `agent.md`.
- 2026-10-17: Owner clarified the Printing service should show a file-type logo/card rather than document contents. Added an icon-only display that performs no local document parsing/rendering; retained filenames, sizes, removal, official page counting and pricing. Other upload forms retain their content previews.
