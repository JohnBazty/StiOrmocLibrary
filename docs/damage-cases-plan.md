# Damage cases and lost-book charging

## Why

A book can come back damaged at the desk. Today the desk return can mark the copy `Damaged` and hold it `Unavailable`, but nothing tracks what happens next: no review record, no decision, and no way to charge the borrower when the book cannot be used again. Migration `017_circulation_cases.sql` (applied on live Supabase) added `circulation_cases` and `circulation_case_events`, but no code used them. This work ports the damage-case code from commit `6dd0c64` onto the Postgres-only `main`.

Ethan decided on 2026-11-11: a lost book is charged the book's price, with no extra fee. A copy damaged beyond use is written off as lost and follows that rule.

- **Date created:** 2026-11-12
- **Date last updated:** 2026-11-12
- **Status:** `inprogress` (code and tests done on `feat/damage-cases`; not yet checked on the deployed app)

## Scope

In scope: Damage cases opened from a desk return, the staff worklist and review, three decisions, closing and reopening, the borrower's view, and the book-price charge.

Out of scope (the `017` table supports them, no code here):

- Long-overdue cases and the overdue scan (from `6dd0c64`). They need the job runner and their own decisions.
- Assigning a case to a staff member, dated contact attempts, and opening a case on a loan that is still out.
- Changing the existing lost-book report flow (`decideLost`), which still charges the latest supplier quotation. See Open question.

No migration. `017` is used as applied.

## How

### Flow

1. **Desk return.** Staff scan a returned take-home book, tick "Record damage", choose `Damaged` and write a note. `deskCirculationService.returnCopy` already holds the copy `Damaged`/`Unavailable` and keeps it away from the waiting queue. In the same transaction it now calls `openDamageCaseAtReturn`, which inserts one `Damage` case per loan (`ON CONFLICT (transaction_id, case_type) DO NOTHING`), an `Opened` event, an admin alert and a borrower notice. If the case insert fails, the whole return rolls back.
2. **Worklist.** `/librarian/circulation` and `/staff/circulation` show a Damage cases panel under the loans, filtered by status. Review shows the copy, the book price, any charge, and the event timeline.
3. **Notes.** Desk staff (`desk.operate`) and librarians add notes. The first note moves an `Open` case to `Under Investigation`.
4. **Decision (Librarian only, `library.manage`).** Needs a reason.
   A decision is refused (`CASE_COPY_NOT_HELD`) unless the copy is still `Damaged`/`Unavailable`, so a repaired and re-lent copy is never touched. A write-off asks for confirmation first.
   - `damaged_held`: keep the copy `Damaged`/`Unavailable`.
   - `repaired_available`: set the copy `Good`/`Available` (and its `materials` row).
   - `lost`: write the copy off (`Lost`/`Unavailable`, `Lost Override` audit) and insert a `Confirmed` `lost_book_reports` row with `replacement_charge = titles.purchase_price`, `purchase_price_snapshot` = that price, `charge_resolution = 'Book Price'`, `payment_status = 'Unpaid'`. No fee is added. If the title has no price, the librarian enters the charge; if it has a price, any different amount is rejected. A second charge for the same loan is refused (`CASE_LOST_ALREADY_CHARGED`).
   Every change to the copy writes an `inventory_audit_events` row.
5. **Close and reopen (Librarian only).** Resolve or dismiss with a reason, which notifies the borrower; reopen with a reason.
6. **Clearance.** `'Book Price'` charges count as owed exactly like `'Quoted'` ones: they block clearance, show in totals, and can be settled through the existing "Record payment" action.
7. **Borrower.** Borrowing history shows "Damage review: <status>. <instruction>" for their own loans only. Staff notes are never sent to borrowers.

### API (under `/api/v1/admin`, `desk.operate`)

| Method | Path | Who |
| --- | --- | --- |
| GET | `/circulation/cases?status=&q=&page=&limit=` | desk staff, librarian |
| GET | `/circulation/cases/:caseId` | desk staff, librarian |
| POST | `/circulation/cases/:caseId/notes` `{ notes }` | desk staff, librarian |
| POST | `/circulation/cases/:caseId/dispositions` `{ disposition, reason, replacementCharge? }` | librarian |
| POST | `/circulation/cases/:caseId/resolve` / `dismiss` / `reopen` `{ reason }` | librarian |

