# Revision Oct 17 - Phased Implementation Plan

| Field | Value |
| --- | --- |
| Source document | `C:\Users\JOHN\Downloads\Revisions-October-17.pdf` - both pages reviewed |
| Revision date | October 17, 2026 |
| Date created | October 22, 2026 |
| Date last updated | October 22, 2026 |
| Status | `inprogress` |
| Project | STI College Ormoc Integrated Library Management System |

## Goal and why

Make daily library work easier: actions should affect the selected book, records should update without page reloads, classifications should stay consistent, reports should export the selected records, and personnel should be able to maintain historical printing records, supply details and items offered for sale.

This document is a plan. Its phase numbers belong to the **October 17 revisions** and do not rename, restart or mark complete any phases in earlier revision plans.

## Confirmed decisions and scope

The owner's October 22 answers take precedence over the PDF:

1. **Defer CSV-only imports.** Keep the existing supported upload formats. Do not remove Excel support or modify enrollment imports as part of this revision.
2. **Defer additional Personal Details fields.** Add no new profile fields until the owner supplies them.
3. **Historical printing entries update history and reports only.** They must not change today's paper or ink balances, enter the live printing queue or trigger actual printing.
4. Retain the existing combined Librarian/Admin account and authority model. This revision does not create a second administrator login.
5. Keep the existing borrowing flow: available books use the cart; unavailable books use the reservation queue; a loan starts only after staff confirm physical handover.
6. Reuse the permanent user QR and existing account/session protection.
7. **Defer Phase 2 (Dewey classifications)** at the owner's October 22 instruction. Proceed directly to Phase 3. No DDC schema, lookup, API integration or copy assignments will be added in this run.

### Planning assumptions

These are proposed implementation boundaries, not additional requirements attributed to the PDF:

- **Items for sale** means maintaining item descriptions, categories, prices and stock. A sales checkout, customer shopping cart, sales invoices, online payments and a point-of-sale system are not included in this plan.
- A report export contains **all records matching the applied filters**, including matches on other preview pages. It must not include unrelated unfiltered records. A visible-page-only export can be added separately if requested.
- DDC choices and descriptions are maintained from school-approved cataloging information. The application will not guess a classification from a title or automatically import an unverified classification dataset.
- Automatic refresh means updating data in place. It does not mean reloading the browser or rerunning every component on every screen.

## Existing system to extend

The following findings are from the current checkout, not a new live QA run:

| Area | Existing behavior | Planned work |
| --- | --- | --- |
| Signed-in catalog | `BookCatalog.tsx` uses one `reserving` value; a pending reservation disables all book-action buttons and increases the embedded catalog's refresh key. | Isolate reservation state and reconcile affected data without disturbing the entire catalog. |
| Automatic updates | Several screens poll at five seconds; catalog/cart checks also use longer intervals. | Audit existing live reads and use a 1,000 ms interval where automatic updating is required, with request coordination and stable UI. |
| Book information | Title call numbers and individually identified physical copies already exist. | Add a separate maintained DDC relationship for each physical book copy. Preserve existing call numbers and copy identifiers. |
| Librarian notifications | Account-review activity and the personal notification center already exist. Operational event coverage needs verification. | Extend these paths with reliable borrowing, overdue, attendance and other relevant activity. |
| Reports | The live report API already shares filter parsing with export. Other export cards use separate calls; column labels and search wording need review. | Make filter scope clear, close export inconsistencies and verify every applicable entry point. |
| Printing | Queue, invoices, payment records, revenue, supply balances and stock movements already exist. | Add clearly marked historical records and richer supply metadata without replacing the existing ledgers. |
| Maintenance | Books, categories, locations, resource types, programs, courses and imports already exist. | Add DDC maintenance and a separate Items for sale section. |

### Architecture and database baseline

