# Fines maintenance

- Date created: 2026-11-18
- Date last updated: 2026-11-18
- Status: built (2026-11-18, branch `feat/fines-maintenance`; migration `038` applied 2026-11-18)

## Why
Librarians cannot change the overdue fine rules without a code or database change. Ethan wants a Librarian page where the fine rules can be viewed and changed.

## What exists today
- **Overdue rates and cap** are already stored as versions in `fine_policy_versions` (`hourly_rate`, `daily_rate`, `maximum_penalty`, `effective_from`, `effective_until`, `is_active`, `created_by_user_id`). The table has been live since `001`, and its seed row is 2 / 10 / 500 from 2026-01-01. Nothing writes to it, and no screen shows it.
- `apps/api/src/modules/fines/fine-calculator.ts`: `loadFineContext` reads the newest active version that overlaps the period, and falls back to the in-code `DEFAULT_POLICY` (2 / 10 / 500). `calculateOperatingFine` charges the hourly rate for lateness on the due date and the daily rate for each later operating day (`library_operating_schedule` and `library_closed_days`), then caps the total.
- The fine is calculated in three places: the overdue job (`circulation-overdue.service.ts`, which recalculates every `Accruing` fine on each run), return (`circulation.service.ts:640`) and `calculatePenalty` (`circulation.service.ts:659`). Fines that are already `Paid`, `Waived` or `Voided` keep their status.
- **Lost books** are charged at the book's price (`lost_book_reports.purchase_price_snapshot`, or the confirmed quotation in `clearance.service.ts`). This follows the standing decision, and no flat fee exists.
- **Damage** goes through circulation cases and quotations (`017_circulation_cases.sql`). No damage fee is set in code.
- Manual infraction fines take the amount the staff member enters (`fines.service.ts:312`).

