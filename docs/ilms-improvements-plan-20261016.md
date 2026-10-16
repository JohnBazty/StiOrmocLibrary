# STI ILMS improvement implementation plan

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `planned` |
| Source | `C:/Users/JOHN/Downloads/STI ILMS IMPLEMENTATIONS.docx` |
| Source SHA256 | `d8c3c6359eba3e236b9c3a6db0118e906afa528ce829112569a096f93cd6e9f0` |
| Scope | Eight new Improvement phases covering 13 included document areas; purchasing and registrar work deferred |

## Why

Turn the supplied implementation recommendations into a practical sequence of improvements to the existing library system. Reuse working modules, preserve records, and make routine work understandable for a Librarian or Staff member with no technical background.

These are **ILMS Improvement Phases 1–8**, a separate roadmap from **Revision Phases 1–8** in [the revision plan](revisions-implementation-plan.md). They do not rename those phases, reset their progress or certify their pending acceptance work. This document authorizes planning only; implementation starts when the owner requests a phase.

## Confirmed scope decisions

- **Acquisitions and purchasing are excluded for now:** no purchase requests, supplier management, quotation comparison, budgets, purchase orders, delivery/receiving workflow or supplier-invoice feature in this plan. Existing catalog copy registration and damage/replacement assessments remain relevant and do not require a purchasing module.
- **Registrar imports and synchronization remain deferred.** They stay in the existing pending Revision Phase 2, rather than a duplicate new module. The owner allows reviewed imports to update official program, year level and borrowing status when that work is later authorized; users retain control of personal profile details. This is a future exception to owner-only profile editing, not a new permission to edit profiles now.
- The existing invoice-issuing module remains archived. The question of supplier invoice attachments is moot while purchasing is excluded.
- Keep the combined Librarian/Admin authority and restricted Staff workspace. Users' school ID/email remain fixed under the current profile contract.
- Preserve one permanent user QR across services/sign-ins, catalog → cart → review → submit, queue-only requests and automatic borrower/copy identification followed by explicit handover confirmation. Do not add repeat scans or routine multi-step confirmations to these flows.
- Keep the approved temporary Active-account enrollment rule and **Enrollment not verified** disclosure while Revision Phase 2 is deferred.
- Optional serials, RFID, offline circulation, public acquisition suggestions and periodical issue prediction are deferred. A React Native client, SMS, full MARC support and campus-system integration are not silently added by these recommendations.

## Source coverage

All substantive paragraphs in the supplied DOCX were read, including its priority recommendations. The paragraph ranges below refer to the ordered paragraphs extracted from `word/document.xml`; the document contains no embedded media. Its statements about what is missing are recommendations to check against the current code, not proof that a feature is absent.

| Source section | Subject | Plan destination |
| --- | --- | --- |
| 1, paragraphs 3–16 | Acquisitions and purchasing | Deferred by owner |
| 2, paragraphs 17–31 | Configurable borrowing policies | Improvement 1 |
| 3, paragraphs 32–41 | Checkout and return preflight | Improvement 1 |
| 4, paragraphs 42–52 | Renewal management | Improvement 1 |
| 5, paragraphs 53–65 | Scheduled notices | Improvement 5 |
| 6, paragraphs 66–83 | Stocktake sessions | Improvement 3 |
| 7, paragraphs 84–94 | Long-overdue review | Improvement 2 |
| 8, paragraphs 95–115 | Damage assessment | Improvement 2 |
| 9, paragraphs 116–132 | Catalog quality and authority control | Improvement 4 |
| 10, paragraphs 133–143 | Barcode and label printing | Improvement 4 |
| 11, paragraphs 144–156 | Registrar import and account lifecycle | Deferred; existing Revision Phase 2 |
| 12, paragraphs 157–171 | Consistent staff audit records | Every phase, consolidated view in Improvement 5 |
| 13, paragraphs 172–192 | Operational reports | Improvement 6, extended by later phase outputs |
| 14, paragraphs 193–210 | Collection review and weeding | Improvement 7 |
| 15, paragraphs 211–224 | Export, backup and privacy | Safeguards from the start; completed in Improvement 8 |
| Paragraphs 225–230 | Five optional features | Deferred |
| Paragraphs 231–239 | Suggested priority | Adapted to owner exclusions and dependencies |

