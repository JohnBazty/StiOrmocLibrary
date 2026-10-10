# Complete Renewal Management Implementation Plan

## Why

STI ILMS can issue, monitor, and return loans, but it has no controlled way to extend an active loan. A librarian would currently have to change a due date outside a dedicated workflow, which would bypass consistent eligibility checks and leave no complete renewal history.

Renewal management will let a borrower request one additional operating day before the current due time. The API will make the final decision using the same versioned borrowing policy and circulation preflight rules used by checkout. Every approved or rejected request will remain auditable.

## Plan metadata

- **Date created:** 2026-10-10
- **Date last updated:** 2026-10-10
- **Status:** `planned` (approved; build starts on explicit command)
- **Active database:** Supabase PostgreSQL
- **Branch:** `feat/renewal-management`
- **Planned migration numbers:** Supabase `017` and MySQL rollback reference `047` after borrowing-policy consumes `016` / `046`
- **Depends on:** versioned borrowing policies (`codex/configurable-borrowing-policies`), structured circulation preflight (`feat/circulation-preflight` or policies branch), and reliable production background jobs
- **Build plan:** [Renewal Management Implementation Plan](renewal-management-implementation-plan.md)

## Objective

Deliver an end-to-end renewal workflow that:

- lets Students and Faculty request renewal from their borrowing history;
- lets authorized staff renew on behalf of a borrower;
- automatically approves or rejects the request from current policy and live operational data;
- extends the due date by the configured number of operating days;
- records the previous due date, new due date, policy, decision, requester, and decision source;
- updates due reminders without duplicating or suppressing notifications;
- prevents renewal from weakening reservation priority, fine rules, lost-book controls, or overdue processing.

## Locked behavioral decisions

### Default STI rule

- One approved renewal per loan.
- The request must be submitted before the current due time.
- The extension is one operating day from the current due date, not one day from the request time.
- The renewed due time remains the policy cutoff, currently 8:59 AM.
- Sundays, configured closed weekdays, holidays, and school closures are skipped.
- A waiting reservation for the same title blocks renewal.
- Outstanding monetary obligations block renewal.
- Research and thesis records remain view-only and cannot be renewed.

The new borrowing-policy module remains authoritative. These values are seeded to match the documented STI rule and are not duplicated as new hard-coded constants in the renewal service.

### Decision model

- A borrower request is decided immediately by the API.
- An eligible request is approved automatically and the due date changes in the same database transaction.
- An ineligible request is rejected with specific blocker codes and plain explanations.
- Admin and Librarian users may submit a renewal on behalf of a borrower, but the same blockers apply.
- Hard blockers cannot be bypassed through the renewal endpoint.
- The decision record identifies `System` for an automatic borrower request and `Staff` with the staff account for a staff-initiated request.

A general staff approval queue is deliberately excluded. The rules are deterministic, and adding a queue would delay routine eligible renewals without improving control. If the future policy engine introduces overridable renewal warnings, those warnings can use the existing preflight override mechanism with a required staff reason.

## Eligibility rules

The renewal decision service evaluates all rules again inside the final transaction.

### Block the request when

- the loan does not exist or does not belong to the authenticated borrower;
- the account is not Active;
- the transaction is Pending, Returned, Cancelled, or already Overdue;
- the current time is at or after `due_at`;
- the loan has reached the policy's maximum renewal count;
- the material, category, or collection is marked non-renewable by the effective borrowing policy;
- another borrower has a `pending`, `approved`, or `ready_for_pickup` reservation for the same title;
- an outstanding fine balance exists in `Accruing`, `Unpaid`, or `Partially Paid` state;
- an unpaid confirmed lost-book replacement charge exists;
- the loan has a pending or confirmed lost-book report;
- the physical copy or title is archived, lost, or otherwise blocked by circulation policy;
- no effective borrowing policy can be resolved;
- no next operating due date can be calculated safely.

