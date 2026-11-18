# October 17 revisions — Phase 4 reports

| Field | Value |
| --- | --- |
| Why | Give the Librarian clear report choices and downloads containing the records selected in the preview. |
| Date created | October 22, 2026 |
| Date last updated | October 22, 2026 |
| Status | `built` — implementation, automated/database/PDF checks and desktop/mobile browser inspection passed; human acceptance is tracked in Phase 8. |
| Approved scope | Phase 4 of `revision oct 17.md`. Phase 2 Dewey work remains deferred. Phases 5–7 are built; final technical QA is complete. |

## How to use

1. Open **Librarian > Book Reports**.
2. Choose a report. Search guidance and available statuses change with the report.
3. Choose dates or a semester when applicable, then select **Apply filters**.
4. Read the matching count and preview. Select **CSV** or **PDF** to download every matching record, including other preview pages.

Editing filters shows an amber reminder and disables downloads until those changes are applied. Applying unchanged filters also refreshes the report. Failed reads show an error rather than an empty or zero result. Report reads and downloads do not poll every second or renew an idle session.

Holdings, current print supplies and Student clearance are current snapshots. Past dates cannot reconstruct their earlier state. Separate collection-review export cards have their own stated scope and do not inherit the operational report filters above them.

## Implementation

### Shared terminology and boundaries

- `report-contract.ts` owns all 13 report names, columns, labels, search guidance, date explanations, snapshot flags and relevant status choices. The authorized `/api/v1/admin/reports/options` endpoint supplies that contract to the web preview.
- Student clearance uses **Student ID**; reports including Faculty use **Student / Faculty ID**; attendance uses **User ID**. Identifier values remain text, including leading zeroes. CSV software may still require importing that column as text rather than opening it with automatic number conversion.
- Reservations and cart handovers stay distinct. **Awaiting handover** does not mean a loan has started. In-library statuses use readable **In use**, **Returned** and **Needs review** wording.
- New options, preview and download routes retain Librarian `library.manage` checks. Restricted Staff, Student, Faculty and legacy Admin roles cannot read the global reports. No new account authority is granted.

### Matching preview and export

- Preview and CSV/PDF use the same parsed kind, literal search, exact status and period/term criteria. Search is case-insensitive and treats `%` and `_` as text rather than SQL wildcards.
- SQL report filters run before the 20,000-matching-record ceiling. An older matching fine is no longer lost behind the fine-management screen's former 5,000-record shortlist.
- Preview shows 20 rows per page. Downloads read every match in deterministic order; a preview page is not an export limit. Empty exports retain labels and applied criteria without falling back to the full ledger.
- Downloads include criteria, matching count, generation time and Asia/Manila timezone. Export re-reads committed records; it is not a frozen copy of an earlier preview. Simultaneous operational activity can legitimately change the matching count.
- Fine balances retain issued-receipt allocations, adjustments, confirmed replacement charges and the existing accruing-status meaning. Reversed receipts are not counted as paid allocations.
- Active holdings exports exclude archived physical copies, respect current material availability and flag unusable copy conditions as unavailable. Research records archived from viewing are excluded from the current holdings snapshot.
- Inventory exports now include their own selected criteria. The printing queue's report button sends its current search, job status and payment status instead of silently using default filters.

### Dates and semesters

- Ranges use inclusive start midnight and exclusive midnight after the ending date in Philippine time.
- Each report explains its source date: borrowing, actual return, request, in-library start, attendance visit, fine assessment, receipt, print submission, payment receipt or supply movement.
- Confirmed semester start/end dates are required. Missing or invalid dates cause a clear error; they never broaden a semester export to all dates. Unconfirmed terms are disabled in the selector.
- UTC server audit fields, including print submission and restock creation, are converted to Philippine time. Existing Philippine wall-time service fields, including reservation requests and received-payment dates, retain their established semantics. Printing revenue uses receipt time rather than submission time.
- No existing timestamps are rewritten. Records imported historically without known timezone provenance were not retroactively corrected.

### PDF and CSV

- PDF headers and criteria measure wrapped text. Table headings repeat on subsequent pages. Oversized rows continue across pages with an explicit continuation marker instead of clipping or dropping text.
- Existing Unicode fonts remain enabled for live operational reports. The shared renderer retains A3 landscape layout.
- CSV quotes embedded commas, quotes and line breaks, guards formula-like values including leading whitespace, and retains the existing integrity seal.