- Keep the React/Vite frontend and Node.js/Express modular API.
- Use the active Supabase Postgres database through the existing server-side data layer and custom account authorization. Do not introduce a new authentication provider or separate operational databases.
- Extend existing modules before adding a new module. Keep permissions and business validation in the API.
- Latest recorded applied product migration: **`029_october16_revisions.sql`**. Enrollment **`028_revision_phase2_enrollment.sql`** remains an unapplied draft. Next unused Postgres number is **030** at planning time.
- MySQL rollback reference: **048**, next **049**. No migration is authored or applied by creating this plan.
- Recheck migration history immediately before implementation; allocate additive files then. Do not reserve numbers per phase or replay the entire migrations directory.
- Historical paragraphs in schema documentation describe older milestones. Use the current tracker plus the current schema/code when implementing; preserve newer owner-approved rules.

## Phase overview

| Phase | Outcome for the Librarian or user | Depends on | Status |
| --- | --- | --- | --- |
| 1 | Stable book actions, one-second live updates and clearer navigation | Existing system | `built` |
| 2 | Maintained DDC choices linked to individual book copies — deferred by owner | Existing catalog | `planned` (deferred) |
| 3 | Reliable Librarian activity and notifications | Phase 1 | `built` |
| 4 | Clear report searches, labels and correctly filtered exports | Phases 1 and 3; DDC columns deferred with Phase 2 | `built` |
| 5 | Past printing transactions recorded on their actual dates | Phase 4 report contract | `built` |
| 6 | Better identification and management of printing supplies | Existing supply ledgers; Phase 4 report contract | `built` |
| 7 | Simple maintenance of items offered for sale | Existing Maintenance and permissions | `built` |
| 8 | Verified integration, usable screens and documented acceptance | Phases 1 and 3-7; Phase 2 deferred | `inprogress` — technical QA complete; human acceptance pending |

Phases 2 and 6-7 can be developed independently after the common contracts are understood. The normal delivery order is 1 through 8 so each change can be reviewed in a working system. Each phase includes its own checks; Phase 8 is the final integration gate.

## Phase 1 - Stable actions, automatic updates and navigation

### User experience

- Selecting **Reserve book** changes that book's button to **Reserving...**, then **Reserved** after success.
- Other books remain usable unless a real borrowing rule prevents the action. An action already in progress for the same title cannot be submitted twice.
- Search text, filters, page position, open book details, scroll position and keyboard focus remain intact during updates.
- In the Librarian sidebar, place **Book Reports** immediately below **Dashboard** and place **Maintenance** immediately below **Fines**. Keep existing report types accessible and avoid duplicate report destinations.

### Implementation steps

1. Reproduce the reservation-wide disabled state and identify all existing automatic live reads, their intervals and API costs.
2. Move reservation pending/error/success state into a title-specific action or module hook. Reconcile card and detail views by title ID after a result.
3. Retain server duplicate prevention and current account/copy/limit checks. Reconcile borrower commitments after each action; reject a stale action clearly rather than pretending every independent action is eligible.
4. Introduce a reusable **1,000 ms** live-read interval for screens that require automatic updates. Share identical active reads, prevent overlapping requests and ignore outdated responses.
5. Retain content during background updates; display a small retry message on failure. Pause hidden/unmounted views and back off during connection errors; resume promptly when visible/connected.
6. Use small, scoped reads where possible. Do not regenerate reports/PDFs, upload files, submit transactions or re-fetch every catalog page every second. Polling must not count as human activity or prevent the ten-minute idle logout.
7. Update sidebar labels/order and verify old bookmarks still open the appropriate authorized routes.

**Primary existing files:** `apps/web/src/features/catalog/BookCatalog.tsx`, `BookOverview.tsx`, `PublicCatalogPage.tsx`, `BookCart.tsx`; `apps/web/src/layouts/PortalLayout.tsx`; relevant dashboard/history/notification screens. Add a shared live-read hook under the existing frontend hooks/utilities convention after inspecting that structure.

### Complete when

- [x] Reserving one unavailable title does not disable or blank every other book card.
- [x] Card and details actions agree; rapid repeated clicks produce one reservation.
- [x] Visible live data updates on the one-second polling cadence under a healthy connection; measured end-to-end latency is recorded separately.
- [x] A request lasting longer than one second does not produce overlapping requests or stale overwrites.
- [x] An open dialog, typed input, search, pagination and focus survive a refresh or temporary API error.
- [x] Hidden tabs pause; reconnect resumes; automatic reads do not extend the login session.
- [x] Desktop and mobile navigation show the requested order and preserve role restrictions.