## Current baseline and gaps

This is a source/code inspection, not a fresh full-system QA run. Consulted [product source of truth](source-of-truth.md), Final Draft renewal requirements on PDF page 19, Administrative System Flow page 1, `agent.md`, schema context, migration plan and recent work records.

| Area | Existing foundation | Remaining work to verify or add |
| --- | --- | --- |
| Borrowing policy | Versioned role limits, due dates, renewal settings, material rules, reservation limits and long-overdue threshold | Verify enforcement across active routes; complete grace/special-material policy gaps without changing historical loans |
| Checkout/return | Structured legacy preflight, current simple counter, exact-copy handover and returns | Reconcile warning/alert presentation with the active desk; complete renewal request/approval workflow |
| Damage and loss | Copy condition, return assessment note, lost reports and confirmed replacement obligations | Full damage case/evidence/resolution lifecycle and long-overdue review queue |
| Inventory | Barcode lookup, condition updates and audit history | End-to-end scoped stocktake sessions and reviewed discrepancy corrections |
| Catalog/import/labels | Multiple author rows, duplicate checks, managed categories, workbook/CSV import with overlap review, copy barcodes and print sheets | Shared author/publisher authority and variants, language/series, stronger correction/export controls, complete label layout |
| Notices/audit | Durable operational worker, in-app notices, request email outbox and module-specific events | Shared template/delivery coverage, missing reminders, consistent cross-module audit view |
| Reports | 13 live source reports and collection reports | Missing analytical views, consistent program/material filters and explicit missing-data labels |
| Collection review | Approved reference year, age flags, school-approved criteria and immutable review decisions | Demand/edition/condition evidence, copy-level weeding review and guarded archive execution |
| Protection | Account lifecycle, session invalidation and controlled exports | Verified backup/restore procedure, storage recovery, retention/anonymization policy and session/device controls |

Stocktake-related hosted migration identities are mentioned in existing documentation, but a complete active session workflow was not found in the inspected checkout. Renewal policy fields likewise do not establish a complete renewal workflow. Inspect any retained branch implementation and deployed schema before adding replacements; do not automatically pull, merge or replay historical migrations.

## How

Use the existing React/TypeScript web app and Node/Express modular API. Supabase Postgres remains active, with the MySQL tree retained as the rollback reference. Extend canonical services instead of creating parallel loan, fine, request or catalog ledgers.

For each phase: confirm its school-specific rules, reproduce the actual gap, define API/data contracts, add backward-safe migrations only where necessary, implement the shortest understandable workflow, test role and concurrency boundaries, reconcile reports and document acceptance.

### Safeguards before any phase changes data

1. Review current schema and any externally managed migration sources. Latest applied product Postgres file is 026; next unused is 027 at plan creation. MySQL reference is 048; next is 049. Recheck these numbers before authoring each migration; this plan reserves no numbers and applies no SQL.
2. Capture a protected, scoped recovery snapshot and test the affected migration/rollback procedure in an isolated environment. Restore to a separate test target, never over the live school database during QA.
3. Require actor, timestamp, action and relevant before/after evidence in new writes from the first phase. User-facing reasons are required for exceptions, financial decisions and destructive lifecycle decisions, not every routine step.
4. Preserve accounts, copies, loan/request IDs, fines, payments and historical actor references. Do not use destructive reseeding or reset data as an implementation shortcut.
5. Use labeled disposable QA records and files, inject email delivery during automated tests, and clean up only those fixtures. Never log passwords, session tokens or permanent QR secrets.

## Phase overview