## Verification and evidence

| Check | Result |
| --- | --- |
| API suite | 410 passed, 0 failed. Includes unauthorized options/preview/export checks, malformed filters, label contract and CSV safety. |
| Web suite | 283 passed in 74 files. Includes draft-versus-applied filters, unchanged-filter refresh, errors/empty results and filtered page-2 exports. |
| API/web production builds and type checks | Passed. Existing large web-bundle advisory remains. |
| Isolated Postgres acceptance | Passed using connection-local TEMP tables and an unconditional rollback. No school records were inserted, edited or removed. |
| All 13 report kinds against configured database | Read-only smoke checks passed. This is not a load test or proof of every historical record's accuracy. |
| Running API access | Public catalog options returned 200; anonymous protected report options and preview returned 401. |
| PDF inspection | Rendered filtered output and the last page of a very long record inspected. Text checks verified all 45 filtered rows, both long-text sentinels and all 650 repeated Unicode passages. Empty PDF contains the empty-result message. |
| Desktop/mobile browser inspection | **Passed in the final delivery.** Permitted browser verified applied filters, disabled stale downloads, filtered PDF download, mobile navigation and local table scrolling. See the final QA record. |

Reproducible database acceptance: `node apps/api/scripts/verify-oct17-phase4.ts`.
The script requires the configured Postgres connection, shadows all touched source tables with TEMP fixtures on one connection, restricts service reads to SELECT statements and rolls the outer transaction back in `finally`. It verifies:

- 45 matching loans; page-2 preview contains 20 rows while its sealed CSV contains all 45 and excludes nonmatches;
- literal and case-insensitive search, leading-zero IDs, real return dates and confirmed/unconfirmed semester handling;
- exact Manila midnight boundaries for borrowing and UTC print submissions;
- revenue dated by payment receipt, an older fine among 5,301 obligations and correct allocation/adjustment math;
- reservation/cart labels, active-copy holdings and availability, empty exports and long-text PDFs;
- rejection above 20,000 matches while a narrow search over the same larger source succeeds.

Local ignored evidence is under `output/oct17-phase4/` (`filtered.csv`, `empty.csv`, `filtered.pdf`, `empty.pdf`, `long-text.pdf` and rendered PNGs). Suite/build logs are `output/oct17-phase4-api-tests.txt`, `output/oct17-phase4-web-tests.txt` and `output/oct17-phase4-build.txt`. These files contain disposable acceptance data, not exported school reports. The temporary web QA page was removed after browser access remained unavailable.

## Implementation tracking

- [x] Shared report labels, choices and search guidance.
- [x] Applied-filter export contract, pagination and bounded matching reads.
- [x] Semester/date boundaries and current-snapshot explanations.
- [x] Printing/inventory export entry points carry their own selected filters.
- [x] PDF continuation, Unicode preservation and sealed, formula-safe CSV.
- [x] API/web suites, builds, isolated database acceptance and PDF checks.
- [x] Inspect desktop and mobile report controls, local table scrolling, keyboard focus and download behavior in the permitted browser.
- [ ] Obtain live Librarian usability acceptance during Phase 8.

## Database and scope

No schema changes, migrations, real-account mutations, deployments or pushes. Recorded applied product migration remains Postgres **029**, next unused **030**. Enrollment **028** remains an unapplied draft. MySQL reference **048**, next **049**, remains unchanged. Dewey fields are excluded until the owner resumes Phase 2. Historical printing and supply additions remain future phases.

## Change log

| Date | Change |
| --- | --- |
| October 22, 2026 | Implemented Phase 4 contract, readable labels, applied filters, export scope and date handling. Repaired the fine shortlist, active-copy holdings and printing export-filter gaps. |
| October 22, 2026 | Verified suites, builds, isolated Postgres cases, running API boundaries and rendered PDFs. Kept status `inprogress` because the permitted browser still reports disabled access. |

## Final delivery update

Browser access became available. Phase 4 is now built. [Final technical QA](revision-oct17-final-qa.md) records 415 API tests, 286 web tests, builds/types, actual browser results and remaining human/device limits. Applied product migration is now 030, next 031; the earlier no-migration paragraph records this phase’s original milestone.