**Built October 22, 2026.** See [implementation, polling coverage, verification and limits](revision-oct17-phase1-implementation.json).
Verification includes 402 API tests, 276 web tests, passing API/web builds, isolated
Postgres stock checks, live HTTP checks and desktop/mobile browser inspection.
Real school records were not used for mutation fixtures. Authenticated browser
actions used disposable data; campus-scale latency and human acceptance remain
Phase 8 work. Signed-avatar URL renewal and inactivity timers retain their separate
timing rules; full reports, exports and editable drafts do not poll every second.

## Phase 2 - Dewey Decimal Classification maintenance and copy details

**Deferred by owner on October 22, 2026.** The following design is retained for future review; it is not being implemented.

### User experience

**Maintenance > Dewey classifications > Add classification > Save.**

When adding or editing an individual book copy, the Librarian searches and selects its DDC number and description. The same classification can be reused by many copies. Existing copies without approved classification show **Not assigned**.

### Implementation steps

1. Add a classification lookup with a unique classification code, description, Active/Archived state and change metadata. Store the code as **text**, preserving leading zeroes and decimal digits.
2. Add an indexed, nullable classification foreign key to `physical_copies`, or a one-to-one copy-details extension if that fits the inspected schema better. The relationship must identify the individual copy, not only the title.
3. Preserve `titles.call_number`, accession numbers, barcodes, `physical_copies.material_id`, shelf coordinates, availability and loan links. A DDC number is not a replacement copy identifier or the full call number.
4. Allow authorized Librarians to add, search, edit and archive classifications. Enforce uniqueness in the database and validate selected classifications in the API. Prevent destructive deletion of referenced classifications.
5. Add the selector to copy create/edit workflows and display the number/description in public and signed-in **individual copy details**, inventory and applicable filtered reports.
6. Leave existing unclassified copies intact. Offer a reviewed selection across chosen copies to reduce repeated work; show exactly which copies will change. Never infer DDC by blindly splitting existing call numbers.
7. If CSV mapping is extended with an optional DDC column, require a recognized classification or explicit review. This does not make imports CSV-only and must not break saved imports without the new field.

**Primary existing files:** `apps/api/src/modules/catalog/catalog-enhancements.service.ts`, `catalog-enhancements.routes.ts`, `catalog-management.service.ts`, `catalog-management.repository.ts`; `apps/web/src/features/catalog/CatalogMaintenancePage.tsx`, `CatalogDetailsPanel.tsx`, `PublicCatalogPage.tsx`, `enhanced-catalog-api.ts`; relevant copy-editor/inventory files discovered during build. Add focused DDC service/validation/tests within the catalog module.

### Complete when

- [ ] Reusing one DDC entry across copies creates no duplicate classification entry.
- [ ] Leading zeroes and decimal precision survive create, read, edit and export.
- [ ] Two copies can retain independently assigned classifications.
- [ ] Missing classification does not remove an existing copy or block its historical records.
- [ ] Archived classifications remain visible on linked copies but cannot be assigned to a new copy.
- [ ] Both catalogs display approved copy classifications without exposing private administration fields.
- [ ] Unauthorized writes and invalid foreign keys are rejected; existing copy and transaction IDs remain unchanged.

## Phase 3 - Librarian activity and notifications

### User experience

The Librarian sees recent library activity and relevant alerts without refreshing the page. Selecting an activity opens the related record. Routine attendance can be reviewed as activity; important work such as an overdue book remains identifiable as an actionable alert.

### Implementation steps

