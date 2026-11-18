# Library service priorities implementation plan

Current release (2026-11-17): Phases 5 and 6 are built and hosted from `C:/Users/JOHN/Documents/SSL/StiOrmocLibrary-main-sync`, branch `feat/phases-5-6`. Applied Postgres 058, next unused 059 in that active source. The runtime files in this original checkout are older. See [release and verification](2026-11-17-phases-5-6.md). No GitHub push.

- Date created: 2026-11-17
- Date last updated: 2026-11-17
- Status: inprogress
- Goal: improve circulation speed, printing accuracy, payment assurance and actionable library oversight.
- Architecture: extend the existing React/Vite interface and Express modular monolith, using Postgres-only changes, private storage and the existing durable 019 job runner.
- Tech stack: existing TypeScript/React/Tailwind, Express, pg/Supabase Postgres, PDF/DOCX conversion, receipts and notification/email workers. Evaluate additional rendering/Web Push dependencies before choosing them.

## Why

The owner requested a coordinated roadmap with complex workflows first. Existing payment, printing, notification and collection-review foundations should be extended rather than duplicated. The target Admin layout must place Today's priorities above analytics, independently of the implementation order.

Phase 1 implementation and hosting are authorized. Phases 2–7 remain planned; stop and ask before Phase 2. GitHub pushes still require a separate question. Migration 053 is reserved for the additive printing update after verifying the live 052 baseline. See the Phase 1 work record for actual rollout and checks.

## Confirmed decisions

- Delete completed print documents after ten days, not after ten files. Keep invoices, financial receipts, payment proof and history. Protect active work and files under an explicit dispute/retention hold.
- Pay-later may cover printing, photocopying and other legitimate charges, with no monetary balance cap. Users may pay part physically and leave the balance for later.
- Do not invent a mandatory payment deadline or extra debt penalty. Support an agreed payment date when one is provided.
- Final clarification: overdue-book fines start automatically from the saved due date/time. There is no warning grace period or extra day. This supersedes the earlier broader request for warnings before every fine.
- Conduct violations receive first, second and final warnings before the next qualifying offense can incur a fine. Confirm counter scope/reset policy before building.
- Lost-book replacement and irreparable-damage charges follow librarian review rather than waiting for warnings.
- Exclude the email/standalone image-print-attachment item following the owner's cancellation of that question. Current PDF/DOCX inputs remain. Embedded-image analysis, document previews and separately requested GCash proof-image uploads remain in scope. Confirm this interpretation if standalone print-image uploads are requested again.
- Student/Faculty gets a distinct shopping-style interface. Request queues remain tables on both sides.
- Ask before any GitHub push. The owner authorized Phase 1 implementation and hosting, then requested a stop before Phase 2.

## Current findings

- AdminDashboardPage places analytics and CollectionSnapshot before DashboardActionCards, which already renders Today's priorities.
- App-generated book labels use Code 128 in book-label.renderer.ts. This does not verify the barcode encoding, numbering or scanner configuration physically used by the school.
- StudentReservations and AdminReservationQueuePage currently use request tiles.
- printing.document.ts already counts PDF pages and converts DOCX to printable PDF. Extend that pipeline; validate output against selected paper dimensions and actual printing.
- StudentPrintingPage uses an icon-only SelectedFilePreview under an October instruction. The new content-preview requirement supersedes that restriction when implemented; update agent.md then.
- Printing receipt read/PDF routes, payment verification, private storage, announcement notifications, school email and the durable runner already exist.
- Existing damage cases have repaired_available, damaged_held and lost dispositions. Beyond-repair damage must remain distinct from a genuinely missing book.
- Collection review already evaluates age/requirements and stores alerts. Its general five-year age partition is a review signal, not proof that every older book is obsolete.

## Delivery order

| Order | Phase | Reason |
| --- | --- | --- |
| 1 | Final-document analysis, preview and printing price engine | Very high complexity; errors affect money and stock |
| 2 | Payment assurance, partial cash/pay-later, proof and GCash controls | Very high complexity; balances and receipts must reconcile |
| 3 | Conduct warnings, exact overdue fines and urgent alerts | High complexity; policy, history and clock boundaries |
| 4 | Barcode verification, automatic scan intent and damage assessment | High complexity; preserve copy identity and inventory |
| 5 | Announcement Web Push, collection alerts and ten-day expiry | High complexity; background delivery, privacy and deletion |
| 6 | Dashboard order, request tables, stable buttons and student design | Apply stable workflows to a responsive interface |
| 7 | Consistent filtered exports and complete acceptance | Reports depend on preceding authoritative contracts |