## Scope
Editable: **hourly rate**, **daily rate** and **maximum penalty (cap)**.
Not editable here: the lost-book charge (stays at the book's price), damage charges (stay case and quotation based), and the operating calendar (it has its own tables).

## How
Versioned rules, the same pattern as borrowing policies (`borrowing-policy.service.ts`, migration 016), reusing the existing `fine_policy_versions` table. A change publishes a new version; it never edits the old one. History therefore shows who changed what, when and why.

### Migration `038_fine_policy_maintenance.sql` (next number in the tracker; `039` is reserved for the mobile refresh token)
- Add `change_reason TEXT` (10 to 500 characters when set; the seed row stays NULL).
- Add CHECK constraints: rates of 0 or more, cap above 0, `hourly_rate <= daily_rate <= maximum_penalty`, and `effective_until` later than `effective_from`.
- Make sure row-level security is enabled with no public policies, like earlier tables. The API connects as the owner role.
- Additive only. Existing rows are untouched.

### API (`apps/api/src/modules/fines/fine-policy.*`)
- `GET /api/v1/admin/fine-policies`: the current version, any scheduled version, and the history (newest first, up to 50).
- `POST /api/v1/admin/fine-policies`: body `{ hourlyRate, dailyRate, maximumPenalty, effectiveOn, changeReason }` (`effectiveOn` is a Manila date; today means from the moment of saving, a later date means from Manila midnight). Validation returns 422 with field errors. Amounts have at most 2 decimals and `effectiveOn` must be today to 365 days ahead. It must also fall after the latest saved version, or the request gets 409.
- Publishing runs in one transaction under `pg_advisory_xact_lock`: it closes the open version (`effective_until = effectiveFrom`), inserts the new one with `created_by_user_id` and `change_reason`, and writes an `admin_notifications` audit row. Two Librarians publishing at once are serialised, so versions never overlap.
- The router is mounted in `apps/api/src/app.js` behind `authenticate` and `requireLibraryPermission('library.manage')` (Librarian only). Staff and Students get 403, and anonymous requests get 401.

### Web
- `apps/web/src/features/fines/AdminFinePoliciesPage.tsx` at `/librarian/fine-policies`. It shows the current rules in plain words ("PHP 2 per hour on the due date, PHP 10 per library day after, at most PHP 500"), a scheduled version if there is one, and a history table.
- A "Change fine rules" button opens an accessible dialog, copied from `AdminBorrowingPoliciesPage`: focus trap, Escape and Cancel, a review step that resets after an edit, and server errors shown on their fields.
- A Librarian menu entry "Fine rules" goes in `PortalLayout.tsx`, next to "Fines".

### How existing fines are treated when a rule changes (decision for Ethan)
- `Paid`, `Waived`, `Voided` and finalised `Unpaid` fines never change. Their amounts are already stored.
- **Recommended:** an `Accruing` fine keeps the rule in force on its loan's **due date** for the whole fine. A rule change then affects only loans that fall due after it, and nobody's running fine jumps overnight. This changes `loadFineContext` to choose the version effective at the due date, and the overdue job to choose a version per loan.
- Alternative: keep today's behaviour, where the newest rule reprices every `Accruing` fine on the next job run (about a minute later). This needs no calculator change, but a rate increase raises fines that are already running.

### Cap ceiling (decision for Ethan)
- **Recommended:** the page allows a cap of up to PHP 500, the standing decision. A higher cap needs a code change and Ethan's approval.
- Alternative: any cap above 0.

## Tests (written first)
- API (`node --test`): validation (bad numbers, ordering, past date, reason length); routes (401 / 403 / 200 / 422, using supertest like `borrowing-policy.routes.test.ts`); publishing closes the old version and inserts the new one in one transaction; the calculator picks the version by due date.
- Web (Vitest): the page shows the current rules and history, the dialog's review and submit flow, field errors, Escape closes, and the menu entry is shown to Librarians only.

## Implementation tracking
- [x] Ethan approves this plan (accruing-fine rule, cap ceiling): approved 2026-11-18 with both recommended choices
- [x] Branch `feat/fines-maintenance` from `main`
- [x] Migration `038_fine_policy_maintenance.sql` and tracker updates (`.cursor/agent-protocol.md`, `docs/schema-context.md`)
- [x] API validation, service and routes, plus a calculator change if the due-date rule is approved, tests first
- [x] Web page, API client, route and menu entry, tests first
- [x] `npm run typecheck`, `npm test` (478 API, 318 web), `npm run build`
- [x] `security-reviewer` and `database-reviewer`; fix CRITICAL to MEDIUM
- [x] Commit; ask Ethan before push or draft PR (JohnBazty reviews)

## Deployment
- Apply `038` before deploying this branch, because publishing writes `change_reason`. First run a read-only check that every existing row meets the new CHECKs (`hourly_rate <= daily_rate <= maximum_penalty`, `maximum_penalty > 0`, `effective_until > effective_from`). Then run `npm run db:supabase -w @sti-library/api -- 038_fine_policy_maintenance.sql`.
- No new environment variables.

## Database boundary
**Applied 2026-11-18.** Text below is the original plan.
One additive migration, `038`. It is not applied to the live database without Ethan's go-ahead. Until it is applied, the live calculator keeps working, because the new columns are only read by the new page.

## Change log
- 2026-11-18: Plan drafted after reading the fines, circulation and job code and the migrations.
- 2026-11-18: On Ethan's go-ahead, applied `038` to the live database. The read-only check first found one row (the 2 / 10 / 500 seed), which passed every check. Verified afterwards: `change_reason` and the three checks exist, RLS is on, and anon and authenticated have no table or sequence access.
- 2026-11-18: Reviews: no CRITICAL. Fixed the HIGH notification overflow (body sliced to 500), the far-future start date (365-day limit), `loadFineContext` now returns only `policyFor`, review with no saved rule, constraint lookup scoped to the table, and sequence grants revoked. LOW fixes: dialog Tab trap, focus on first invalid field, rollback keeps the original error. Accepted gaps: no 401 test for this route (covered by the global `/api/v1` guard tests), and scheduled versions cannot be cancelled.
- 2026-11-18: Ethan approved with the due-date rule and the PHP 500 cap ceiling. A new version must start after the latest saved one (409 otherwise); a change made for today starts at the moment it is saved. Scheduled versions cannot be cancelled from the page yet.

## Application rollback — November 18, 2026

The owner requested undoing merge d3e5fe3. Its application changes are reverted; see [rollback record](plans/2026-11-18-undo-fines-merge.md). Applied database migrations and this historical record are preserved.