1. Build an event coverage list for confirmed borrowing, returns, newly overdue loans, attendance entry/exit, reservation readiness/expiry, printing status/payment changes and existing account-review events.
2. Reuse existing notification and administrative event mechanisms. Add a dedicated event/read-state structure only if current ledgers cannot provide durable, auditable coverage.
3. Generate an event only after a successful operation, in the same transaction where practical. Repeated worker runs and retried confirmations must not duplicate events or unread counts. Do not create a loan event when a user only adds to the cart or reserves a book.
4. Show the relevant person, resource, action, actual event time and an authorized detail link. Avoid QR payloads, passwords, OTPs and unnecessary contact information.
5. Separate recent activity from unread/actionable alerts. Preserve existing registration/photo approvals and make clear what contributes to the bell count.
6. Use Phase 1's one-second updates for the visible activity list, unread count and affected operational table. Apply new records in place without closing staff work.
7. Keep recipient-specific read status and role boundaries. Do not send new emails, SMS or browser push notifications merely because in-app activity monitoring was requested.

**Primary existing files:** `apps/api/src/modules/notifications/notification.repository.ts`, `notification.worker.ts`, `notifications.routes.ts`; `apps/api/src/modules/users/admin-notifications.routes.ts`; participating circulation, attendance, reservation and printing services; `apps/web/src/features/notifications/LibrarianNotificationsPage.tsx`, `NotificationCenterPage.tsx`, `AdminNotificationsPage.tsx`; `apps/web/src/layouts/PortalLayout.tsx`.

### Complete when

- [x] Each covered successful event appears with the relevant person, record and source event time.
- [x] Rolled-back operations, duplicate scans and repeated overdue checks do not create duplicate notices.
- [x] Activity links open authorized related records with borrower/date filters; role-restricted records remain protected by the API.
- [x] Read/mark-all-read updates the true unread count without recreating old alerts on the next poll.
- [x] Activity reads are isolated from checkout/return confirmations; background reads retain the selected activity filter and prior content during errors.

**Built October 22, 2026.** See [source coverage, delivery timing, verification and limits](revision-oct17-phase3-implementation.md). Activity is a bounded read of existing committed ledgers; personal alerts use the existing deduplicated notification store. Overdue/recovery delivery follows the existing minute job. No DDC work, new schema, migration or emails were added. Desktop/mobile checks used disposable previews; live Librarian acceptance remains open.

## Phase 4 - Reports search, terminology and exports

### User experience

**Book Reports > Choose report > Enter search/filter dates > Apply filters > PDF or CSV.**

The export identifies the applied criteria and includes only matching records. A button for a current summary clearly says that it is a current snapshot rather than implying that a historical date filter applies.

### Implementation steps

1. Verify search coverage per report: student name, **Student ID**, book title and relevant transaction/reference/status details. Search identifiers as text, including leading zeroes. Do not promise a book-title search for a report that has no book data.
2. Replace user-facing **School ID** wording with **Student ID** in student report labels, search guidance, columns and exports. Keep database/API field names compatible. Represent Faculty identifiers accurately where Faculty records are included.
3. Use one shared label map. Proposed wording: **Book loans**, **Returned books**, **Book reservations**, **Awaiting handover**, **In-library use**, **Printing transactions**, **Printing revenue**, and **Supply restock expenses**. Preserve distinct reservation and cart-handover meanings.
4. Reuse the current server-side parsed report filter contract for preview, matching totals, PDF and CSV. Fix any export button that silently falls back to default/unfiltered criteria.
5. Export all matching preview pages, with deterministic ordering, applied search/status/date/term criteria, generated time and Asia/Manila timezone. Retain bounded-export safeguards and explain when a narrower range is needed.
6. Distinguish draft filter edits from the applied report. Background updates must not export un-applied text. A newly generated report may contain newly committed matching rows; a frozen historical snapshot is not promised.
7. Keep current-snapshot reports explicit: holdings and present stock cannot claim historical quantities simply by applying a past date range. Integrate DDC and subsequent historical-print/supply fields where relevant.

**Primary existing files:** `apps/web/src/features/catalog/OperationalReports.tsx`, `CatalogReportsPage.tsx`; `apps/api/src/modules/reports/live-reports.service.ts`, `live-reports.routes.ts`, `catalog-export.service.ts`, `branded-table-pdf.ts`; relevant printing report endpoints.