Complex phases come first. Today's priorities must be the first dashboard content section once that UI update ships. A small standalone placement fix may ship earlier if the owner chooses it.

## Phase 1: document analysis, preview, printing and photocopying

Phase status: **built and hosted**. See [verification and release](2026-11-17-printing-phase-1.md). Phases 2–7 remain planned.

### How

1. Select Print or Photocopy, choose paper/copies, supply the document when applicable, analyze, preview, review an itemized price, then choose payment or authorized pay-later.
2. Print keeps the existing PDF/DOCX inputs. Photocopy can use physical originals with a Bring originals to the counter instruction. Staff verifies pages/color before a final bill; do not claim automated analysis of originals that were never digitized.
3. Convert DOCX into the exact printable PDF. Use the same artifact for preview, pagination, analysis and printing. Link analysis to source hash, output settings and renderer version; rerun when changes affect pagination.
4. Add a private, lazy Preview document dialog with page navigation, zoom, filename/size and replacement/removal. No public third-party document viewer or execution of document scripts/macros.
5. Record per-page image/graphic content and actual color. Black-and-white images do not require color; colored text can require color without pictures.
6. Validate scanned-text pages, logos, diagrams, transparency and repeated image objects. Do not surcharge solely because a PDF contains raster objects. Uncertain classifications need visible review before extra charges.
7. Show findings such as images on pages 2 and 5 and color on page 5. Proposed output options: Automatic/mixed, All monochrome, All color, subject to validated printer behavior.
8. Admin controls a versioned image-page surcharge, with optional paper-size/output-mode rules. No fee amount is invented. Each eligible page is counted once per copy, regardless of picture count: two eligible pages and three copies are six surcharge units.
9. Base rates still follow the paper brand Admin opened. Freeze accepted rates, page findings, surcharge version, copies and paper choice. Later price/stock changes do not rewrite accepted or paid bills.
10. Separate base printing, image-page extra, service total and any gateway transaction fee. The server calculates trusted totals.
11. Add Print service hours in Library setup: weekday windows, exceptions/holidays, next opening, emergency pause and resume. Enforce Asia/Manila time on the API. Closing intake does not hide past jobs or block paying/viewing existing receipts.

### Targets

- Existing: apps/api/src/modules/printing/printing.document.ts, printing.service.ts, printing.repository.ts, printing.storage.ts, printing.validation.ts and printing.routes.ts.
- Existing: apps/web/src/features/printing/StudentPrintingPage.tsx, AdminPrintingQueuePage.tsx, printing-api.ts and existing PDF preview components.
- Proposed: focused page-analysis service/read model, analysis/derivative metadata, per-page preview and versioned image-fee/service-hours configuration.

Benchmark CPU, memory, output size and hosting timeouts before choosing synchronous versus existing-runner processing. Do not create a second scheduler or unrelated microservice by default.

### Acceptance

Known PDF/DOCX samples match printed/preview page counts. Monochrome images do not force color. Scanned text is not blindly surcharged. Mixed-page totals/copies reconcile. A changed paper/rate invalidates a stale unaccepted quote; accepted invoices stay frozen. Closed-hours submissions are rejected by the API too.

## Phase 2: payment assurance, partial cash, pay-later and GCash

### How

- Extend existing charge/payment allocations through a common receivables service. Each domain retains one authoritative charge. Do not create a separately editable Admin balance or duplicate a debt as both a fine and another charge.
- Counter flow: amount received now plus remainder payable later. Example: PHP 100 charge, PHP 40 cash received, PHP 60 unpaid. Receipt is for PHP 40 only; the account/bill shows PHP 60 remaining. Zero payment creates an unpaid-charge acknowledgment, not a paid receipt.
- No balance cap. A debt still needs a legitimate service/assessment, identified user and authorized staff action. Later cash or eligible GCash settles the remainder without duplicate allocation or overpayment.
- Only confirmed received money increases collections. Cash and online funds remain separate; unpaid debt is neither collected nor withdrawable. Only eligible confirmed online funds enter online withdrawals.
- An explicitly approved pay-later print job can proceed while Payment due/Partially paid. Record librarian approval, staff identity/reason and borrower acknowledgment. Never label an unpaid bill Paid to bypass printing checks. Keep refunds restricted to before printing first starts.
- Refresh user transactions, queue, funds, account standing and reports from confirmed results. Apply existing approved borrowing/clearance policy consistently; do not silently invent a new debt block or deadline.
- Xendit verification remains authoritative: authenticate the correct product's callback, match identifiers/amount/currency and deduplicate events. Browser return, wallet PIN and screenshot are not payment confirmation.
- Make verified online printing receipts downloadable from the request and Transactions. Reuse approved receipt/PDF formats and genuine references.
- Upload GCash receipt adds supporting evidence, with local image preview, owner scope, validation and private storage. Attaching a picture to an already verified payment never applies its amount again.
- If manual school GCash transfers are supported, evidence remains Awaiting verification until a librarian matches the actual transaction. Reject reused references and amount conflicts; retain review history. Appearance alone cannot approve payment.
- Admin printing table shows payment state, verification source/reference and compact View proof/View receipt actions in a secure drawer.
- GCash availability belongs in Library setup and is enforced on new quote/checkout creation. Existing pending payments, callbacks, reconciliation and receipts continue when disabled. Cash/pay-later controls remain separate. The switch does not create credentials or switch the gateway environment.

