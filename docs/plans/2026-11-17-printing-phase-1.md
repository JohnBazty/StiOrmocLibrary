# Printing Phase 1 — document analysis, page review and service hours

- Why: let borrowers review the actual printable document and trusted page prices; give the library a clear photocopy review flow and configurable intake hours.
- Date created: 2026-11-17
- Date last updated: 2026-11-17
- Status: built
- Authorization: owner approved Phase 1 implementation and hosting, then a stop before Phase 2. Ask separately before any GitHub push.
- Branch: `codex/printing-phase-1`.

## How

The existing printing API now normalizes DOCX into a private PDF. That same artifact supplies page counting, a lazy canvas preview, per-page color/image findings and the staff print download. PDF.js runs in a terminable worker with bounded concurrency, page/image limits and a 25-second analysis deadline. DOCX conversion blocks external requests and alternate HTML chunks, checks archive expansion, and has a conversion deadline. Private previews support page navigation and zoom without a third-party viewer.

Print supports Monochrome, Colored and Automatic. Automatic prices only detected color pages at the colored rate; the queue and invoice list those pages so staff can configure output correctly. The system does not control the physical printer. Raster images and vector graphics can be scanned text, logos or outlines, so uncertain image additions require staff review. No semantic image classifier is claimed. Staff explicitly selects eligible image pages; each is counted once per copy. Global monochrome/colored image additions default to PHP 0. The base rates still come from the paper brand staff opened.

Quotes identify the owner, source hash, normalized artifact, renderer/analysis versions and paper dimensions. Changes to paper dimensions require a new preview; changed rates, loaded brand or setup version reject stale submissions. Accepted requests freeze page findings, brand, rates and additions. Submission keys prevent duplicate retries; one analysis cannot create two jobs. Responses never disclose storage references. At most five unsubmitted active previews are retained per owner. Expired unsubmitted artifacts are cleaned in batches of five by the existing durable job runner. Completed-job ten-day retention remains Phase 5.

Photocopy uses declared physical-original pages without pretending to analyze an absent upload. Staff verifies page count, image and color pages, and records a review note. The requester receives an in-app notification and accepts the final price. Gateway checkout, counter payment and print start stay blocked until acceptance. Closing intake does not block existing documents, receipts or payments. Existing payment/refund restrictions remain intact; practice provider payments still do not settle school financial records.

Library setup → Printing service contains image additions, weekly opening windows and date overrides in Asia/Manila. An existing emergency pause remains available in Printing queue. Dates without a scheduled window are closed when scheduling is enabled. The UI shows the next opening. Settings use optimistic versions, an audit log and existing Librarian authority; restricted staff can review pages but cannot change policy.

## Database

`053_printing_analysis_and_service_setup.sql` was applied individually after verifying the owner’s target, the 052 baseline and table ownership. SHA-256: `dcf8bbeed7d142539dd7ef8be773bff68a32bab65c4752dc0aec1544ea5919cb`.

New tables are `printing_phase_one_settings`, `printing_setup_events`, `printing_document_analyses` and `printing_price_review_events`. They enable RLS and deny PUBLIC/anon/authenticated grants, including identity sequences. Existing request columns keep their meaning; additive fields default legacy rows to Print and Ready. Before/after fingerprints match existing requests, rates, service status, stocks, receipts, cash records, accounts, users, loans and fines. The known historical 003 checksum gap remains unchanged. Latest applied 053; next unused 054.

## Verification and limits

- Final full API suite: 763 tests passed; final focused printing/runner checks also passed.
- Full web suite: 538 tests passed. Typecheck and production build passed.
- Actual DOCX conversion: two pages, matching analysis and normalized PDF; monochrome and colored text distinguished.
- Compiled analyzer benchmark: 100 pages, 50 colored pages correctly identified, about 2.5 seconds under concurrent verification load.
- Disposable Postgres covers ownership, stale prices, retry keys, immutable accepted costs, photocopy review/acceptance, denied checkout/cash before acceptance, schedules, cleanup and RLS/browser denials.
- UI checks cover analysis reuse, no second upload on copies change, photocopy originals, draft preservation, review-before-save and staff verification.
- Existing private `printing-documents` bucket verified. No uploaded student files were made public.
- Production dependency audit reports two existing moderate findings in ExcelJS/UUID, no high or critical findings and no new analyzer advisory.
- Native browser interaction remains unavailable after the earlier access-policy refusal. Visual/mobile/device checks are not claimed; responsive classes, DOM interaction checks and HTTP/deployment checks provide limited verification.
- Deployed upload cap remains 4 MB because of the existing Vercel request-body constraint; localhost uses 10 MB. Both limits appear accurately in the UI. Converted PDFs may be larger and go directly from the API to private storage.

## Implementation tracking

- [x] Phase 1 implementation and focused workflow verification.
- [x] Full API/web checks, typecheck and build.
- [x] Additive migration with preservation and privacy checks.
- [x] Sync and verify the served localhost checkout.
- [x] Deploy, check candidate, promote and verify canonical live site.
- [x] Record final source/deployment IDs and stop for Phase 2 approval.

## Change log

- 2026-11-17: Owner authorized Phase 1, hosting after each approved phase and a stop before Phase 2. Implemented and applied migration 053; localhost synced and running with a healthy/ready API and HTTP 200 website. Production source `aa9ea68e90355320284c8a212d4593bf88ba182a` is live as `dpl_8RKW7QLYLvJv9ufKmnhyDPrG98Sb` at https://sti-ormoc-smart-library.vercel.app. Candidate and canonical HTTP/schema/assets checks passed; the existing scheduled runner completed the new preview-cleanup job successfully. Private preview/setup requests return 401 without sign-in. Native browser visual/mobile checks remain unverified. No GitHub push; Phase 2 awaits the owner. No GitHub push.

## Release record

- Runtime source: `aa9ea68e90355320284c8a212d4593bf88ba182a` (main feature commit `4e69a9f0fe7c4e2f776195147a1410f2c3f56e3e`, followed by the Vercel asset-glob limit fix).
- Deployment: `dpl_8RKW7QLYLvJv9ufKmnhyDPrG98Sb`.
- Canonical: https://sti-ormoc-smart-library.vercel.app.
- Local server: http://localhost:5173; restarted from `StiOrmocLibrary-main-sync`, API health healthy with schema ready and no missing columns/tables.
- Candidate and canonical checks verified route assets for Print/Photocopy, page preview/zoom, staff price review and service setup, plus healthy API/schema. These are asset/HTTP checks, not an authenticated production checkout or device visual test.
- New scheduled preview cleanup completed successfully through the existing hosted runner. Sign-in is required on private preview/setup routes.
- Local source matches the runtime change, retaining existing local-only payment configuration and schema-readiness adjustment. Local dependencies retain unrelated earlier versions; the reported two-moderate/no-high audit applies to the release checkout, not all inherited local development tooling.
- Deployment packaging uses an include glob under Vercel’s 256-character limit and excludes unused PDF.js builds/maps. No deployment credentials, private env files or student print documents were included in the source archive.
- No GitHub push. Stop here; request approval before Phase 2.