### Complete when

- [x] Name, leading-zero Student ID, title and transaction search mechanisms return expected matching records in isolated acceptance checks; all 13 report kinds pass read-only smoke checks.
- [x] Search + status + date/semester filters produce matching preview totals and export counts on a stable fixture.
- [x] An export from page 2 includes every filtered match, excludes nonmatches and does not silently export the entire source ledger.
- [x] Empty results produce a clear empty report, not an unfiltered fallback.
- [x] PDF headers, long text, page breaks, totals and selected criteria are readable; CSV handles quoted text and formula-like values safely.
- [x] Midnight/date-range boundaries use Philippine time consistently.
- [x] Desktop and mobile browser inspection of report controls and download interaction.

**Built October 22, 2026.** Browser access became available; desktop/mobile controls, applied-filter safeguards, local table scrolling and a filtered PDF download passed. Final regression has 415 API and 286 web tests, builds, types and isolated Postgres/PDF checks. See [Phase 4 evidence](revision-oct17-phase4-implementation.md) and [final technical QA](revision-oct17-final-qa.md). Human Librarian acceptance remains separate Phase 8 work.

## Phase 5 - Historical printing transactions

### User experience

**Printing > Past transactions > Add past transaction > Review > Save.**

The form states: **This adds an old printing record to history and reports. It will not change current paper or ink stock.**

### Implementation steps

1. Add an authorized historical-entry workflow, initially limited to the main Librarian. Do not grant restricted Staff new history-management powers implicitly.
2. Record the actual service date/time, customer identity when known, job/reference description, pages/copies/print type when known, actual amount charged and actual payment details when supported. Require the service date and sufficient details for a meaningful record; never invent an absent student account, upload, quantity or payment.
3. Store **service time**, **actual payment time where known**, and **time/actor of data entry** separately. Label the source **Historical entry**. Use Asia/Manila for entry and reporting.
4. Use a dedicated historical ledger or explicit historical record type. Do not force a historical job through the normal upload, document-analysis, active queue, invoice-delivery or stock-movement workflows.
5. Review a summary before saving. Use a stable submission key, warn about likely duplicates, and record any corrections/voids with a reason and audit history rather than silently deleting the original.
6. Include the entry once in historical service totals by service date. Count revenue only from supported/confirmed payment information on its actual payment date; retain the existing distinction between service activity, amount billed and money received. Uncertain legacy payment dates stay identified as unverified.
7. Extend Phase 4 reports/exports to combine normal and historical records with visible source labels and no double-counting of a linked existing transaction.

**Primary existing files:** `apps/api/src/modules/printing/printing.routes.ts`, `printing.controller.ts`, `printing.service.ts`, `printing.repository.ts`, `printing.validation.ts`; `apps/web/src/features/printing/AdminPrintingQueuePage.tsx`, `printing-api.ts`; Phase 4 report files. Add a focused historical-entry form/service and additive ledger only after schema review.

### Complete when

- [x] A genuine past-month fixture appears in that month's service report and not as today's new service activity.
- [x] A payment on a different date appears in the correct payment period.
- [x] Missing/unsupported payment evidence does not create confirmed revenue or a fabricated payment receipt.
- [x] Paper/ink balances and movement counts, active print queue and print-delivery jobs are identical before and after historical entry.
- [x] Duplicate submission/retry records one entry; unauthorized creation and silent destructive changes are rejected.
- [x] No invented historical school transactions are seeded to fill empty months.

## Phase 6 - Expanded printing supply maintenance

### User experience

**Print supplies > Choose Paper, Ink or Other materials > Add/edit details > Review > Save.**

Show friendly descriptions, stock units, stock balances and low-stock state. Keep optional specifications collapsed so ordinary restocking stays short.

### Implementation steps