### Targets and data design

Use apps/api/src/modules/payments/, printing payment/receipt modules, fines/fines.service.ts and existing allocation repositories; apps/web/src/features/payments/ and printing receipt/request/queue views.

Before schema authoring, map existing cash/fine/online allocations and receipt sources. Prefer adapters/extensions to a parallel money ledger. Add explicit deferred-payment approval, proof metadata/review events and audited availability settings as needed. Use exact money arithmetic, row locks, authorization and idempotency.

### Acceptance

Partial cash plus later settlement pays one charge exactly once. Two tabs/staff cannot both collect the same balance. Duplicate callbacks, screenshots and forged return URLs do not clear bills. Unpaid debt never increases collections/withdrawals. GCash disable does not strand an existing checkout. Refunds/reversals update balances without erasing history.

## Phase 3: conduct warnings, exact overdue fines and urgency

Detailed violations-records workflow, policy decisions, migration safeguards and acceptance: [Phase 3 violations plan](2026-11-17-violations-phase-3.md) (built and hosted, 2026-11-17). The owner subsequently authorized this records implementation and hosting; see the work record for the served checkout, deployment and remaining human acceptance.

- Conduct progression: first warning, second warning, final third warning, then fine eligibility on the next qualifying incident. Record incident, staff, warning stage and notice. Confirm whether counts are per category/term and when they reset; do not silently combine unrelated incidents.
- Overdue books have no warning grace. Accrual starts from the exact stored due timestamp and approved rates/caps, preserving operating-day rules. Delayed jobs catch up from the same timestamp rather than adding a day.
- Replacement/irreparable-damage costs follow librarian assessment. Students can report observations, not approve charges or write off stock.
- Use prospective versioned rules. Preserve old assessments, paid fines, receipts and adjustments. Do not silently erase or reprice existing unpaid balances.
- Configurable alert triggers: outstanding amount, days overdue and days unpaid. Show days since the actual deadline separately from days since assessment. Partial payment reduces balance without resetting age.
- Put deduplicated urgent cases in Today's priorities/inbox, with details and last-notified time. Do not alert on every refresh or expose balances in lock-screen text.
- Reuse existing school-email and notification workers without starving OTP delivery. Do not add automatic debt penalties without a school-approved rule.

Targets: fines services/policy/infraction modules, circulation-overdue.service.ts, notification workers, AdminFinesPage, DashboardActionCards and DashboardTaskTable. Add append-only warning events and scoped/versioned policy only as needed.

Acceptance: exact before/at/after due-time boundaries, Manila/UTC clocks, closed days, duplicate runner execution, concurrent incidents, preserved history, three conduct warnings and reviewed replacement charges.

## Phase 4: barcode verification, smart scanning and damage

- Inspect an actual school copy barcode, accession label, scanner configuration and library manual before changing recognition. Current app-generated Code 128 does not establish the physical school's format.
- Distinguish ISBN (edition/title), accession/copy ID (physical holding), and barcode symbology (encoding). Do not identify one physical copy by a shared ISBN.
- Review school policy and applicable CHED/accreditation sources. CMO 22 s. 2021 is a library-requirements reference, not proof of a mandated barcode encoding. Campus barcode compliance remains unverified. Preserve identifiers/links; use reviewed aliases where needed instead of renumbering.
- User QR identifies the borrower. A copy with an active loan proposes Return. An available copy with a selected borrower proposes Borrow. A user QR alone cannot determine intent when the person has both returns and new borrowing.
- Existing policy handles ready reservations, damaged/unavailable copies, restrictions, ambiguous matches and different current borrowers. Detect automatically but show a clear action/condition review before saving; retain manual fallback.
- Debounce camera frames and use transaction-safe idempotency so repeated scanning cannot return then immediately reborrow a copy.
- Condition choices: No damage; Damaged—can be repaired; Damaged—beyond repair. Student choices are observations. Librarian confirms disposition, evidence and cost. Beyond-repair returned copies remain distinct from missing books. Repairable copies go to repair; authorized repair can restore availability.

