# Phase 8 - Librarian usability trial

| Field | Value |
| --- | --- |
| Why | Check that routine work is understandable and practical before final acceptance |
| Date created | 2026-10-12 |
| Date last updated | 2026-10-12 |
| Status | `planned` |
| Reviewer / date / device | To be recorded |

## How to review

Sign in through `/staff` using the existing Librarian account. The dashboard is `/librarian/dashboard`; Reports is `/librarian/reports`. On the actual database, begin with viewing, searching and exporting. Exercise imports, approvals, event changes, lending, payments and archives only in a separate disposable test environment or as legitimate authorized library work. Do not add fake activity to fill dashboard zero counts.

Record confusing labels, extra input, clicks needed, errors and the expected result. Include screenshots with passwords and codes hidden. Use a phone as well as the desk computer; confirm focus, menus, scrolling and tap targets. Automated service checks already passed, but camera/hardware scanning and a real Librarian's judgment still need this trial.

## Tasks and acceptance record

| Task | Expected result | Reviewer result / issue |
| --- | --- | --- |
| Public browse and search | Book covers, descriptions and copy availability visible before login; Borrow requests sign-in | Pending |
| Dashboard task cards | Correct destination and live counts; filtered clearance cards match the active-student lists | Pending |
| Catalog search/import | Search locates known title/barcode; overlaps reviewed before import; retry does not duplicate copies | Pending |
| Request preparation/pickup | Preparing differs from Ready; 24-hour clock begins at Mark Ready; right copy is collected | Pending |
| QR and copy scanning | Current attendance/eligibility required; one checkout for one copy; return records correct copy/condition | Pending |
| In-library use | Same-day handback is visible; no home-loan slot or automatic home-loan fine consumed | Pending |
| Approvals and account history | Review/approve/reject without editing another user's profile; deactivation history remains available | Pending |
| Operating events | Remaining seats and paused services are clear; Staff cannot change operating policy | Pending |
| Collection review | Copyright age uses approved starting year; unknown years/criteria show verification needed | Pending |
| Reports | Applied range/search/status match preview and full export; attendance peak/duration criteria are clear | Pending |
| Printing regression | PDF/DOCX page count, copies/pricing, document access and payment records work for actual intended files | Pending |
| Permission review | Staff can announce and work at the desk; cannot open account/report/policy controls; users see their own records | Pending |
| Phone/keyboard/error review | Menus and forms usable; failures do not look like empty success; cards usable by keyboard | Pending |

## Isolated automated fixtures

`node apps/api/scripts/verify-phase8-acceptance.ts` creates Mira Book Borrower, Noah Library Reader, Prof. Elena Researcher, Trial Librarian, Trial Desk Assistant and Trial Recovery Administrator. It creates Database Systems / P8-BOOK-1 and Research Methods / P8-BOOK-2, runs attendance/request/loan histories, generates signed QR and Code 128 labels under ignored `output/`, then removes the entire disposable schema. It neither sends email nor copies actual operational records into fixtures. Labels stop working when the verifier removes their credentials; they must not be used at the real library desk. A persistent isolated environment is needed for a human exercise of those fixture accounts.

## Sign-off

- [ ] Reviewer and device details recorded.
- [ ] Tasks above reviewed; actual results and evidence recorded.
- [ ] Usability defects resolved and retested.
- [ ] Physical scanning and intended PDF/DOCX files checked on target devices.
- [ ] Enrollment exception and unapproved collection requirements acknowledged.
- [ ] Librarian approves the current local workflow.

Sign-off is pending. Do not mark Phase 8 built based only on the automated tests.

## Change log

- 2026-10-12: Created the trial checklist after local technical implementation and isolated verification. No human acceptance result has been recorded.