1. Extend paper metadata with type, named size, width, height and measurement unit. Keep existing size labels readable; leave unknown legacy dimensions unfilled until reviewed.
2. Extend ink metadata with brand, type/model, color, compatible printer and the existing bottle/stock unit. Do not silently convert bottles to millilitres or paper reams to sheets.
3. Support other printing materials with a name, category, specifications, stock unit, balance, reorder threshold and Active/Archived state. Keep this inventory distinct from merchandise offered for sale.
4. Reuse existing restock/use movement history and atomic nonnegative-stock checks. New categories need the same clear before/after movement trail and authorized adjustment reason.
5. Preserve current manual **load bottle/open ream** consumption behavior. Adding metadata or an old printing transaction must not consume supplies or change printer availability.
6. Include identifying specifications and units in supply views, restock history and relevant reports/exports. Historical expense reports use recorded transaction facts, not today's edited price.
7. Do not re-enable previously deferred user print-size options automatically. Maintaining dimensions does not claim that the printer supports that paper or change existing saved jobs/prices.

**Primary existing files:** `apps/web/src/features/printing/AdminPrintSuppliesPage.tsx`, `printing-api.ts`; `apps/api/src/modules/printing/printing.validation.ts`, `printing.repository.ts`, `printing.service.ts`, `printing.routes.ts`; Phase 4 supply-report queries and exports.

### Complete when

- [x] Existing balances and movement history survive metadata additions unchanged.
- [x] Paper sizes/dimensions and ink brand/type can be saved and clearly distinguished.
- [x] Invalid dimensions, incompatible units, negative stock and conflicting updates are rejected clearly.
- [x] Restock and usage each change the correct stock once, with actor/time/before/after history.
- [x] Current inventory reports show specifications and units; past expenses retain recorded values.

## Phase 7 - Items for sale maintenance

### User experience

**Maintenance > Items for sale > Add item > Review > Save.**

Examples are yellow pads, ballpoint pens, other school supplies and approved books offered for sale. The screen shows the item name, category, selling price, unit, available stock and active state.

### Implementation steps

1. Add a small merchandise category/item structure and stock-movement history with Librarian-only maintenance authority.
2. Allow add/edit/archive, category selection, PHP selling price, opening quantity, restocking, reviewed stock corrections and a low-stock threshold.
3. Validate nonnegative monetary values and quantities according to the chosen unit, use safe decimal storage for prices, protect concurrent stock changes and audit price/stock edits.
4. Keep merchandise stock separate from borrowed book copies and printing consumables. Listing a book for sale must not automatically sell, archive or remove a library holding.
5. Archive an item without losing stock movements or prior information. Show current stock and low/out-of-stock labels using text as well as color.
6. Provide a simple current item list/report. Do not present stock adjustments as sales revenue or create a cashier/payment workflow under this phase.

**Primary existing entry point:** `apps/web/src/features/catalog/CatalogMaintenancePage.tsx`. Proposed bounded additions: `apps/web/src/features/merchandise/` and `apps/api/src/modules/merchandise/`, registered using existing route/permission conventions. Add tests and include the new API test location in the workspace test command so it is actually executed.

### Complete when

- [x] The Librarian can maintain an item, its category, price, restock and adjustment with a short review flow.
- [x] Repeated or concurrent stock changes cannot create a negative balance or duplicate a movement.
- [x] An archived item retains history and cannot be selected for a new stock operation unless restored through the approved flow.
- [x] Creating a book merchandise entry leaves borrowing titles, copies, loans and reservations unchanged.
- [x] Students, visitors and restricted Staff cannot call merchandise management APIs directly.

## Phase 8 - Integration QA and Librarian acceptance

### Verification sequence