### Files

- API: `circulation-case.service.ts`, `circulation-case.validation.ts`, `circulation-case.types.ts` (new); `desk-circulation.service.ts`, `circulation.service.ts` (history), `circulation.controller.ts`, `circulation.routes.ts`, `clearance.service.ts`, `core/schema-readiness.ts`.
- Web: `DamageCasesPanel.tsx` (new), `AdminCirculationMonitor.tsx`, `CirculationReturnDialog.tsx`, `BorrowingHistory.tsx`, `circulation-api.ts`, `desk-circulation-api.ts`, `types.ts`.
- Tests: `circulation-case.service.test.ts` runs real SQL on PGlite with `017` applied as-is (`circulation-case.test.helper.ts`); `circulation-damage-return.test.ts`; additions to `circulation.service.test.ts`, `circulation.api.integration.test.ts`, `clearance.service.test.ts`; web `DamageCasesPanel.test.tsx`, plus additions to `BorrowingHistory.test.tsx` and `CirculationReturnDialog.test.tsx`.

## Lost-book reports (branch `fix/lost-book-price`, stacked on this one)

Ethan approved on 2026-11-12 changing the existing "Report lost" flow to the same rule.

- `clearanceService.decideLost` charges the book price (`'Book Price'`, `purchase_price_snapshot` set) when the title has a price, even if a supplier quotation exists. Only a title with no price falls back to the latest quotation (`'Quoted'`), else `'Awaiting Quotation'` with 0.
- The Clearance page shows the book price on a pending report and sends the amount staff confirmed. The server refuses a different amount (`LOST_BOOK_CHARGE_MISMATCH`), so a price edited after the page loaded is never charged silently.
- A Librarian can waive an unpaid `'Book Price'` charge with a reason of at least 10 characters (wrong price, book found). Waiving sets `replacement_charge` to 0, because the desk borrowing gate, fines and dashboard totals add up `replacement_charge`. It cannot be re-charged from a quotation.
- `'Book Price'` charges now show **Record replacement payment** and **Waive charge** to staff, and appear under the student's Outstanding charges. Before this they were owed but hidden on both pages.

## Implementation tracking

- [x] Read `6dd0c64` and current `main`; keep Damage cases, drop long-overdue for now.
- [x] Damage case opens inside the desk return transaction (test: case opens, no queue allocation, rollback on failure, no case for Worn/unchanged).
- [x] Case service on real Postgres (PGlite + `017`): idempotent open, notes, the three decisions, close/reopen, permissions, worklist, detail, borrower summaries.
- [x] `lost` decision charges the book price once, staff-entered charge only when no price, mismatch rejected.
- [x] Clearance counts and settles `'Book Price'` charges.
- [x] Routes wired under desk permission; librarian checks in the service.
- [x] Web panel, return message, borrower history line, with tests.
- [x] API and web tests and typecheck green.
- [x] plan-verifier (ready, no gaps) and security review: H1 decision refused unless the copy is still held Damaged/Unavailable; M1 write-off confirm step and reload after a failed decision; M2 page capped at 10,000; M3 a charged case cannot be dismissed, close notices keyed per event; M4 stale worklist responses ignored.
- [ ] Checked on the deployed app with Ethan; then status `built`.

## Change log

| Date | Change |
| --- | --- |
| 2026-11-12 | Ethan approved the book-price rule for the existing lost-book report flow; built on `fix/lost-book-price` (see Lost-book reports). Security review: no CRITICAL/HIGH; fixed the stale-price and no-waiver MEDIUM findings. |
| 2026-11-12 | Local check on the live data (read only): panel, review and forms work for a Librarian. Fixed case event times, which used the database UTC clock and showed 8 hours behind the case time; events now use the same Manila clock. Events written before this fix stay in UTC. |
| 2026-11-12 | Review fixes H1, M1-M4 (see tracking). Decisions now need the copy still held as damaged (`CASE_COPY_NOT_HELD`); a charged case cannot be dismissed (`CASE_CHARGED_CANNOT_DISMISS`). |
| 2026-11-12 | Created. Ported Damage cases from `6dd0c64` to Postgres-only `main`; charge for a written-off copy = book price (Ethan, 2026-11-11). Case opening moved into the existing desk return instead of the old separate report-damage endpoint. Long-overdue cases left for later. |