| Improvement phase | Deliverable | Dependency |
| --- | --- | --- |
| 1 | Complete and consistent borrowing checks and renewals | Existing policy/counter/loan foundations |
| 2 | Damage cases and long-overdue review | Phase 1 policy decisions and existing loss/fine services |
| 3 | Guided stocktake sessions | Current inventory; Phase 2 resolution links |
| 4 | Catalog consistency and complete copy labels | Existing catalog/import; preserve Phase 3 audit references |
| 5 | Reliable reminders and unified staff history | Events from Phases 1–4 and existing job runner |
| 6 | Complete operational reports | Authoritative ledgers from Phases 1–5 |
| 7 | Evidence-based collection review and weeding | Phases 2–4 and 6; existing Revision Phase 7 |
| 8 | Data protection, restore verification and final acceptance | Safeguards already active; all new phase outputs |

### Improvement Phase 1 Borrowing checks and renewals

**Status:** `planned`. **Outcome:** Routine checkout stays one review and confirmation; eligible borrowers have a clear renewal action.

1. Inventory policy fields and active API paths. Test Student/Faculty limits, operating-day calculations, material restrictions, reservation limits and historical policy snapshots before changing them.
2. Resolve any inconsistency between older preflight and the current counter. Display plain messages grouped as Cannot continue, Needs Librarian decision and Information. Lost/unavailable copies, identity/assignment conflicts and authorization failures are never overrideable warnings.
3. Preserve the fast pickup flow. Display warnings within its existing review; request a reason only when an authorized Librarian may make an exception. Staff cannot acquire policy/financial authority from the UI.
4. Add request renewal → show eligibility/new due date → authorized decision → notify borrower. Recheck overdue status, current queues, unpaid obligations, renewable material and renewal count atomically at approval.
5. Record original/new due dates, policy used, requester, approver, decision/reason and request key. A failed/replayed response cannot extend the due date twice. Apply effective-date changes prospectively; explicitly define renewal policy selection before implementation.
6. Confirm any new grace period, special-collection rule and automatic-versus-manual renewal decision with the school before activation. No invented default changes to current fines or deadlines.

**Implementation areas:** existing `apps/api/src/modules/circulation/borrowing-policy.*`, `circulation-preflight.ts`, `circulation.service.ts`, `desk-circulation.*`; proposed renewal service/routes/tests in the same module; `apps/web/src/features/circulation/` and borrowing history.

**Acceptance:** valid renewal once; queued/overdue/unpaid/nonrenewable/limit cases blocked; simultaneous request/checkout/return safe; actual physical return still accepted when a borrower has unpaid fines or inactive access; direct API and Staff permission tests; old loan policy remains unchanged.

### Improvement Phase 2 Damage and long overdue cases

**Status:** `planned`. **Outcome:** Staff record what happened; the Librarian reviews evidence and decides the resolution or charge.

1. Extend the current return condition assessment into a linked case, with copy, borrower at discovery when known, date, recorder, damage type/severity, description and optional private photos. Do not infer borrower liability from the current borrower field alone.
2. Let Staff record evidence and refer the case. The Librarian assesses repairability, repair/replacement estimates, any borrower charge and final resolution. Reuse existing fine/payment/clearance ledgers; do not create a second unpaid-balance store.
3. Provide Return to circulation, Send for repair, Library use only, Replace and Recommend archive actions where allowed. Archive guards/history remain authoritative; approving a charge requires a separate explicit decision.
4. Generate a long-overdue review item using the approved configurable threshold. The document's 30 days is an example, not an activated default.
5. Reuse borrower/copy details automatically. Offer contact record, reviewed deadline extension, verified physical return and existing reported/confirmed lost workflow. Do not mark returned from a contact note or apply replacement charges automatically.
6. Define resolution, disputed liability and reversal behavior before monetary activation. Preserve original assessments, evidence, overdue accrual rules and charge reversals; prevent duplicate damage/loss charges for the same obligation.

**Implementation areas:** `apps/api/src/modules/circulation/`, `fines/`, `clearance/`, `inventory/`; `apps/web/src/features/circulation/CirculationReturnDialog.tsx`, existing lost/clearance interfaces; new case/evidence components and private storage policy as needed.