1. Run meaningful focused tests for each phase's changed behavior, including success, invalid input, ownership, authorization, retries and concurrency where relevant.
2. Test additive migrations against a disposable Postgres schema, including legacy records with missing new fields. Verify foreign keys, RLS and revoked direct browser-role access for server-only additions. Plan a reviewed snapshot and an individual apply process before any hosted execution.
3. Verify API/web builds and full regression suites using the repository commands below. The API unit command uses MySQL mocks; it is not a substitute for isolated active-Postgres acceptance checks.
4. In a permitted browser, test public catalog, signed-in Student/Faculty catalog, Librarian dashboard, notifications, reports, Maintenance, printing history, supplies and items for sale on desktop and mobile widths.
5. Use keyboard-only navigation, visible focus, readable contrast and touch-sized controls. Verify light/dark themes, long names, empty lists and clear errors. Success is green; red remains for errors except the previously approved unread-count badge.
6. Measure one-second polling behavior with multiple visible clients, delayed requests and a dropped connection. Confirm bounded request volume, no overlap, no repeated full exports and no idle-session extension.
7. Use uniquely marked disposable records/files for mutations. Remove this run's fixtures without changing real accounts, holdings, loans, attendance, stock balances or historical records.
8. Have the Librarian try the short workflows unaided. Record confusing words/steps and repair them before claiming usability acceptance.

### Verification commands for implementation

Run from the project root in PowerShell after the corresponding code exists:

```powershell
npm.cmd run test -w @sti-library/api
npm.cmd run test -w @sti-library/web -- --maxWorkers=2
npm.cmd run build
```

New Postgres verification scripts must be inspected for isolation and cleanup before execution. Record actual test counts and failures at execution time rather than copying counts from an earlier revision.

### Final completion gate

- [x] Phases 1 and 3-7 satisfy their completion checks; Phase 2 remains explicitly deferred.
- [ ] Obtain actual Librarian usability feedback; technical checks cannot substitute for it.
- [x] No dropped requirement remains hidden in an unrelated module or export path.
- [x] Existing account access, OTP/session rules, permanent QR, cart, reservation ordering, handover and returns pass regression checks.
- [x] Public DTOs and report exports expose only information appropriate to the viewer.
- [x] New database structures preserve existing records and have reviewed additive migrations and permission coverage.
- [x] Desktop/mobile/browser evidence and any device, email or hardware limits are reported honestly.
- [x] Librarian acceptance is recorded separately from automated verification.
- [x] `docs/schema-context.md`, the migration tracker and feature work records are updated for changes actually built.
- [x] This plan changes to `built` only when required work is complete; otherwise retain `inprogress` and list the remaining work.

## Source requirement coverage

| ID | October 17 PDF requirement | Planned destination |
| --- | --- | --- |
| R01 | DDC in individual copy details, referenced consistently | Phase 2 |
| R02 | Reserve action must not refresh/disable unrelated catalog components | Phase 1 |
| R03 | 1,000 ms automatic refresh where required | Phase 1; used in Phases 3-4 and relevant operational views |
| R04 | Additional Personal Details fields | **Deferred by owner on October 22** |
| R05 | Librarian notifications for important activities | Phase 3 |
| R06 | Connect borrowing, attendance and transaction records to the Librarian interface | Phase 3 |
| R07 | Prompt updates without manual full-page refresh | Phases 1 and 3 |
| R08 | Book Reports below Dashboard; Maintenance below Fines | Phase 1 |
| R09 | Report search by name, Student ID, title and record details | Phase 4 |
| R10 | Student ID label in Reports | Phase 4 |
| R11 | Consistent official report terminology | Phase 4 |
| R12 | PDF respects current applied report criteria | Phase 4 |
| R13 | Authorized manual entry of previous months' printing records | Phase 5 |
| R14 | Correct historical dates/details and inclusion in reports | Phase 5 |
| R15 | Paper type/size/dimensions, ink brand/type and other supply specifications | Phase 6 |
| R16 | Supply identification, inventory monitoring and reporting | Phase 6 |
| R17 | CSV-only imports | **Deferred by owner on October 22** |
| R18 | DDC maintenance and foreign-key links | Phase 2 |
| R19 | Maintain items the library may offer for sale | Phase 7 |
| R20 | Maintain sale-item details, categories, prices and stock | Phase 7 |

## Implementation tracking