Do not use `clearance_statuses.standing_status` by itself as the fine check. An active loan already makes a borrower Not Cleared, so using that summary would incorrectly block every renewal. Renewal must query the specific monetary and lost-book blockers that the policy defines.

### Inform the borrower when

- the request was approved;
- the request was rejected and which conditions must be resolved;
- the book's current due time and proposed or approved new due time;
- the borrower has no renewals remaining after approval.

## Process flow

1. The borrower selects **Request renewal** on an active loan.
2. The interface requests a renewal preflight and displays the current due date, proposed due date, remaining renewals, and any blockers.
3. The borrower confirms and sends a unique request key.
4. The API starts a transaction and locks the loan, borrower, effective policy, relevant reservation queue, and renewal history.
5. The API re-runs every eligibility check using current data.
6. If blocked, it appends a rejected renewal request and decision audit, commits the decision record, and returns the reasons without changing the loan.
7. If eligible, it calculates the next operating due date from the current due date.
8. The API appends the approved renewal request, updates the loan's current due date and renewal count, and creates the approval notification in the same transaction.
9. The borrowing history refreshes and shows the original due date, current due date, and renewal usage.
10. Later due-reminder and overdue jobs use the renewed due date and renewal sequence.

## Database changes

Use additive migrations only. If the borrowing-policy implementation already adds an equivalent field, reuse it instead of creating a duplicate.

### Extend `borrow_transactions`

- `initial_due_at`: the first confirmed due date; backfill from `due_at` for existing active and historical loans.
- `renewal_count`: non-negative count, default `0`.
- `circulation_policy_version_id`: reuse the field created by the borrowing-policy phase if present.

`due_at` remains the current enforceable deadline. `initial_due_at` and the renewal rows preserve how it changed.

### Add `loan_renewal_requests`

Store one immutable row for every approved or rejected request:

- renewal request ID;
- unique request key for idempotency;
- borrowing transaction ID;
- renewal number being requested;
- requester account and operational user;
- decision source: `System` or `Staff`;
- deciding staff account when applicable;
- status: `Approved` or `Rejected`;
- primary decision code and human-readable decision summary;
- previous due date and nullable new due date;
- effective circulation-policy version;
- requested, decided, and created timestamps.

Index by transaction/date, requester/date, status/date, and request key. Do not update or delete renewal rows during ordinary operations.

### Reuse `circulation_decision_events`

The preflight phase should already provide this append-only ledger. Record all blocker and alert codes there and link them to the renewal request. Do not create a second generic audit table.

### Notification compatibility

The existing worker deduplicates reminders by transaction. After renewal, that key would suppress the new 12-hour and 1-hour reminders if the original reminders were already generated. Change reminder keys to include the renewal sequence, for example:

`loan:<transactionId>:renewal:<renewalCount>:due-12h`

Keep prior delivered reminders as historical records. The renewal approval notification clearly states the replacement due date.

## API changes

### Borrower endpoints

- `GET /api/v1/borrowing/:transactionId/renewals/preflight`
  - Owner-only.
  - Returns current due date, proposed due date, effective policy, approved renewal count, remaining renewals, blockers, warnings, and alerts.
  - Informational only; final submission rechecks everything.

- `POST /api/v1/borrowing/:transactionId/renewals`
  - Owner-only.
  - Accepts a client-generated `requestKey`.
  - Returns the existing result when the same request key is retried.
  - Returns an Approved or Rejected decision with structured reasons.

### Staff endpoint

- `POST /api/v1/admin/borrowing/:transactionId/renewals`
  - Admin and Librarian only.
  - Accepts `requestKey` and a required staff note.
  - Uses the same decision service and blockers as the borrower endpoint.
  - Records the authenticated staff account as the decision actor.

### Existing response changes

Extend borrowing history and the Admin circulation monitor with:

- initial due date;
- current due date;
- renewal count;
- maximum renewals;
- remaining renewals;
- last renewal decision and date;
- whether the interface should offer a renewal action.