**Acceptance:** photos restricted to authorized roles; Staff cannot approve charges; pre-existing damage retained; returned/lost/extended cases leave the review queue correctly; retries cannot duplicate cases/charges; historical payments and balances reconcile.

### Improvement Phase 3 Inventory counting sessions

**Status:** `planned`. **Outcome:** Start a count → choose area → scan → review differences → apply selected corrections.

1. Verify existing hosted stocktake tables and source provenance before extending them. Use an explicit session with area, owner, start/end times and a snapshot of expected copies.
2. Support managed shelf/location, category, room/collection where those mappings exist. Do not offer a room filter with invented or unmapped rooms.
3. Scan each physical copy barcode and immediately show recognized title and result. Count repeated scans once while retaining duplicate-scan evidence.
4. Report not scanned, wrong shelf, borrowed-but-found, lost-but-found, unknown barcode, archived copy and outside-area scans. A known borrowed copy not on the shelf is expected outside the library, not automatically missing.
5. Show circulation changes since counting began. Revalidate affected rows before applying approved corrections; route borrowed/lost/damaged conflicts into their proper review workflows.
6. Pause/resume safely and export the discrepancy report. Finishing a count does not automatically delete, mark lost, return a loan, change fines or move every book.

**Implementation areas:** existing `apps/api/src/modules/inventory/` services/routes and `apps/web/src/features/inventory/InventoryDashboard.tsx`; proposed stocktake session service/UI; report adapters added to existing reports.

**Acceptance:** all eight source discrepancy types; interrupted/resumed session; double scan; simultaneous loan/return/category move; same correction applied twice; Staff versus Librarian authority; no school history overwritten.

### Improvement Phase 4 Catalog consistency and copy labels

**Status:** `planned`. **Outcome:** Select standard catalog values, review possible matches and print usable labels without re-entering book details.

1. Extend existing duplicate checks and import overlap review. Distinguish title/edition records from physical copies; a repeated ISBN can mean copies of one edition, not an automatic duplicate deletion.
2. Add reusable author and publisher authority/alias records, standard subjects/categories, series, language and edition metadata as required. Preserve author order and multiple authors.
3. Suggest possible author variants, including accented names, but require reviewed identity/link decisions. Never merge people solely because punctuation or accents normalize alike.
4. Add reviewed bulk corrections with before/after preview and resumable, idempotent application. Preserve copy IDs, barcode/accession identities, loans and author provenance.
5. Keep the existing simplified import flow. Add common-format catalog import/export only after selecting a school sample and format; CSV/XLSX remains the default supported workflow, full MARC remains deferred.
6. Extend existing batch labels with copy barcode, accession, call number, short title, shelf/collection and library name. Reprint existing identities instead of generating new copies or replacement barcodes.
7. Confirm actual label stock/printer dimensions before final print layout. Book-copy codes remain separate from a borrower's one permanent user QR.

**Implementation areas:** `apps/api/src/modules/catalog/catalog-enhancements.service.ts`, catalog repositories/import parser, `book-label.renderer.ts`; `apps/web/src/features/catalog/HoldingsImportPage.tsx`, metadata controls and `BookLabelSheet.tsx`; existing catalog exports.

**Acceptance:** genuine duplicate versus new edition/copy; accented names and ambiguous authors; rollback/retry of corrections; zero new copies on reprint; scan printed labels on the school's device; public/borrower views expose no administrative QR secrets.

### Improvement Phase 5 Reminders and staff activity history

**Status:** `planned`. **Outcome:** Users receive timely notices, and the Librarian can trace important changes in one place.