- [x] Read and visually inspect both pages of the October 17 PDF.
- [x] Review repository instructions, preserved product requirements and relevant current code/schema documentation.
- [x] Confirm the two deferred requirements and historical printing's no-stock-change rule.
- [x] Create the phased plan, dependencies, requirement coverage and completion checks.
- [x] Begin approved implementation and set the document status to `inprogress`.
- [x] Complete Phase 1 - stable actions, refresh and navigation.
- [ ] Complete Phase 2 - DDC maintenance and copy details.
- [x] Complete Phase 3 - Librarian activity and notifications.
- [x] Complete Phase 4 - Reports.
- [x] Complete Phase 5 - historical printing.
- [x] Complete Phase 6 - supply maintenance.
- [x] Complete Phase 7 - items for sale maintenance.
- [ ] Complete Phase 8 - integration QA and acceptance.

## Change log

| Date | Change |
| --- | --- |
| October 22, 2026 | Created the plan from both pages of Revisions-October-17.pdf; compared requirements with the existing implementation and organized eight phases. |
| October 22, 2026 | Owner deferred CSV-only imports and additional Personal Details fields. Existing upload support and profile fields stay outside this revision's changes. |
| October 22, 2026 | Owner confirmed that historical printing affects history/reports only and must leave current paper/ink stock unchanged. Included explicit service/payment/entry dates and protection against live queue side effects. |
| October 22, 2026 | Phase 1 built and verified. Added per-title reservation state, stable one-second operational reads, bounded stock polling and the requested sidebar order. Recorded automated, Postgres and browser evidence; Phases 2-8 remain planned. |
| October 22, 2026 | Owner deferred Phase 2 Dewey work and approved Phase 3. Phase 3 built and verified; its implementation record contains coverage and limits. |
| October 22, 2026 | Owner approved Phase 4. Report implementation, automated/database checks and PDF inspection passed; desktop/mobile browser checks remain pending because browser access is disabled. Phases 5-8 remain planned. |

### October 22 implementation update

The owner deferred all Phase 2 Dewey work. Phases 1 and 3–7 are built. Phase 8 implementation and technical QA are complete, including permitted browser checks; only human Librarian acceptance remains pending. DDC columns remain excluded. See [final technical QA and limits](revision-oct17-final-qa.md).

## References for implementation

- Primary revision source: `C:\Users\JOHN\Downloads\Revisions-October-17.pdf` (pages 1-2).
- [Repository protocol](../.cursor/agent-protocol.md), [development guide](../agent.md), and [product authority index](source-of-truth.md).
- [Preserved Final Draft](source/Final-Draft.pdf), especially printed scope/limitations and printing/reporting requirements, and [Administrative System Flow](source/Admin-System-Flow.pdf).
- [Implemented schema context](schema-context.md) and [Supabase migration plan](supabase-migration-plan.md), interpreted alongside the current migration tracker.
- [October 16 implementation record](october16-revisions-implementation.json) for existing functionality, owner decisions and outstanding verification limits.

### October 22 remaining-work authorization

The owner requested completion of all remaining work except Phase 2. Phases 5–7 were implemented and additive Postgres 030 applied after isolated verification. The subsequent final pass completed browser checks and technical QA. No human acceptance is claimed.

### October 22 delivery update

Phases 5–7 are built with reviewed historical entry/corrections/voids, supply metadata and other materials, and independent merchandise stock. Postgres 030 was applied individually after isolated acceptance; before/after hashes matched across 12 existing tables. All 415 API tests and 286 web tests passed; builds/types, isolated Phases 1/3/4/5–7 checks and rendered supply PDF checks passed. The application was restarted and live read-only checks passed for all 13 reports and new management lists. No school records were seeded, changed or deleted; no code was pushed or deployed.

Phase 4 browser inspection and Phase 8 technical QA are now complete. Browser access became available in the final pass; retry, identity, keyboard and readability defects were repaired. Human Librarian acceptance remains pending. Phase 2 remains deferred. See [final technical QA](revision-oct17-final-qa.md) and [delivery record](revision-oct17-remaining-implementation.md).

### Final technical delivery — October 22, 2026

All approved code is implemented. Final suites passed: 415 API tests and 286 web tests; builds/types and isolated Postgres acceptance passed. Desktop/mobile browser checks are complete, disposable fixtures removed, and local services restarted. The plan remains `inprogress` solely for actual human usability acceptance. No push or deployment occurred.
