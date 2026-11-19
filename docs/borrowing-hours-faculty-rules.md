# Checkout hours, 8 AM due time and faculty rules

- **Why:** the Librarian changed the borrowing rules (Ethan, 2026-11-19). Checkout now opens at 2 PM, books are due at 8 AM on the next open day, faculty get a borrowing cap, and faculty pay no overdue fines. Students keep the 2-book limit; fines stay PHP 2 per hour and PHP 10 per day.
- **Date created:** 2026-11-19
- **Date last updated:** 2026-11-19
- **Status:** inprogress (branch `fix/borrowing-hours-faculty-rules`)

## Decisions (Ethan, 2026-11-19)

| Rule | Value |
| --- | --- |
| Checkout | From 14:00 until the borrowing cutoff before closing (17:00). Before 14:00 only in-library reading is allowed. |
| Due time | 08:00 on the next open library day (Sunday and closed days are skipped). Borrowed Saturday 15:00, due Monday 08:00. |
| Student limit | 2 active books or requests (unchanged). |
| Faculty limit | 5 active books or requests. |
| Overdue fines | PHP 2 per hour on the due date, PHP 10 per library day after it (unchanged), cap PHP 500. Students only. |
| Closed hours | The PHP 2 hourly fine counts only while the library is open (closes 17:00). Hours after closing, Sundays and closed days are not charged. On the due date the hourly total never exceeds one day's rate (PHP 10). |
| Faculty overdue | No fine. While a book is overdue the faculty member cannot borrow and shows as Not Cleared. |
| Faculty lost book | Still charged the book's price (lost-book rule from 2026-11-11). |
| Faculty manual fine | Allowed. The Librarian can still record a fine by hand (for example, damage). |
| Checkout opens at (setting) | The Librarian sets it on the Borrowing policy page; allowed values 08:00 to 16:59. Default 14:00. |
| Fine rates on the page | Shown as read-only text. Not editable; the reverted Fine rules page stays out. |

## What the code does today (main)