Targets: catalog/book-label.renderer.ts and asset-code modules; circulation/desk-circulation.service.ts, circulation.service.ts, circulation-case modules and current scanner/counter views.

Acceptance: actual scanner/camera samples, leading zeros, legacy values, ISBN/copy ambiguity, repeated frames, reservations, simultaneous staff use and all condition paths. Inventory, history and worklists must agree.

## Phase 5: Web Push, collection alerts and ten-day cleanup

### Announcements without an open foreground app

Use standards-based Web Push, a service worker and explicit permission. Keep subscriptions per user/device, support unsubscribe and target only permitted recipients of published/scheduled announcements. A push tap reopens the authorized announcement; withdrawn/private content is checked again.

Reuse the notification/outbox/runner infrastructure. Deduplicate by revision/recipient/device, retry transient failures and retire expired subscriptions. Accepted by push service is not proven delivery/read. Keep existing in-app and school-email channels; these are unrelated to the cancelled email-attachment feature.

On supported devices the app need not be open in a foreground tab. Internet, permission and browser/OS settings still apply. iPhone/iPad requires the supported Home Screen app flow. Validate on real devices; do not promise delivery with all browsers/OS processes closed. Keep secrets server-only and lock-screen content minimal.

### Old or possibly obsolete books

Extend existing collection review/alerts. Show copyright/publication age, edition, subject/program, use and review reason. Use subject-specific configured requirements and verified sources; old age alone does not prove obsolescence. Unknown year is Needs information. Classics/local history need librarian decisions. Notify for review/replacement, never automatically remove holdings/history.

### Document expiry

Use completion/expiry metadata. Delete completed-job source documents, normalized PDFs and thumbnails after ten days unless explicitly held. Keep active jobs, receipts, GCash proof, invoices, payments and history. A remaining unpaid balance survives file expiry.

Use scoped object manifests and one idempotent existing-runner cleanup job. Retry failed deletions and record outcomes. Expired file controls show unavailable instead of broken downloads. Cleanup reduces object-storage use; documents should not be stored as database blobs.

Targets: existing notifications repository/worker/routes and announcement pages; manifest/service-worker registration; collection-review modules; printing.storage.ts and durable job services.

Acceptance: permitted/denied/unsubscribed push, targeted audiences, duplicate events, app-not-open Android/desktop/supported iOS; exact ten-day boundaries, held/active retention, financial evidence retained and retry-safe deletion. No collection alert automatically removes a copy.

## Phase 6: dashboard order and distinct user design

Admin content order: Today's priorities first, actionable overdue/debt/verification work next, then analytics and collection snapshot. Keep the compact operational interface.

Student/Faculty: shopping-style catalog, prominent search/categories, cover cards, floating cart, request tracking, transactions and clear balance. Reuse shared backend rules; no second financial/auth system.

| Palette role | Color |
| --- | --- |
| Brand blue | #0B5EA2 |
| Brand yellow accent | #FFF200 |
| White surfaces | #FFFFFF |
| Student primary actions: teal | #0F766E |
| Strong text: navy | #102A43 |
| Page background: soft blue-gray | #F4F8FC |
| Supporting text: slate | #52667A |

Use dark text on yellow and verify contrast. Green means success, amber warning, red errors. Include dark theme, keyboard focus and phone layouts.

- Reserve buttons retain a fixed action area/minimum width. Spinners and Reserve/Reserved/Error states do not move the action. Preserve stable keys, card height, scroll, filters and drafts on refresh.
- Both request queues become semantic tables. Shared columns: title, request type/date, queue/status, pickup/deadline and actions. Admin adds borrower/program/copy information. Use original queue sequence for waiting work, paging/filtering and separate history. Phones retain an accessible horizontally scrollable table rather than tiles.
- Use existing RowActions and compact icon buttons for view, proof, receipt, download, edit and archive, with accessible names/tooltips. Keep Pay/Confirm understandable where unexplained icons could cause errors.
- Refresh confirmed statuses and remove invalid actions while preserving open forms and draft inputs.

Targets: AdminDashboardPage, DashboardActionCards, StudentReservations, AdminReservationQueuePage, catalog pages, AppLayout and role-scoped tokens.

Acceptance: phone (360/390px), tablet, desktop, long titles, empty/error/loading states, keyboard/high zoom; reserve-action position stays stable; Student theme does not alter Admin controls or hide actions.

