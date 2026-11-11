# Simplify the borrowing and return desk

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` |

## Why

The owner finds the current desk too complicated. Multiple scan controls, confirmation buttons, assignment history and three separate transaction tables compete for attention. A return selected from a table requires moving to another part of the page and repeating a lookup.

## How

### Owner-requested quick-counter follow-up

The owner says the wizard still has too many processes. Replace its stepper and separate review step with one counter: select the borrower once, scan a physical copy, see its details next to the borrower, then confirm. Scanner Enter and pasted complete codes perform lookups directly; typing retains an Enter/Look up fallback. Keep the borrower selected after a successful checkout, refresh eligibility, clear only the book and focus the next barcode. An expired/unverifiable identity clears the selection. Ready pickup requests are matched automatically by their exact assigned barcode.

For missing attendance, offer an explicit Check in here action using the already scanned QR, then recheck eligibility. Use the existing entry-only attendance operation with a stable retry ID; never toggle an existing visit to Exit. Show closed/capacity restrictions before offering entry, retain server validation, and never record attendance merely on QR lookup. No attendance rule is removed. Returns retain their automatic lookup and one confirmation and focus the barcode field for the next returned copy.

- [x] Replace the wizard with a compact counter and automatic scan lookups.
- [x] Retain and revalidate the borrower for another book; match ready requests automatically.
- [x] Add explicit attendance entry beside the selected borrower with existing safeguards.
- [x] Verify scan, retry, attendance, multi-book identity and responsive UI behavior.

#### Quick-counter verification

- **30 focused tests passed** across the actual desk/scan input, loan list, integrated returns and return dialog. Web production build/type checks passed; existing bundle-size advisory remains.
- Pasted complete codes and scanner Enter invoke lookup immediately. Look up is shown only after manual typing, where Enter is also supported. The book field, borrower and final confirmation are on one screen. Normal scans require no Continue, Verify or request-selection clicks.
- Checkout retains the selected borrower, clears only the completed copy and refreshes eligibility before lending another book. A failed refresh explicitly says checkout was saved and clears the borrower to prevent an unsafe second attempt. Next borrower clears identity and the copy; five minutes of inactivity also expires the UI selection. Server credential expiry and transaction checks remain authoritative.
- A changed take-home/in-library setting rechecks the same scanned QR under the new mode. Ready requests match only the exact assigned barcode. Tests cover non-matching copies, explicit in-library intent and stable checkout IDs on retries.
- Missing attendance uses the existing `attendanceApi.state` and entry-only `attendanceApi.scan` with the same scanned QR and stable retry ID. Merely resolving a borrower creates no visit. Closed hours, full capacity or a borrowing restriction disable the inline action; the API checks again at submission. No Exit request is sent. Remaining account/fine/visit restrictions still prevent checkout after entry is recorded. An attendance-only blocker is replaced by the actionable inline entry panel rather than duplicated as an entrance instruction.
- Return confirmation keeps the counter in Return mode, clears and focuses the barcode for the next copy. Cancelling a row-opened return restores the original focus and preserves an unfinished borrow selection.
- Browser checks used actual components and a temporary isolated sample-response page, with no real-account login or database operations. Verified automatic paste lookup, explicit inline check-in, borrower retention after a sample checkout, a second book without another QR, Return completion and next-barcode focus. At 390×844, document width stayed at or below 390px; the borrower summary and Next borrower button wrap clearly. Evidence: `output/quick-counter-borrow.png` and `output/quick-counter-mobile.png`.
- Removed the sample HTML/TSX and browser tab, and reset the viewport override. Physical scanner suffix configuration, real camera hardware and human staff acceptance remain unverified. No real loan, attendance or account was changed by these checks. No backend/schema change, push or deployment.

### Earlier guided-screen iteration

Provide two clear tasks: Borrow and Return. Borrowing shows one active step at a time: borrower QR, physical book barcode, review and confirmation. Keep take-home versus in-library use explicit, current attendance/eligibility checks, approved profile identity and ready request selection. Completed steps become compact summaries with Change actions.

Open a focused return review dialog from a loan row or a scanned barcode. Load the authoritative preview automatically, show the exact barcode, title and borrower, and require one explicit final confirmation after the operator matches the physical copy. Condition changes are optional and collapsed by default. Loading, lookup failure, retry and pending-write states are visible. Trap keyboard focus, support Escape before submission and restore focus on close. No table action automatically commits a return.

Replace the three visible loan tables with one searchable list and Borrowed/Overdue/Pending filters, retaining penalty, cancellation and lost-report operations under secondary controls. Use responsive loan cards to avoid a wide transaction table on phones. Move in-library history into a collapsible section. Keep the existing API, policy, authorization, idempotency keys and stale-assignment checks.

References consulted: Final Draft pages 19–21, Administrative System Flow page 1, Revision Phase 5 approved flow and owner-approved in-library/temporary enrollment policy. No migration or database policy change; Postgres 026 / next 027 and MySQL reference 048 / next 049 remain unchanged.

## Implementation tracking

- [x] Review existing desk, return handlers, approved requirements and backend confirmation checks.
- [x] Build guided borrowing and focused return review.
- [x] Simplify search, loan navigation and secondary actions.
- [x] Verify workflow gates, retries, cancellation and keyboard behavior with tests.
- [x] Inspect desktop and mobile browser layouts without changing existing loans.

## Results and verification

- Implemented the same guided desk for Librarian and Staff. Borrower/profile and book summaries replace completed input steps; changing borrower resets the selected request and copy. In-library use remains explicit through the final button and API intent. Attendance and enrollment policies are unchanged.
- Loan-row **Return book** opens an accessible review dialog and fetches the current borrower/copy automatically. Manual Return uses a barcode lookup and the same dialog. Lookup and write failures are displayed; retrying an unchanged failed confirmation retains its idempotency key. Optional condition changes rotate that key; damage requires a note. Confirmation is disabled during lookup/saving and duplicate submissions are guarded. Escape/Back cannot interrupt a pending write.
- One searchable open-loan list replaces the separate tables. Filter buttons select Borrowed, Overdue and Pending pickup. Returned/cancelled rows do not receive return actions. Cancellation, lost reports and penalty calculation remain under More actions. Pending pickup starts the borrower step with focus, rather than committing checkout from the list. The existing monitor API's 100-record response limit remains; large-ledger server-side search/pagination was not changed in this UI task.
- **19 focused tests pass** across the desk, monitor, integrated return flow and return-dialog files. Covers attendance blockers, ready request IDs, explicit in-library intent, changing selections, cancellation, lookup failure/retry, no automatic writes, retained retry IDs, duplicate-submit guard, optional condition notes and keyboard focus trapping/restoration. Web TypeScript and production build passed; the existing bundle-size advisory remains.
- Opened the real personnel screen and confirmed the new layout loads. The live session became invalid during this check; no further real-account login was attempted. The database currently had only Returned/Cancelled transactions, so remaining visual/interaction checks used a temporary Vite screen importing the actual components with isolated sample API responses. This preview makes no database requests. Sample borrower → book → review, loan-row return → popup → sample confirmation, keyboard Tab/Shift+Tab and 390×844 layout were inspected. No real checkout or return was performed by this work.
- At 390×844 the return dialog measured 366px wide, with top/bottom around 77/767px; document width was 390px. The guided mobile screen also had no horizontal overflow. Screenshots are `output/circulation-guided-borrow.png`, `output/circulation-simple-return.png`, `output/circulation-simple-return-mobile.png` and `output/circulation-guided-mobile.png`; all final screenshots show sample identities.
- Temporary preview HTML/TSX files and the agent browser tab were removed, and the viewport override was reset. No database fixtures, schema changes, migrations, push or deployment. Physical scanner/camera hardware, screen-reader devices and a complete physical phone matrix were not tested. Human Librarian usability acceptance remains open.

## Change log

- 2026-10-16: Owner requested a user-friendly circulation workflow; began a frontend redesign preserving the existing circulation rules.
- 2026-10-16: Completed guided borrowing, direct return review, searchable loan cards and progressive disclosure. Verified automated workflows, build and desktop/mobile sample previews; retained live policy and confirmation boundaries.
- 2026-10-16: Owner requested fewer actual operations after trying the guided screen. Started the quick-counter follow-up above; preserve the earlier iteration's evidence as historical results.
- 2026-10-16: Completed the quick counter, automatic lookup, retained borrower, automatic ready-request match, explicit inline attendance and repeat-return focus. Thirty focused checks and build passed; desktop/mobile sample verification completed and temporary fixtures removed.