1. Map every requested event to existing producers and avoid duplicate notification systems. Cover upcoming due, overdue, preparing/approved queue status, ready pickup, pickup approaching expiry, cancellation, long overdue, confirmed loss/charges, recorded payments and clearance changes.
2. Extend the current outbox/worker pattern to missing email events; keep in-app delivery useful when email is unavailable. Provide reviewed templates and visible delivery status/retry history without exposing provider credentials.
3. Define reminder timing, repeat frequency and allowed contact channels before activation. Use Manila dates and durable deduplication; never send the entire historical backlog after deployment without explicit review.
4. Build a consistent actor/time/action/record/before-after/reason event contract and read-only Librarian history view. Add missing producers at their transaction boundaries, including renewals, damage, stocktake corrections, policy changes, archiving and existing fine decisions.
5. Do not retroactively fabricate reasons, actors or enrollment imports. Label legacy gaps; reserve registrar audit events for the deferred feature. Restrict audit records from browser edits and routine deletion.

**Implementation areas:** `apps/api/src/modules/jobs/job-runner.ts`, `notifications/`, `reservations/book-request-email.worker.ts` pattern and module event producers; new audit reader/adapter if needed; `apps/web/src/features/notifications/` and a Librarian activity-history view.

**Acceptance:** retries, lease recovery, provider failure, no duplicate reminders after restarts, canceled/returned loan reminders suppressed, correct Student/Faculty destination and ownership; financial events reconcile with their ledger; restricted audit access.

### Improvement Phase 6 Operational reports

**Status:** `planned`. **Outcome:** Select a report and useful filters, view the results, then export matching CSV/PDF without database knowledge.

1. Reuse the existing Reports page and shared read-only snapshot/export contracts. Verify existing reports before adding new report kinds.
2. Cover all source report requests: most borrowed; never borrowed; overdue; long-overdue candidates; lost/damaged; inventory discrepancies; fine collections; unpaid balances; active borrowers; inactive accounts; reservation demand; replacement candidates; collection age; archived/obsolete; research/thesis usage; clearance blockers; activity by date, program and material type.
3. Keep title counts, physical-copy counts, loans, queue entries and in-library usage distinct. A submitted cart request must never inflate borrowing totals.
4. Add relevant date/program/material filters consistently. Current program is not historical enrollment evidence; label current-program grouping and Unknown explicitly while registrar work remains deferred.
5. Make date applicability clear for current snapshots. Define never borrowed and low demand against the actual retained history range; label insufficient evidence instead of asserting zero lifetime use.
6. Match preview totals with CSV/PDF using the same criteria, redaction, time zone, safe CSV handling and explicit large-export limits. Add outputs for later phases without rebuilding this page.

**Implementation areas:** `apps/api/src/modules/reports/live-reports.*`, existing catalog/collection exports; `apps/web/src/features/catalog/OperationalReports.tsx` and `CatalogReportsPage.tsx`.

**Acceptance:** fixture totals independently reconciled to ledgers; date boundaries and correct program/material scope; no request counted as loan; Unicode PDF names; CSV safety; unauthorized reports denied; no writes from reading/exporting.

### Improvement Phase 7 Collection review and weeding

**Status:** `planned`. **Outcome:** Show why a title or copy needs review; the Librarian makes a recorded decision and archives only when safe.

1. Extend Revision Phase 7, retaining approved starting reference year 2026 and the five-years-or-older review flag. Do not substitute publication year for missing copyright evidence or treat an age flag as an instruction to archive.
2. Add review evidence for superseded editions, long periods without circulation, damage, low-demand duplicate copies, missing/long-lost copies and outdated content. Outdated content needs a human/source assessment; age alone cannot establish it.
3. Confirm thresholds for low use and surplus copies before activation. Use Phase 2 cases, Phase 3 count evidence and Phase 6 usage reports; show incomplete-history caveats.
4. Separate title-level recommendations from copy-level archive decisions. Record reason, reviewer, evidence and retained/replaced/archived outcome; preview affected copies and open commitments.
5. Block archive operations with active loans/holds or unresolved obligations according to existing service rules. Resolve those records through their own workflows. Reuse the guarded archive service and keep all history.
6. Preserve withdrawal of archived digital files from public access. Keep school/CHED requirement criteria inactive until their existing evidence/approval gates are met; this phase does not certify compliance.

