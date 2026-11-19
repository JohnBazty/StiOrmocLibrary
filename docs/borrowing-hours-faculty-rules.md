# Take-home hours, 8 AM due time and faculty rules

- **Why:** the Librarian changed the borrowing rules (Ethan, 2026-11-19). Take-home borrowing now opens at 2 PM, books are due at 8 AM on the next open day, faculty get a borrowing cap, and faculty pay no overdue fines. Students keep the 2-book limit; fines stay PHP 2 per hour and PHP 10 per day.
- **Date created:** 2026-11-19
- **Date last updated:** 2026-11-19
- **Status:** inprogress (branch `fix/borrowing-hours-faculty-rules`)

## Decisions (Ethan, 2026-11-19)

| Rule | Value |
| --- | --- |
| Take-home borrowing | From 14:00 until the borrowing cutoff before closing (17:00). Before 14:00 only in-library reading is allowed. |
| Due time | 08:00 on the next open library day (Sunday and closed days are skipped). Borrowed Saturday 15:00, due Monday 08:00. |
| Student limit | 2 active books or requests (unchanged). |
| Faculty limit | 5 active books or requests. |
| Overdue fines | PHP 2 per hour on the due date, PHP 10 per library day after it (unchanged), cap PHP 500. Students only. |
| Closed hours | The PHP 2 hourly fine counts only while the library is open (closes 17:00). Hours after closing, Sundays and closed days are not charged. On the due date the hourly total never exceeds one day's rate (PHP 10). |
| Faculty overdue | No fine. While a book is overdue the faculty member cannot borrow and shows as Not Cleared. |
| Faculty lost book | Still charged the book's price (lost-book rule from 2026-11-11). |

## What the code does today (main)

- `borrowing_policy_versions` already has `student_max_active_books`, `faculty_max_active_books` (null means no cap), `borrowing_days` and `due_time_cutoff`. The Librarian publishes new versions.
- The take-home due date comes from `exactLoanDeadline` (`circulation/exact-loan-deadline.ts`), which keeps the *borrowing clock time* N days later. `due_time_cutoff` is stored but not used for take-home loans.
- No setting exists for the hour take-home borrowing opens. `libraryState().allowBorrowing` only checks opening hours and the pre-closing cutoff.
- Fines are written in `circulation-overdue.service.ts`, `circulation.service.ts` (two places on return) and `fines.service.ts` (manual fine). None of them check the borrower's role, so faculty are fined today.
- Clearance already reads overdue loans and unpaid charges; `clearance.service.ts` lists only Students in the clearance list (faculty lookups by ID work).

## How

1. **Migration `041_take_home_opens_at.sql`:** add `take_home_opens_at time NOT NULL DEFAULT '14:00'` to `borrowing_policy_versions`. No data rewrite.
2. **Policy fields:** add `takeHomeOpensAt` to `borrowing-policy.types.ts`, validation (HH:mm), repository insert/select, and the Librarian's Borrowing rules page.
3. **Take-home window:** in `borrowerEligibility` (`desk-circulation.policy.ts`), when `mode === 'TakeHome'` and Manila time is before `take_home_opens_at`, add the blocker "Take-home borrowing opens at 2:00 PM. You can read this book inside the library now." In-library and online modes are unaffected. The kiosk and borrow cart reuse this check.
4. **Due at 08:00 next open day:** `policyDueDate` uses the existing `calculateOperatingDueDate`-style logic: advance `borrowing_days` open days (open-day set and closures from the schedule, as now) and set the clock to `due_time_cutoff`. `exactLoanDeadline` stays for renewals only if renewals still need it; check its callers first.
   ```ts
   // borrowed Mon 14:30, borrowing_days 1, cutoff 08:00 → Tue 08:00 Manila
   return operatingDeadline(now, Number(policy.borrowing_days), String(policy.due_time_cutoff), open, closures)
   ```