## Phase 7: filtered reports and final acceptance

Reuse report sources/exports. Offer date range and appropriate date basis, status, program/department, borrower and service filters for fines, books/inventory, loans, requests/reservations, printing/photocopying and payments. Label acquisition, due, received and assessed dates distinctly.

Screen counts/totals and CSV/PDF share identical filters. Export all matching rows, not just the current page. Apply Manila boundaries, show criteria/generated time/source and retain permissions. Keep confirmed collections separate from unpaid debt. Large exports can use the same runner with private expiring downloads.

Verify quote/page/stock/invoice agreement; partial payments and refunds; exact overdue boundaries; warning stages; safe scan detection; targeted push/retries; ten-day cleanup; both queue tables and role themes; matched exports and preserved records.

For each approved implementation, run relevant unit/Postgres checks, npm test, npm run typecheck and npm run build. Add real-device camera, final document-output, push and payment acceptance as applicable. Hosting/asset checks do not replace visual/device checks. Keep local and hosted behavior aligned when hosting is authorized; ask before pushing.

## Implementation tracking

- [x] Inspect current source and preserved product documents.
- [x] Research primary Web Push and Xendit guidance; identify CHED reference and campus verification limits.
- [x] Record storage, unlimited/partial pay-later, overdue warning exception, replacement and excluded-attachment decisions.
- [x] Map all active requests and prioritize complex work.
- [ ] Owner approves implementation phase/order.
- [ ] Confirm real barcode/scanner/manual, conduct-warning scope/reset and school-approved surcharge/urgency settings.
- [ ] Design backward-safe migrations/contracts for the approved phase.
- [ ] Build, verify and document approved phases. No implementation has started from this plan.

## Sources and limits

- Inspected runtime source a9ac1eb/documentation successor 7e637c8 in the existing release checkout. The original owner checkout has older docs and was not treated as current deployed code.
- Product PDFs: docs/source/Final-Draft.pdf and docs/source/Admin-System-Flow.pdf. Current owner requests supersede older preview/layout requirements when implemented.
- Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- Apple: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- WebKit: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Xendit: https://docs.xendit.co/docs/handling-webhooks/ and https://docs.xendit.co/apidocs/payment-webhook-notification
- CHED order index: https://ched.e.gov.ph/2021-ched-memorandum-orders
- Primary CMO link: https://legacy.ched.gov.ph/wp-content/uploads/CMO-No.-22-s.-2021.pdf (fetch timed out). No campus-specific/universal barcode-encoding mandate was verified; do not claim compliance on this basis.

## Change log

- 2026-11-17: Added the detailed Phase 3 violations-records plan, including three-warning progression, reviewed fine eligibility, audit history and pending counter/reset decisions. Planning only; existing build authorization remains unchanged.

- 2026-11-17: Created planning-only roadmap. No runtime, database or hosting changes.
- 2026-11-17: Owner selected ten-day completed-file expiry, unlimited pay-later with partial physical payment, replacement review and exclusion of email/standalone print-image attachments.
- 2026-11-17: Final clarification removed overdue warning grace. Exact-due-time automatic fines continue; conduct warnings are separate.
- 2026-11-17: Renamed work sections to phases at the owner's request; scope and order are unchanged.

- 2026-11-17: Owner authorized Phase 1 implementation. Phases 2–7 remain planned; hosting/push are not authorized. Phase 1 work is on codex/printing-phase-1.

- 2026-11-17: Owner authorized hosting after each approved phase and a stop before Phase 2. Phase 1 implemented with private PDF analysis/preview, mixed output, reviewed image additions, physical-original photocopy review and Manila intake schedules; verification and hosting in progress. Other phases remain planned.

- 2026-11-17: Phase 1 built and hosted; 763 API and 538 web tests passed, typecheck/build passed, localhost healthy and production schema/assets verified. Stop for Phase 2 approval. No GitHub push.

- 2026-11-17: Violations records built in the served `StiOrmocLibrary-main-sync` checkout and hosted as deployment `dpl_3g8CruRi8a3QfVA4hSpvtwcp4cf9`. Lifetime per-person/category warnings, no term reset, no restrictions for warnings, normal reviewed fines, own records, audit notes and CSV/PDF exports are live. Applied migration 056; next unused 057. Broader new urgency-threshold configuration remains separate. See the Phase 3 work record.

- 2026-11-17: Phase 7 technical report changes built and hosted; broader real-world acceptance remains open. See [release, scope and limits](2026-11-17-phase7-reports.md). No migration or push.