**Implementation areas:** `apps/api/src/modules/catalog/collection-review.*`, current archive/digital access services and reports; `apps/web/src/features/catalog/CollectionReviewPage.tsx` and archive review controls.

**Acceptance:** mixed title/copy recommendations; threshold boundaries; missing years/history; low-demand title with an active hold; no automatic archives/charges; retained historical usage and private/public digital withdrawal.

### Improvement Phase 8 Data protection and final acceptance

**Status:** `planned`. **Outcome:** Authorized exports, traceable access and a recovery process that has actually been tested.

1. Complete a documented database-and-storage backup schedule, responsible operator, protected location, recovery target and restore drill. Verify the actual hosting plan and tooling at implementation time; do not assume database backup includes uploaded files, auth configuration or secrets.
2. Restore into a separate controlled test environment. Reconcile row counts, key relationships, loan/request/fine/payment history, files and representative restored workflows. Confirm no test environment sends real notifications.
3. Review catalog, patron and transaction exports by role and purpose. Exclude passwords, hashes, recovery data, QR credentials, private attachments and unrelated personal data from ordinary exports.
4. Obtain school-approved retention/anonymization rules before enabling them. Specify eligible closed records, unresolved obligations, identity linkage and aggregate history preservation. Preview effects and record authorized execution; never pick a retention period or erase historical borrower identities automatically.
5. Review active sessions/device visibility, revocation, account deactivation and staff access. Avoid collecting new device identifiers without a defined need. Verify that existing auth-version invalidation remains authoritative.
6. Run complete workflows across the new phases and current revision features. Test mobile layouts, keyboard/touch use and real scanner/label hardware, then conduct a nontechnical Librarian/Staff trial. Record human sign-off and remaining limitations.
7. Prepare deployment and rollback instructions after acceptance. Push, deployment, restore over production and real-data retention actions each require their own applicable authorization.

**Implementation areas:** existing auth/session and user lifecycle services, `apps/api/src/modules/reports/`, controlled export/maintenance scripts and operational documentation; scoped UI for authorized access review only where useful.

**Acceptance:** successful isolated restore including files; correct exports and permissions; deactivated/revoked sessions denied; retention dry run leaves unresolved records protected; simplified cart/pickup/return/QR flows preserved; human usability feedback resolved.

## Phase completion rule

A phase is `built` only after its scoped acceptance checks pass, documentation reflects the delivered behavior, disposable fixtures are cleaned up and any school-policy gate for activated behavior is resolved. Existing feature foundations do not automatically mark a new phase complete. Human/device checks remain explicitly pending until observed. No dates or effort estimates are promised before discovery of school inputs and schema sources.

## Implementation tracking

- [x] Read the complete supplied DOCX and map all 15 sections plus optional items.
- [x] Compare current code and implementation evidence; distinguish existing foundations from gaps.
- [x] Confirm exclusions and future official-field import boundary with the owner.
- [x] Prepare this separate implementation plan.
- [ ] Owner authorizes the next Improvement phase.
- [ ] Improvement 1 completed and accepted.
- [ ] Improvement 2 completed and accepted.
- [ ] Improvement 3 completed and accepted.
- [ ] Improvement 4 completed and accepted.
- [ ] Improvement 5 completed and accepted.
- [ ] Improvement 6 completed and accepted.
- [ ] Improvement 7 completed and accepted.
- [ ] Improvement 8 completed and accepted.

## Change log

- 2026-10-16: Read the full attached implementation document and inspected related current modules and revision records. Asked about registrar scheduling, official profile fields and supplier invoice scope.
- 2026-10-16: Owner kept registrar work deferred and allowed reviewed official-field updates for its eventual implementation. Owner then excluded acquisitions/purchasing for now, so supplier invoices are also excluded. Planned the remaining 13 areas as eight Improvement phases; current Revision roadmap and migration tracker unchanged.