5. **Faculty pay no overdue fine:** one shared check `finesApply(role)` (true only for Student) used at the three automatic overdue-fine insert sites, so faculty loans never get an overdue fine row. Manual fines (`fines.service.ts`) and lost-book charges stay allowed for faculty.
6. **No hourly fine while closed:** port by hand only the calculator part of commit `b8ab0889` from `fix/fair-fine-rates` (reverted on main by `c44d5bb3`). It does not apply cleanly because it builds on `0193aecd`. Ask John why he reverted the merge first.
   - Take: `closingOn()` with the 17:00 fallback for a missing or malformed `closes_at`; hours on the due date stop at closing; a due-date amount that reaches the daily rate is stored as 1 Daily unit, so units × rate = amount; after the due date the fine is `max(open days × daily rate, due-date amount)`; `loadFineContext` reads `closes_at`; the calculator tests from that commit.
   - Leave out: `selectFinePolicy` / `policyFor` (rates by due date) and the Librarian Fine rules page from `0193aecd`. Rates are not changing, and John removed that page in the revert. Migration `038` stays applied live and needs nothing.
   - Fix the fine note text in `circulation.service.ts`, "Calculated from the operating calendar and 8:59 AM cutoff", so it no longer names 8:59 AM.
   ```text
   due Tue 08:00 → returned Tue 13:00 = PHP 10; Tue 16:59 = PHP 10 (not 18); seen Tue 23:00 = PHP 10 (not 30); Wed 08:00 = PHP 10
   ```
7. **Faculty still blocked:** the existing overdue blocker in `borrowerEligibility` already stops borrowing. Add Faculty to the clearance list in `clearance.service.ts` so overdue faculty show as Not Cleared.
8. **Publish the values:** after deploy the Librarian publishes a new policy version: student 2, faculty 5, borrowing days 1, due cutoff 08:00, take-home opens 14:00. No live write from code.

## Tests (write first)

- `exact-loan-deadline` / due-date: Mon 14:30 → Tue 08:00; Sat 15:00 → Mon 08:00; a closed Tuesday → Wed 08:00.
- `borrowerEligibility`: TakeHome at 13:59 blocked, 14:00 allowed; InLibrary at 10:00 allowed.
- Faculty limit: 6th commitment blocked with limit 5.
- Overdue job and return: Student overdue gets a fine row; Faculty overdue gets none but is still blocked from borrowing and shows Not Cleared.
- Policy validation: `takeHomeOpensAt` must be HH:mm.
- Fine calculator: due 08:00, evaluated 13:00, 16:59, 23:00 and next day 08:00 all give PHP 10; evaluated 10:30 gives PHP 6; a closed day after the due date adds nothing.

## Risks and open points

- `fix/fair-fine-rates` was merged, then reverted on main by John (`c44d5bb3`, 2026-11-18). Step 6 restores its calculator; confirm with John why he reverted first.
- Loans already out keep their stored `due_at`; only new loans use 08:00.
- Web pages that say "due at the same time" or show the hour need their text checked.

## Implementation tracking

- [ ] Migration `041_take_home_opens_at.sql` (tracker: next unused becomes `042`)
- [ ] Policy type, validation, repository, Librarian page field
- [ ] Take-home 14:00 blocker
- [ ] Due date 08:00 next open day
- [ ] No automatic overdue fines for Faculty
- [x] Hourly fine only while open (restore fair-fine calculator)
- [ ] Faculty in clearance list
- [ ] Tests listed above
- [ ] `plan-verifier`, `security-reviewer`, `database-reviewer`
- [ ] Librarian publishes the new policy version after deploy

## Change log

- 2026-11-19: Plan created from the Librarian's new rules and Ethan's answers (take-home opens 14:00, due 08:00 next open day, faculty cap 5, faculty no overdue fines but blocked and Not Cleared, lost book still charged).
- 2026-11-19: Added step 6 (Ethan): the PHP 2 hourly fine is not charged while the library is closed (after 17:00, Sundays, closed days); restore the fair-fine calculator reverted in `c44d5bb3`.
- 2026-11-19: Step 6 narrowed to the calculator from `b8ab0889`; per-due-date rate selection and the Fine rules page are left out.
- 2026-11-19: Ethan approved building. Step 6 built on `fix/borrowing-hours-faculty-rules`: calculator ported from `b8ab0889`, its 10 tests plus an 8 AM due case, return note no longer names 8:59 AM. API 507 tests pass; typecheck passes. Steps 1–5, 7 and 8 not started.