Do not expose another borrower's fine, reservation, or account details. Rejection responses provide safe explanations such as Ã¢ÂÂAnother borrower is waiting for this title,Ã¢ÂÂ not personal information.

## Service design

Add a focused renewal service under `apps/api/src/modules/circulation` and reuse existing repositories and policy components.

### Suggested internal responsibilities

- `renewal.validation.ts`: transaction ID, request key, and staff-note validation.
- `renewal.repository.ts`: row locking, current policy lookup, reservation/fine/loss checks, and immutable renewal insertion.
- `renewal.service.ts`: decision orchestration, due-date calculation, transaction, idempotency, and notification creation.
- `operating-calendar.ts`: generalize the current due-date helper to add a configured number of operating days while respecting weekly schedule and closed dates.

Keep checkout, return, and renewal under the same circulation module. Do not introduce a new service, message broker, dependency, or database.

## Concurrency and integrity

- Lock the borrowing transaction before checking its status and due date.
- Lock the applicable reservation rows for the title so a reservation cannot appear between eligibility checking and approval.
- Resolve and lock the effective policy version used for the decision.
- Count approved renewal rows and compare them with `renewal_count`; fail safely if legacy inconsistency is detected.
- Use one transaction for renewal record, due-date update, count update, audit event, and notification.
- Use the unique request key to make retries idempotent.
- Ensure renewal and overdue processing lock the same borrowing row. Whichever obtains the lock second must re-evaluate the current state.
- Never approve if the clock is at or beyond the locked loan's due time, even if a preflight response was previously eligible.

## Interface changes

### Student and Faculty borrowing history

- Show **Request renewal** only for a currently Borrowed item that has remaining renewal allowance.
- Open a confirmation dialog showing current due date, proposed due date, renewal usage, and decision messages.
- On approval, refresh the row without a full page reload and display the new due date.
- On rejection, keep the current due date visible and show each actionable reason.
- Display Ã¢ÂÂRenewed 1 of 1Ã¢ÂÂ and make the renewal history available from the loan details.

### Admin circulation monitor

- Add **Renew on behalf** for eligible active loans.
- Require a short staff note.
- Show whether the last renewal was system-decided or staff-initiated.
- Do not display an override control for hard blockers.

Use the existing responsive record and dialog patterns. No new design system is needed.

## Delivery slices

### Slice 1 - Contract and migration

- Confirm the borrowing-policy and preflight contracts are built.
- Finalize blocker codes and safe messages.
- Add and test the additive Postgres and MySQL rollback migrations.
- Backfill `initial_due_at` and `renewal_count` without changing current deadlines.

### Slice 2 - Decision and transaction service

- Implement the operating-day extension helper.
- Implement live eligibility checks and structured decisions.
- Implement idempotent approved and rejected renewal transactions.
- Update notification deduplication to include renewal count.

### Slice 3 - API and authorization

- Add borrower preflight and submission routes.
- Add the staff-on-behalf route.
- Extend borrowing-history and circulation-monitor responses.
- Add safe error and decision responses.

### Slice 4 - Web experience

- Add the borrower renewal dialog and refreshed history state.
- Add the staff action and note dialog.
- Add renewal status, original/current due dates, and history details.

### Slice 5 - Verification and rollout

- Run all automated tests, type checking, and builds.
- Apply the Postgres migration to a test environment.
- Exercise approved, rejected, retry, concurrency, and notification cases with disposable records.
- Deploy API before exposing the web action.
- Verify production writes and remove the disposable test records.
- Update API reference, schema context, migration trackers, and this plan's status.

## Test plan

### Decision tests

- Eligible Student request is approved for exactly one operating day.
- Eligible Faculty request follows the effective Faculty policy.
- Request on the due-time boundary is rejected.
- Overdue, returned, cancelled, pending, lost, and archived cases are rejected.
- Waiting reservation blocks renewal.
- Outstanding fine and unpaid confirmed lost charge block renewal.
- The borrower's active loan alone does not count as a monetary clearance block.
- Non-renewable material/category policy blocks renewal.
- Maximum renewal count blocks a second approval.
- Sunday, closed weekday, holiday, and multi-day closure roll forward correctly.