- `borrowing_policy_versions` already has `student_max_active_books`, `faculty_max_active_books` (null means no cap), `borrowing_days` and `due_time_cutoff`. The editor that publishes new versions is archived: `/api/v1/admin/borrowing-policies` answers `410` and `/librarian/borrowing-policies` shows `BorrowingPoliciesArchivedPage`.
- `exactLoanDeadline` has one caller, `policyDueDate` (`desk-circulation.policy.ts`), used by desk checkout and `circulation.service.ts` (`confirmCheckout`, request checkout). The preview in `circulation-preflight.ts` already uses `calculateOperatingDueDate` with the policy cutoff.
- `confirmCheckout` calls `borrowerEligibility` with the default mode `'TakeHome'`, so reservation pickups go through the same check as desk checkouts. Online requests use mode `'Online'`.
- Renewal code is not on main (it is on John's circulation audit branch).
- The checkout due date comes from `exactLoanDeadline` (`circulation/exact-loan-deadline.ts`), which keeps the *borrowing clock time* N days later. `due_time_cutoff` is stored but not used for checked-out loans.
- No setting exists for the hour checkout opens. `libraryState().allowBorrowing` only checks opening hours and the pre-closing cutoff.
- Fines are written in `circulation-overdue.service.ts`, `circulation.service.ts` (two places on return) and `fines.service.ts` (manual fine). None of them check the borrower's role, so faculty are fined today.
- Clearance already reads overdue loans and unpaid charges; `clearance.service.ts` lists only Students in the clearance list (faculty lookups by ID work).

## Spec

**Goal:** a checkout before 14:00 is refused, every new checkout is due 08:00 on the next open day, faculty are capped at 5 and get no automatic overdue fine, hourly fines stop at closing, and the Librarian can see and publish these values on a working Borrowing policy page.

### Requirements

| # | Requirement | Current | Target | Pass/fail check |
| --- | --- | --- | --- | --- |
| R1 | Checkout window | No start time; checkout allowed whenever the library takes entries | `TakeHome` checkouts (desk, kiosk, reservation pickup) before `checkout_opens_at` are refused with "Checkout opens at 2:00 PM." | Test: 13:59 refused with that message; 14:00 allowed; `InLibrary` at 10:00 allowed; `Online` request at 10:00 allowed |
| R2 | Due time | Due at the borrowing clock time, `borrowing_days` later | Due at `due_time_cutoff` (08:00) after `borrowing_days` open days, skipping closed weekdays and `library_closed_days` | Test: Mon 14:30 → Tue 08:00; Sat 15:00 → Mon 08:00; Tue closed → Wed 08:00; stored `due_at` equals the preview date |
| R3 | Faculty limit | `faculty_max_active_books` exists; live value unknown | Faculty limit read from the policy; with 5, a 6th book or request is refused | Test: faculty with 5 commitments is refused; student with 2 is refused |
| R4 | Faculty overdue fine | Faculty get overdue fines like students | No automatic overdue fine row for Faculty at the overdue job or on return | Test: overdue Faculty loan creates no `fines` row; overdue Student loan does |
| R5 | Faculty still held | Overdue already blocks borrowing; clearance list shows Students only | Overdue Faculty cannot borrow and appear as Not Cleared in the clearance list | Test: overdue Faculty gets the overdue blocker and is listed Not Cleared |
| R6 | Faculty manual and lost charges | Allowed | Unchanged: manual fines and lost-book charges still allowed for Faculty | Test: manual fine for a Faculty school ID still succeeds |
| R7 | Hourly fine only while open | Done on this branch (`8e82ebf8`) | Kept | Existing 13 calculator tests pass |
| R8 | Policy editor | Archived (410 and archive page) | Librarian can list, view and publish policy versions at `/librarian/borrowing-policies`; other roles get 403 | Route tests: Librarian 200/201, Admin/Staff/Student/Faculty 403 (`library.manage` is Librarian only); web test: page renders the form for Librarian |
| R9 | Checkout time field | Does not exist | "Checkout opens at" field saved in each version, shown in the review-changes list and the history table; must be 08:00–16:59 | Validation test: 07:59 and 17:00 refused, 14:00 accepted; web test: field present and sent on publish |
| R10 | Read-only fine rules | Not shown | Page shows the fine rules as text: PHP 2 per open hour on the due date up to PHP 10, PHP 10 per open day after, cap PHP 500, students only; faculty no overdue fine but blocked and Not Cleared | Web test: the text is present and has no inputs |
| R11 | Labels match the rules | "Due cutoff", "operating day(s) @" | "Due time (next open day)"; summary reads "Due 8:00 AM, 1 open day after borrowing" | Web test: new labels present |

### In scope

- Migration `041_checkout_opens_at.sql` and the policy field through type, validation, repository, service and page.
- Checkout blocker, 08:00 due date, faculty limit, faculty fine skip, faculty clearance list.
- Turning the policy editor back on for the Librarian, with the new field, labels and fine text.

### Out of scope

- Editing fine rates on any page (read-only by decision).
- Renewals: not on main; John's audit branch owns them.
- Changing due dates of loans already out: they keep their stored `due_at`.
- Library hours: already 08:00–17:00 (migration `040`, live).
- Publishing the new values on the live site: the Librarian does it after deploy (step 9).
- Mobile app screens.

### Edge cases

| Edge | Requirement | Decision |
| --- | --- | --- |
| Checkout at exactly 14:00 | R1 | Allowed (window starts at 14:00 inclusive) |
| Checkout after the pre-closing cutoff | R1 | Still refused by the existing `allowBorrowing` check |
| Reservation pickup before 14:00 | R1 | Refused like any checkout; the hold keeps its pickup deadline |
| Borrowed on the day before a run of closed days | R2 | Due 08:00 on the first open day after them |
| Faculty limit left blank | R3 | Means no cap (current behaviour); the Librarian sets 5 |
| Fine row that already exists for a Faculty loan | R4 | Left as it is; the Librarian can waive it. No data rewrite |
| `checkout_opens_at` missing on an old version | R1, R9 | Column default 14:00 fills it |
| Publish with 17:00 or later | R9 | Refused with a field error |

### Must-not

- Must not refuse in-library reading or online requests before 14:00 (R1; test).
- Must not change `due_at` of existing loans (R2; test that only new loans use 08:00).
- Must not create an automatic overdue fine for Faculty (R4; test).
- Must not let a non-Librarian publish a policy (R8; route test).
- Must not offer inputs for fine rates on the page (R10; web test).

## How

1. **Migration `041_checkout_opens_at.sql`:** add `checkout_opens_at time NOT NULL DEFAULT '14:00'` to `borrowing_policy_versions`. No data rewrite.
2. **Policy fields:** add `checkoutOpensAt` to `borrowing-policy.types.ts`, validation (HH:mm), repository insert/select, and the Librarian's Borrowing rules page.
3. **Checkout window:** in `borrowerEligibility` (`desk-circulation.policy.ts`), when `mode === 'TakeHome'` and Manila time is before `checkout_opens_at`, add the blocker "Checkout opens at 2:00 PM. You can read this book inside the library now." In-library and online modes are unaffected. The kiosk and borrow cart reuse this check.
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
8. **Borrowing policy maintenance (Librarian page):** on main the editor is archived. `/api/v1/admin/borrowing-policies` answers `410` from `borrowing-policy-archive.routes.ts`, and `/librarian/borrowing-policies` shows `BorrowingPoliciesArchivedPage`. The editor code (`borrowing-policy.routes.ts`, `.service.ts`, `AdminBorrowingPoliciesPage.tsx`) is still in the repo and already edits every agreed value except the checkout time. Reuse it rather than writing a second editor:
   - Mount `borrowingPolicyRouter` again for Librarian only (`library.manage`), as commit `cc27f2b9` did, and delete the archive route and page. Bring back that commit's tests: Librarian gets 200, other roles 403; the menu link; the confirm dialog's focus, Escape and errors.
   - Add a "Checkout opens at" time field (step 2) to the form, the confirm-changes list and the version history table.
   - Rename labels to match the rules: "Due cutoff" becomes "Due time (next open day)"; the loan period summary reads "Due 8:00 AM, 1 open day after borrowing".
   - Show the fixed rules as read-only text on the page: fines PHP 2 per open hour on the due date (max PHP 10), PHP 10 per open day after, cap PHP 500, students only; faculty pay no overdue fine but are blocked and Not Cleared. These are not editable here.
   - Each save publishes a new version with a change reason; past versions stay (the current versioning).
9. **Publish the values:** after deploy the Librarian publishes a new version on that page: student 2, faculty 5, borrowing days 1, due time 08:00, checkout opens 14:00. No live write from code.

## Build order

Each task: write the failing test, see it fail, then the smallest code that passes. One commit per task on `fix/borrowing-hours-faculty-rules`.

| Task | Requirements | Files | Tests first | Depends on |
| --- | --- | --- | --- | --- |
| T1 Migration | R1, R9 | `database/supabase/041_checkout_opens_at.sql` (`ALTER TABLE borrowing_policy_versions ADD COLUMN checkout_opens_at time NOT NULL DEFAULT '14:00'`, check 08:00–16:59); `.cursor/agent-protocol.md` tracker → next `042`; `apps/api/src/core/schema-readiness.ts` if it lists policy columns | Schema-readiness test if present | — |
| T2 Policy field | R9 | `borrowing-policy.types.ts`, `.validation.ts` (HH:mm, 08:00–16:59), `.repository.ts` (select, insert), `.service.ts` (label) | `borrowing-policy.service.test.ts`: 07:59 and 17:00 refused, 14:00 accepted, value round-trips | T1 |
| T3 Checkout window | R1 | `desk-circulation.policy.ts` (`borrowerEligibility`, `TakeHome` only) | New test: 13:59 refused, 14:00 allowed, `InLibrary` 10:00 and `Online` 10:00 allowed | T2 |
| T4 Due at 08:00 | R2 | `exact-loan-deadline.ts` (optional clock argument), `desk-circulation.policy.ts` (`policyDueDate` passes `due_time_cutoff`) | `exact-loan-deadline.test.ts`: Mon 14:30 → Tue 08:00, Sat 15:00 → Mon 08:00, closed Tue → Wed 08:00 | — |
| T5 Faculty fine skip | R4, R6 | `circulation-overdue.service.ts`, `circulation.service.ts` (two return paths); manual fine in `fines.service.ts` untouched | `circulation-overdue.service.test.ts`: Faculty no fine row, Student fine row; manual Faculty fine still works | — |
| T6 Faculty limit and clearance | R3, R5 | `clearance.service.ts` (list Faculty too); limit already read in `borrowerEligibility` | Faculty with 5 commitments refused; overdue Faculty listed Not Cleared | — |
| T7 Editor back on | R8 | `apps/api/src/app.js` (mount `borrowingPolicyRouter`), delete `borrowing-policy-archive.routes.ts`; `apps/web/src/App.tsx` route to `AdminBorrowingPoliciesPage`, delete `BorrowingPoliciesArchivedPage.tsx`; `PortalLayout.tsx` menu link (as `cc27f2b9`) | `borrowing-policy.routes.test.ts` roles; restore `AdminBorrowingPoliciesPage.test.tsx` from `cc27f2b9` | T2 |
| T8 Page field, labels, fine text | R9, R10, R11 | `AdminBorrowingPoliciesPage.tsx`, `features/borrowing-policies/types.ts` | Web test: "Checkout opens at" field sent on publish, new labels, fine text with no inputs | T7 |
| T9 Checks | all | — | `npm test`, `npm run typecheck`, `npm run build`; `plan-verifier`, `security-reviewer`, `database-reviewer` (migration) | T1–T8 |

T4, T5 and T6 do not depend on the migration and can be built in any order.

## Tests (write first)

- `exact-loan-deadline` / due-date: Mon 14:30 → Tue 08:00; Sat 15:00 → Mon 08:00; a closed Tuesday → Wed 08:00.
- `borrowerEligibility`: TakeHome at 13:59 blocked, 14:00 allowed; InLibrary at 10:00 allowed.
- Faculty limit: 6th commitment blocked with limit 5.
- Overdue job and return: Student overdue gets a fine row; Faculty overdue gets none but is still blocked from borrowing and shows Not Cleared.
- Policy validation: `checkoutOpensAt` must be HH:mm.
- Fine calculator: due 08:00, evaluated 13:00, 16:59, 23:00 and next day 08:00 all give PHP 10; evaluated 10:30 gives PHP 6; a closed day after the due date adds nothing.

## Risks and open points

- `fix/fair-fine-rates` and `fix/restore-borrowing-policies` were merged, then reverted on main by John (`c44d5bb3`, 2026-11-18). Steps 6 and 8 bring back parts of both; confirm with John why he reverted first.
- Loans already out keep their stored `due_at`; only new loans use 08:00.
- Web pages that say "due at the same time" or show the hour need their text checked.

## Implementation tracking

- [ ] Migration `041_checkout_opens_at.sql` (tracker: next unused becomes `042`)
- [ ] Policy type, validation, repository, Librarian page field
- [ ] Checkout 14:00 blocker
- [ ] Due date 08:00 next open day
- [ ] No automatic overdue fines for Faculty
- [x] Hourly fine only while open (restore fair-fine calculator)
- [ ] Faculty in clearance list
- [ ] Tests listed above
- [ ] `plan-verifier`, `security-reviewer`, `database-reviewer`
- [ ] Borrowing policy maintenance page restored for Librarian, with the checkout field, new labels and fixed-rule text
- [ ] Librarian publishes the new policy version after deploy

## Change log

- 2026-11-19: Plan created from the Librarian's new rules and Ethan's answers (checkout opens 14:00, due 08:00 next open day, faculty cap 5, faculty no overdue fines but blocked and Not Cleared, lost book still charged).
- 2026-11-19: Added step 6 (Ethan): the PHP 2 hourly fine is not charged while the library is closed (after 17:00, Sundays, closed days); restore the fair-fine calculator reverted in `c44d5bb3`.
- 2026-11-19: Step 6 narrowed to the calculator from `b8ab0889`; per-due-date rate selection and the Fine rules page are left out.
- 2026-11-19: Ethan approved building. Step 6 built on `fix/borrowing-hours-faculty-rules`: calculator ported from `b8ab0889`, its 10 tests plus an 8 AM due case, return note no longer names 8:59 AM. API 507 tests pass; typecheck passes. Steps 1–5, 7 and 8 not started.
- 2026-11-19: Added step 8 (Ethan): a Librarian borrowing policy maintenance page for the agreed rules, reusing the archived editor (`cc27f2b9`) plus the checkout field; old step 8 is now step 9.
- 2026-11-19: Wording (Ethan): "take-home" is called "checkout". Column `checkout_opens_at`, migration `041_checkout_opens_at.sql`, page field "Checkout opens at". The existing code mode `'TakeHome'` keeps its name.
- 2026-11-19: Added Spec (R1–R11, scope, edge cases, must-not) and Build order (T1–T9). Ethan: manual fines still allowed for Faculty; "Checkout opens at" limited to 08:00–16:59; fine rates read-only on the page. `/gsd-spec-phase` and `/gsd-plan-phase` could not run (no `.planning/ROADMAP.md`), so the same steps were done in this doc.
