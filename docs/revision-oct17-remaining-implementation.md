# October 17 revisions — remaining implementation and acceptance

| Field | Value |
| --- | --- |
| Why | Finish the approved revision with short, understandable workflows for old printing records, supplies and sale-item stock. |
| Date created | October 22, 2026 |
| Date last updated | October 22, 2026 |
| Status | `inprogress` — all approved implementation and technical QA are complete; only actual human usability acceptance remains outstanding. |
| Authorization | Owner requested completion of all remaining phases except Phase 2. Dewey remains deferred. |

## How the features work

### Phase 5 — past printing transactions

Open **Printing queue > Past transactions > Add past transaction**. Enter actual service date, customer, description and amount billed. Optional details stay collapsed. Unknown page/copy counts remain blank. A known Student/Faculty ID links the existing person; it never creates or changes an account.

Choose unpaid, incomplete payment information or payment supported by an original record. Only a positive amount with actual receipt date, method and supporting reference counts as confirmed revenue. Incomplete payment information remains explicitly unverified. The person entering an old record is not represented as its original payment collector.

Review the entry before saving. Similar same-day customer/reference records require explicit review; exact historical duplicates and clearly identified existing online jobs are rejected. Repeated or simultaneous submissions with the same key return one result. Corrections and voids require a reason and current version. Prior details remain in append-only change history; there is no delete endpoint.

Historical service activity appears on its actual service date. Revenue appears on its actual confirmed payment date, which can be a different month. Voided records are excluded from totals but remain in history. Historical entries are separate from online requests and cannot enter the print queue, send files/invoices, consume paper or ink, or create a fabricated payment receipt. Existing online jobs must be maintained through their original record rather than re-entered as history.

### Phase 6 — paper, ink and other printing materials

**Print supplies** now has **Stock & restock**, **Paper & ink details**, and **Other materials**.

- Stock & restock retains the existing unopened-bottle/open-ream workflow.
- Paper & ink details maintains brand, ink model, compatible printer description, paper type, named size, optional dimensions/measurement unit and low-stock threshold. Existing missing specifications remain unrecorded. Metadata does not change quantities, pricing, printer assignment or supported user print-size choices.
- Other materials maintains categories, descriptions, stock units, reference costs, quantities and low-stock thresholds. Restock, use and reviewed correction record actor, time, reason and before/after quantities. Restock expenses retain actual movement cost and the item name/unit at that time.

Stock units cannot be silently changed on an existing item. Pieces, packs, boxes and rolls are whole quantities; metres supports three decimal places. Fractional measurements remain visible in PDF/UI output. Concurrent changes use locked rows and version checks; retries use stored command results. Archived items retain stock/history and must be restored before another stock operation.

### Phase 7 — items for sale

Open **Maintenance > Items for sale**. Maintain categories, descriptions, PHP selling prices, opening stock, restocking, reviewed stock corrections and archive/restore state. Review summaries show the selected unit and stock before/after saving.

Sale-item inventory is separate from borrowed books and printing consumables. A book merchandise entry cannot change catalog copies, loans or reservations. Stock corrections/restocks do not create sales revenue, payments or a cashier workflow. Price/detail changes and stock movements are retained. A signed CSV downloads the current filtered item list; broad lists of 1,000 or more require a narrower search instead of a silently partial export.

## Architecture and database contract

The existing React/Vite and Express modular monolith remains. Printing owns historical service and supply metadata; the inventory module shares bounded stock maintenance for printing materials and merchandise. The existing Librarian permission is checked at both route and transaction boundaries. Student, Faculty, Staff and legacy Admin tokens cannot use these global management routes. No new role or login is added.

Additive Postgres **030_october17_maintenance.sql** adds:

- `historical_print_entries`: versioned current historical facts with separate service, payment and entry instants;
- `print_supply_details`: optional descriptions linked to one existing ink/paper record;
- `maintained_item_categories`, `maintained_stock_items`, `maintained_stock_movements`: kind-separated categories and inventory, constrained units, exact numeric prices/quantities, recorded movement facts;
- `library_maintenance_commands`: actor/key-scoped idempotent command results and input hashes;
- `library_maintenance_events`: append-only correction/detail snapshots and reasons;
- four server-only report views combining online/history service, supported revenue, actual restock expenses and current supply descriptions.

All seven new tables enable RLS and revoke direct `anon`/`authenticated` access; new sequences and views are also revoked. There are no public policies or browser service credentials. History, commands and stock movements reject updates/deletes in database triggers. Existing operational tables are not rewritten. The MySQL tree remains rollback reference **048**, next **049**; these additions require Postgres. CSV-only imports and new Personal Details fields remain outside scope.

### Migration isolation and recovery

The disposable-schema verifier uses **transaction-local** search paths, never a persistent connection setting. During verification an earlier session-scoped test search path was found to survive on pooler backends. The affected test paths were restored to `public`; record fingerprints stayed unchanged. The verifier was repaired and rerun. The migration runner now qualifies its ledger as `public.schema_migrations` and pins `SET LOCAL search_path TO public` inside each migration transaction, protecting future runs from pooled session drift.