### Transaction and concurrency tests

- Same request key returns the original result without changing the due date twice.
- Two simultaneous request keys produce at most one approval when only one renewal is allowed.
- Reservation creation racing renewal cannot allow both invalid outcomes.
- Overdue processing racing renewal respects the loan-row lock and current time.
- A failure while writing the audit or notification rolls back the due-date change.

### Authorization and privacy tests

- A borrower cannot renew another user's loan.
- Student and Faculty roles cannot use the staff endpoint.
- Librarian and Admin actions record the correct actor and note.
- Responses never reveal the identity of a waiting borrower.

### Interface tests

- Eligible rows show the action; ineligible and completed rows do not.
- Dialog dates and decision reasons are readable on desktop and mobile layouts.
- Approval updates the due date and renewal count without a page reload.
- Retry after a lost network response does not renew twice.
- Keyboard focus, loading, success, and error states are accessible.

### Hosted acceptance

- Approve one disposable loan renewal on the deployed application.
- Verify the old and new due dates, policy version, renewal row, audit decision, and notification.
- Confirm the new reminder dedupe key uses the renewal sequence.
- Attempt a second renewal and verify rejection.
- Repeat the first request key and verify idempotency.
- Return the book and remove all disposable records that can be safely removed.

## Completion criteria

The feature is complete only when:

- borrower and staff renewal paths use the same policy and decision service;
- eligible requests update the deadline exactly once;
- rejected attempts are recorded without changing the loan;
- reservation, fine, lost-book, account, material, and renewal-limit blockers work;
- every decision records its policy version and actor source;
- due reminders follow the renewed deadline without deduplication errors;
- automated tests, type checking, build, migration verification, and hosted browser acceptance pass;
- documentation and migration trackers are current.

## Risks and controls

- **Stale preflight:** always re-evaluate inside the final locked transaction.
- **Reminder suppression:** include renewal count in due-reminder dedupe keys.
- **Incorrect clearance blocking:** query monetary and lost-book obligations directly instead of using overall clearance status.
- **Double renewal:** combine loan-row locking, approved-count validation, and request-key uniqueness.
- **Policy drift:** store the exact policy version used for each decision.
- **Calendar errors:** generalize one tested operating-calendar function and use it for checkout and renewal.

## Out of scope

- Email or SMS delivery.
- Staff bypass of hard blockers.
- Renewal of research/thesis records.
- Multi-branch renewals or interlibrary loans.
- A separate mobile implementation; the REST contract will support a future mobile client.
- Changing fine rates, payment behavior, or reservation priority rules.

## Implementation tracking

- [x] Current circulation routes, loan schema, fine blockers, clearance behavior, due-date helper, and borrowing-history interface reviewed.
- [x] Renewal behavior and dependencies defined.
- [x] Schema, API, interface, concurrency, notification, test, and rollout plan drafted.
- [x] Plan approved by Ethan.
- [x] Build-ready implementation plan published (`docs/renewal-management-implementation-plan.md`).
- [ ] Status changed to `inprogress` before implementation begins.
- [ ] Postgres and MySQL rollback migration numbers confirmed at build time (`017` / `047` after policies merge).
- [ ] Implementation completed and hosted acceptance passed.
- [ ] Status changed to `built` and change log updated.

## Change log

- **2026-10-10:** Initial plan created with status `planned`. Chose immediate API decisions, shared policy/preflight enforcement, immutable approved and rejected request records, operating-day extension from the current deadline, and renewal-aware notification deduplication.
- **2026-10-10:** Ethan approved. Added branch `feat/renewal-management`, locked migrations to Supabase `017` / MySQL `047` after policies consume `016` / `046`, and linked the build-ready implementation plan.
