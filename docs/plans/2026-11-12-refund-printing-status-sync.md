# Refund actions and printing queue status synchronization

**Why:** The Admin payment card still offers Refund payment during an existing refund, and the printing queue reads original school rows without the confirmed local payment/refund view.
**Date created:** 2026-11-12
**Date last updated:** 2026-11-12
**Status:** built

## Printing refund cutoff — owner confirmation, November 12

Printing refunds are allowed only before the job first enters Printing. Existing
API guards check both current state and immutable printing history at review and
confirmation; later cancellation cannot reset eligibility. Status changes and
refund reviews share the existing local payment lock. The payment-card decoration
now also exposes this eligibility, and the Refund payment button is hidden when
printing has begun. Visible Admin payment pages recheck eligible printing payments
so Start printing in another view removes the action automatically. A stale/direct
refund submission remains rejected by the API. No printing/refund was executed on
real jobs during verification, and no migration or hosting was performed.

Cutoff verification: tests first reproduced the missing payment-card eligibility
and still-visible button. The API now reads current job state and printing history
for printing payment eligibility; unrelated database failures propagate instead of
being misreported as permission to refund. Tests cover pre-print availability,
post-print rejection, cancellation after prior printing, hidden buttons after a
refresh and an already-open form becoming blocked. Full coverage suites passed
**556 API + 370 web = 926 tests**, plus typecheck/build and final dialog/web checks.
Overall coverage remains below 80% (API 72.05% lines, web 65.07% lines).
The local launcher was restarted with this cutoff. No new browser visual acceptance,
real job transition, provider refund, school record write, push or deployment.

## Approved scope and implementation

The owner requires every action to update its status, totals and available actions automatically. Hide Refund payment for reserved/processing/review and fully refunded payments. Show the actual refund lifecycle on the payment card and open dialog. Keep partial refund support only after the earlier request finishes and refundable principal remains. Preserve the original payment and independent refund history.

Use the existing bounded refund reconciliation and visible-page refresh. Keep failed reads visible with an error; prevent stale requests replacing newer filters. Emit an existing-style local update event after financial actions so open printing/payment views refresh too. No scheduler, provider transaction, hosted write, migration, push or deployment is authorized.

Project local printing credits and refund holds onto the Admin queue before filtering, counting, sorting and pagination. Apply the same view to summary cards. Pending refunds block cash/printing actions; confirmed refund cancellation shows Refunded/Cancelled. Keep first-submitted active jobs first, using created time and request ID for stable ties. Completed/cancelled history follows active work. Do not rewrite school records to achieve a local view.

## Tracking

- [x] Failing regressions for refund actions/status and printing projection/filter/order.
- [x] Repair payment actions, status synchronization and open refund dialog.
- [x] Repair Admin printing projection, totals, actions, refresh and FIFO ordering.
- [x] Save the owner's status-refresh rule in repository guidance.
- [x] Run tests/typecheck/build/coverage and record visual evidence or limits.

## Implementation and verification

Local branch `codex/payment-local-integration`; all previous uncommitted work retained.
No commit/push/deployment, dependencies, scheduler or migration changes. The ordinary
local launcher was restarted and health returned 200. The API still reads the school
database; no school payment, print job, receipt, account or history row was changed.

Payment status now prioritizes Refund review / Refund processing / Refund needs
review, then Refunded / Partially refunded. Pending reservations and zero refundable
principal remove Refund payment. Unpaid-remainder void actions also disappear while
a refund is reserved. Refund creation/confirmation/cancellation refreshes the parent
and related open views through one update event. Admin payment cards reconcile pending
refunds and poll while visible; the selected refund dialog follows refreshed results.
Failed reads retain the last records with a readable error. Failed/cancelled/reversed
refund results have distinct messages instead of being described as processing.

The Admin printing projection comes from the same local attempts and net-refund
credits. It is applied in SQL before filtering/counting/pagination, joins both
request and owner, and feeds the summary too. Pending refunds show Refund pending
and suppress cash/start/cancel actions. Confirmed refunded jobs show Refunded and
Cancelled, remove active/unpaid counts and retain history. Active jobs use oldest
created_at first with request_id as tie-breaker; finished/cancelled history follows.
Queue and invoice labels/PDFs agree. Neither pending nor refunded invoices request
another payment. Printing refreshes after its own actions, financial-update events,
focus and at ten-second visible-page intervals. Old filter responses cannot replace
new ones. Shared provider recovery remains bounded in the existing money-out service.

Tests were observed failing before the UI, paid-print precedence and SQL-order fixes.
The full suites/coverage passed **552 API + 368 web = 920 tests**. Typecheck and build
passed. Final focused refund/printing tests and web typecheck passed after the final
copy/refresh adjustments. Overall coverage remains below 80%: API 72.00% lines and
web 65.00% lines; this work does not claim broader coverage.

Real-SQL acceptance uses disposable PGlite tables, proving projected refund filters,
counts, paging, FIFO order, pending flags, summary totals and borrower isolation.
Other tests cover hidden actions for all pending/full refund states, partial refund
eligibility, automatic pending-to-completed refresh, error-state preservation, open
dialog updates and invoices. Existing provider/security/counter tests also pass.

A check against the existing local configuration reconciled two saved money-out
requests using provider GET status checks only, then verified payment action fields,
Admin queue/summary queries, oldest-active ordering and Refunded/Cancelled jobs.
No new provider request or financial transaction was created. Existing local results
were saved through the usual ledger recovery path. Safe logs remain in ignored
`output/refund-*.log`.

Browser access returned unavailable for this chat before opening the screen. No new
desktop/mobile screenshot or physical-device check is claimed. Automated UI tests,
compiled components and actual API/SQL reads are verified; visual acceptance remains
a stated limit. The owner rule is saved in `agent.md` under Design for people with
no technical background, which the repository entrypoints already require agents to read.

## Database boundary

No schema changes. Applied migration 036 and next unused 042 unchanged. Parameterized Postgres queries only; existing local ledgers are retained.

## Change log

2026-11-12 — Owner reported a still-visible refund button during Processing and stale printing states; requested first-submitted-first queue order. Implementation authorized locally.

2026-11-12 — Built and verified synchronized refund actions and printing views;
recorded automated/SQL acceptance, runtime checks and the unavailable-browser limit.