Before hosted application, `verify-oct17-hosted.ts before` captures local ignored counts/hashes for 12 existing tables and checks that the additions do not exist. The reviewed single-file runner applies the migration atomically. `verify-oct17-hosted.ts after` verifies checksum, unchanged existing rows, empty new ledgers and RLS/grants. It does not export row contents. Do not replay the whole migration directory or apply deferred enrollment 028. Recovery can disable these new routes while retaining the additive ledgers; destructive removal after real use is not a normal rollback.

## Phase 8 verification

- API unit/route coverage checks historical date/payment validation, unknown counts, money/stock units, paper dimensions and unauthorized management requests.
- Web tests cover review-before-save, duplicate acknowledgement, retained failed-save state, existing queue error recovery and applied report filters.
- `verify-oct17-remaining.ts` creates one uniquely named disposable schema with fake people/jobs/stocks, applies the actual migration, exercises retries/concurrency, corrections/voids, monthly service/revenue, unit/stock boundaries, cross-kind permissions, metadata, archive/restore, database guards and report integration, then drops only that verified schema. It also compares hashes of existing public records. No real school mutations or fabricated historical school transactions are seeded.
- Earlier Phase 1, 3 and 4 isolated checks are rerun as regression evidence. Full API/web suites, production builds and types are checked; generated PDF output is inspected independently of a browser.
- New screens use native labelled controls, existing buttons/cards, touch-sized controls, review focus, a nonmodal alert dialog for void review, semantic errors/success and explicit empty/error states. This source review does not replace actual keyboard/mobile/browser checks.

### Outstanding acceptance

Browser access became available during the final pass. Desktop/mobile screenshots, actual download interaction, native-dialog keyboard behavior and reviewed maintenance forms were checked with the permitted browser. See [final technical QA](revision-oct17-final-qa.md). The only remaining acceptance gate is actual human Librarian feedback. Physical scanners/printers, real email/OTP delivery and campus-scale load retain their stated limits.

## Implementation tracking

- [x] Historical printing ledger, reviewed entry/correction/void UI and report integration.
- [x] Supply metadata, other printing-material stock and recorded expense integration.
- [x] Merchandise categories/items, prices, stock, history, archive/restore and CSV.
- [x] Transactional permissions, idempotency, row versions and append-only guards.
- [x] Isolated migration/feature acceptance and unchanged-record verification.
- [x] Hosted single-file migration and before/after checks.
- [x] Final regression/build/PDF evidence recorded.
- [x] Permitted desktop/mobile browser checks.
- [ ] Live Librarian usability acceptance.

## Change log

| Date | Change |
| --- | --- |
| October 22, 2026 | Owner approved finishing remaining phases except Dewey. Implemented historical printing, supply descriptions, other materials and merchandise maintenance with review/history boundaries. |
| October 22, 2026 | Added isolated Postgres acceptance, route/UI regression tests and additive migration 030. Identified and repaired disposable test search-path leakage; hardened single-file migration schema selection. Browser/human acceptance remains explicitly pending. |

## Delivery evidence — October 22, 2026

- **415 API tests passed**, zero failures (`output/oct17-remaining-api-tests.txt`).
- **286 web tests passed in 76 files**, zero failures (`output/oct17-remaining-web-tests.txt`).
- Final API/web production builds and type checks passed. Existing large web bundle advisory remains (`output/oct17-remaining-build.txt`).
- Isolated Phase 1, 3, 4 and remaining-phase Postgres checks passed. The remaining verifier cleans up its exact disposable schema and uses transaction-local search paths.
- Postgres **030** applied as one reviewed file (31 statements); next unused **031**. Before/after data fingerprints matched across 12 existing tables, and new ledgers were empty with RLS/grants checked. Evidence: `output/oct17-remaining/hosted-before.json`, `hosted-after.json` and `acceptance.json`. These contain metadata/hashes and fake test references, not exported school rows.
- All 13 report kinds and the new historical/supply/item lists passed live read-only checks. Anonymous new management requests returned 401; public catalog options and web root returned 200. API is running on 4000 and web on 5173.
- `output/oct17-remaining/supply-specifications.pdf` and rendered PNG were inspected: dimensions, Unicode multiplication sign, units and fractional material quantities are legible and intact. Prior filtered/empty/long-text PDF evidence remains under `output/oct17-phase4/`.
- No real account, book, copy, loan, attendance, cash payment or stock row was mutated by acceptance. No invented school transactions were added. No deployment or Git push occurred.
- Desktop/mobile browser interaction is now complete. Human Librarian usability acceptance remains open and is not inferred from automated or agent browser testing.

Reproduce isolated checks from the root with `node apps/api/scripts/verify-oct17-remaining.ts`. The before/after hosted verifier is an application-specific migration gate, not a script to rerun `before` after migration has already been applied. Do not reapply changed migration files.

## Final technical delivery

See [final QA, repairs and browser evidence](revision-oct17-final-qa.md). Historical identity/older duplicate protection, stable stock retry keys, modal keyboard access, save/load error separation, dark-label readability and supply review labels were repaired. Final suites: 415 API tests and 286 web tests, all passing; builds/types and isolated Postgres verification passed. Temporary UI fixtures were removed. Applied 030 checksum is unchanged. Human usability acceptance is the remaining sign-off; no implementation task or disabled-browser blocker remains.
