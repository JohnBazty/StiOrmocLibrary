# Refunds, library withdrawals and voids — implementation plan

| Field | Value |
| --- | --- |
| Why | Let authorized library administrators return payments or transfer library collections without losing financial history or producing inconsistent bills and clearance |
| Date created | 2026-11-12 |
| Date last updated | 2026-11-12 |
| Status | `inprogress` |
| Goal | Add understandable refund/withdrawal workflows and precise cancellation/void behavior |
| Architecture | Existing React portal, Express modular monolith, Postgres-only repositories and the single durable 019 job runner |
| Scope | Owner authorized local implementation; no real-money execution, hosted migrations, push or deployment |

## Approved decisions

- Only the combined Librarian/Admin role can issue refunds or withdraw library funds.
  Students/Faculty can see their own refund history; Staff cannot execute money-out.
- On a fine refund, Admin explicitly selects **Restore unpaid fine** or **Cancel
  incorrect charge**. A refund is not an automatic waiver.
- Return the payment amount **and the transaction fee paid by the student**.
  This means the original user-paid fee, not an assumption that Xendit returns
  its own merchant processing costs.
- Library withdrawals go only to an **approved school bank account**. No GCash
  or personal destination is permitted for withdrawing library collections.
- QRPh refunds use an **Admin-initiated separate transfer linked to the original
  payment**. Verify the student recipient and track final provider confirmation.
  This is a refund-purpose transfer, not a withdrawal of collections to a student.
- Partial refunds return the **matching proportional share of the original
  student-paid fee**. Round cumulatively in centavos; the final refund returns
  any remaining fee rounding difference, without exceeding the original fee.
- Printing refunds are allowed **only before printing starts**. Once the job
  enters Printing or any later production/pickup state, refuse the refund.
  There is no exception for completed printing under this plan.
- Keep normal product wording: Payment, Refund, Withdrawal, Cancel checkout and
  Void charge. Do not label a completed refund as a void or erase its original payment.
- First implement with development credentials and the existing local payment
  model. Real funds and school financial writes require a separate release decision.
- Keep the school database attached to the ordinary local application. Never
  substitute a separate demonstration database for the normal localhost app.

## Decision status

All policy questions raised in this planning conversation are answered. The
owner authorized local implementation. Account-specific
provider permissions, approved school bank details and verified student refund
destinations are setup prerequisites; do not invent them or request credentials
in this document.

## Words and current implementation

| Action | Meaning | Current code status |
| --- | --- | --- |
| Cancel checkout | Stop an unpaid/incomplete payment session | Implemented; provider state is checked and a completed payment must remain successful |
| Void charge | Remove an incorrectly assessed unpaid fine, with a reason | Existing fine-adjustment action; preserves history and is blocked for already settled fines |
| Waive charge | Forgive an otherwise valid unpaid fine | Existing fine-adjustment action; distinct from collecting or returning money |
| Reverse cash record | Correct an existing counter-payment entry | Existing fine-receipt reversal; not a bank/wallet refund and cannot reverse Xendit receipts |
| Refund payment | Return some/all of an already collected payment | Implemented locally; actual disposable native refund confirmed, QRPh transfer awaits recipient/fee setup |
| Withdraw collections | Move library-owned funds to an approved library destination | Implemented locally with school-bank/fee setup gates; external payout acceptance remains pending |
| Void card authorization | Release an uncaptured card hold | Not part of current automatic-capture GCash/QRPh flow; do not add a misleading button |

This inventory is a code review, not a claim that every administrative path has
been exercised against live accounts. Existing automatic capture, role checks,
counter guards and receipts must continue to work.

## Provider capabilities checked November 12, 2026

- GCash documents full and partial refunds; request eligibility still depends on
  the particular payment, account and provider limits. [GCash](https://docs.xendit.co/docs/gcash)
- QRPh documents no native full or partial refund support. Use the separately
  approved fallback and identify it as a refund transfer rather than
  claiming that Xendit reversed the QR transaction. [QRPh](https://docs.xendit.co/docs/qrph)
- Refund creation uses a captured `payment_id`. A pending response is not proof
  money was returned. Reconcile final results from the authenticated callback or
  server lookup. [Create refund](https://docs.xendit.co/apidocs/create-a-refund)
- Cancelling an ACTIVE session invalidates its hosted checkout. A payment that
  completes during cancellation must be handled as paid, with refund review if
  appropriate. [Cancel session](https://docs.xendit.co/apidocs/cancel-session)
- A card authorization void applies to AUTHORIZED, uncaptured payments. It is
  different from refunding a captured payment. [Cancel payment](https://docs.xendit.co/apidocs/cancel-payment)
- Payouts require Money-out permission. The current payment key must not be
  assumed to have that permission. The documented V3 payout API uses minor
  currency units and an idempotency key; refund/payment APIs have their own
  amount contracts. [Create payout](https://docs.xendit.co/apidocs/create-payout-v3)
- Provider virtual balances cannot be withdrawn as real funds. Payout success,
  failure and duplicate handling can be simulated separately.
  [Withdrawal explanation](https://help.xendit.co/hc/en-us/articles/360038677872-How-to-withdraw-balance-in-test-development-mode),
  [Payout scenarios](https://docs.xendit.co/docs/test-scenarios-payouts).

## Phase 1 — policies and state rules

Apply the approved decisions above, and verify account-specific refund/payout
eligibility through read-only provider checks. Define a capability matrix for
each payment channel; unsupported actions have a readable explanation.

Define three independent records rather than overwriting payment state:

- Original payment: remains successful after a refund, with a derived badge
  **Partially refunded** or **Refunded**.
- Refund: Draft, Processing, Refunded, Failed or Needs review. Declined/cancelled
  drafts remain in audit history. Money returned is recognized only after confirmation.
- Withdrawal: Draft, Processing, Completed, Failed, Reversed or Needs review.
  Preserve provider-specific states as evidence behind readable product labels.

An incorrect unpaid fine can become Voided and stop blocking clearance without
any money being sent. An already paid fine needs a refund workflow and a
separate charge decision. A partially paid fine can void only its remaining
charge; earlier money remains paid until refunded. Every void/waiver/refund needs
an understandable reason and an immutable actor/time record.

Acceptance: Admin and borrower examples agree for unpaid cancellation, full/
partial refund, charge restoration, charge cancellation, and withdrawal.

## Phase 2 — secure records and provider access

Extend the existing payments module with refund and payout services/repositories,
using the current gateway client patterns, role/permission middleware, CSRF,
rate limits, server validation and exact centavo math. Keep separate feature
flags for refunds and withdrawals. Keep development credentials server-only;
Money-out permission changes require explicit authorization at setup time.

For local-only operation, extend the ignored payment ledger with durable refund
and payout intents, events and references. Derive net local bill credits from
confirmed principal minus confirmed principal refunds. Never edit the school
receipt/clearance tables to make a simulated refund appear real.

Prepare additive Postgres migration(s) only when building the durable production
path. Proposed entities: refund intents/events, money-out transfers/events and
approved beneficiaries. Include unique request/provider references, pending
amount reservations and append-only evidence. Keep references to existing
payment/receipt/allocation records; do not replace the ledger or edit applied SQL.

Before each submission, persist intent, amount, destination snapshot and retry
key. Lock/reserve the refundable/withdrawable amount against competing actions.
Unknown provider outcomes remain Needs review and keep their reservation. Do
not blindly resubmit or fall back to cash after a timeout. Use the existing
durable runner for bounded recovery; never create another scheduler.

Acceptance: students/Staff are rejected, another user's records stay private,
duplicate requests cannot move money twice, and a restart preserves uncertain work.

## Phase 3 — cancellation, void and correction behavior

Use action names based on the record's state:

- Unpaid checkout: **Cancel checkout**, then wait for verified cancellation.
- Incorrect unpaid fine: **Void charge**; no payment/receipt is generated.
- Valid fine forgiven: **Waive charge**.
- Successful online payment: **Refund payment**, never Cancel or Reverse cash.
- Incorrect cash entry: retain its documented **Reverse payment record** flow.
  Recording a cash refund must additionally confirm the money was physically
  returned; reversing a record alone is not proof of that handover.

If payment succeeds while cancellation/void is being attempted, preserve the
successful capture and switch to review/refund, rather than showing Cancelled.
Keep original references visible and update linked totals once. Void/waive
adjustments and pending refunds must not permit competing payment operations.

Acceptance: no completed payment can be erased or incorrectly marked cancelled;
paid/voided/waived statuses and amounts remain internally consistent.

## Phase 4 — student refunds

Admin opens an existing transaction and selects **Refund payment**. The system
automatically loads payer, service, original method, principal, student-paid fee,
earlier refunds and maximum refundable amount. Admin selects full/partial,
reason, and the charge decision, then reviews one confirmation screen.

Show separately: principal returned, student-paid fee returned, total returned,
remaining refundable amount, and what will happen to the student's bill.
For example, a PHP 190 principal plus PHP 2.90 user fee gives a full customer
refund of PHP 192.90 when eligible. Xendit's merchant costs are separately
recorded; never assume a provider cost refund.

Only native supported refunds return through the original payment method. If
the channel is QRPh, use the approved separate transfer: verify the recipient and record a
refund-purpose payout linked to the original payment. It must not also trigger
a native refund or a cash return. This plan does not authorize substituting a
cash return for the selected QRPh transfer workflow.

When refund succeeds:

- **Restore unpaid fine:** remove only the refunded principal from applied
  payments; restore that amount to the remaining bill and recalculate clearance.
- **Cancel incorrect charge:** separately cancel/waive the relevant charge with
  its reason, so the refund does not create an accidental new debt.
- Printing: permit the refund only if production has never started. Lock the
  job and check its status/history against a competing staff Start printing
  action. Reserve the job against starting while the refund is pending. A
  cancelled job that previously entered Printing remains ineligible. Do not
  erase paper/ink usage or call a printed job unprinted. Define the final job
  cancellation alongside the refund before confirmation; on failed refund,
  release the reservation only after its failure is verified.
- A refund of a duplicate/excess payment that was never applied to a bill must
  not reopen that bill. Track applied and unapplied principal explicitly.
- A pending/failed refund must not remove confirmed payment credits or promise
  that the student has already received money.

Update Transactions, the payment details, Fines, Printing and Clearance from
one confirmed result. Preserve original payment records and add a separate
refund confirmation. Notify the owner within the app, without exposing other
borrowers or sensitive provider data.

Acceptance: full/partial refunds, cumulative cap including pending refunds,
failure/retry, fees, original-method support, QR fallback and charge choices
all produce correct records and balances.

## Phase 5 — withdraw library collections

Add an Admin-only **Library funds** area with available provider balance,
pending withdrawals/refund reservations, approved destination and transfer
history. Never infer withdrawable funds from total student payments or confuse
revenue, provider fees and settled provider balance.

Admin selects an approved school bank account, amount and purpose. Automatically
show the masked account, recipient name, fees and total balance deduction before
the final confirmation. Arbitrary new recipients and beneficiary changes need
their own authorized setup; do not let any student choose a payout destination.

Submit one saved intent to the applicable Xendit Payout API and track its final
state. Use exact integer minor units where required by that API. A failed payout
releases its local reservation only after failure is confirmed. A reversal is a
new event restoring funds; do not delete the original withdrawal.

Library withdrawals never change student fine balances, payment status,
clearance or printing job state. Refund-purpose transfers and withdrawals use
different purpose records, even if the underlying provider endpoint is shared.

Acceptance: insufficient balance, invalid recipient, account restrictions,
duplicate submit, provider outage and reversed transfer are handled without
double payment or overstating available funds.

## Phase 6 — reports, UI verification and release checks

Use the existing modern payment design and concise workflows. Give Admin
state-dependent actions and readable failure/recovery messages; borrowers see
only their own transactions/refunds. Preserve a full timeline of payment,
void/waiver, refund and related transfer events.

Reports separate gross collections, applied principal, user fees, refunded
principal, refunded user fees, provider costs, withdrawals and remaining funds.
Refund transfers cannot count twice as both a refund expense and an unrelated
withdrawal. Withdrawals are cash movement, not a second revenue deduction.

Verify:

- Correct balances and clearance after each charge decision and partial refund.
- Cancelling an unpaid checkout versus a captured-payment/cancellation race.
- Duplicate clicks/callbacks, stale screens and two simultaneous Admin actions.
- Wrong role, wrong owner, missing CSRF, tampered amount/destination, invalid
  callbacks and secret-free logs.
- Pending/failed refunds and payouts, timeout recovery, restart and late reversal.
- Native GCash and approved QRPh fallback behavior using provider development
  facilities; clearly distinguish mocked evidence from actual provider checks.
- Cash reversal, cash handover, physical printing and existing receipts/reports.
- Desktop/mobile, keyboard access, focus, large touch targets and error/empty states.
- `npm test`, `npm run typecheck` and `npm run build`, plus meaningful isolated
  database/provider checks. Record unverified browser/device/provider limits.

No live-money activation, hosted migrations, GitHub push or deployment follows
automatically from completing local checks.

## Implementation touchpoints

- Existing `apps/api/src/modules/payments/`: gateway/client, operations,
  validation, routes and local preview accounting. New refund/payout files stay
  within this module rather than introducing another backend.
- `apps/api/src/modules/fines/`, `printing/`, `clearance/`: refund allocation,
  explicit charge decision and derived local/official views.
- `apps/api/src/modules/job-runner/`: bounded recovery in the existing runner.
- `apps/web/src/features/payments/`: Admin actions, refund detail, Library funds
  and borrower transaction timeline; reuse the current payment styles.
- `database/supabase/`: additive migrations only after the current branch and
  live applied ledger are reconciled. Current latest applied is 036; 033–035
  and payment 038–041 remain pending. Next unused is 042, not reserved here.

## Eight integration rules retained

1. Before implementation/integration, inspect local changes and fetch/merge the
   current main branch without discarding the owner's work.
2. Keep every feature in Postgres-only form; no runtime MySQL branches/queries.
3. Preserve main's deletion of retired MySQL files.
4. Match already-applied migration filenames and checksums to the live ledger;
   introduce a new migration for differences instead of editing history.
5. Reconcile pending migration numbering against current main and the live
   database. Do not blindly reuse the original conflict-era numbers.
6. Preserve useful documentation from both branches and update the live tracker.
7. Follow the requested main-lockfile/dependency reconciliation at integration;
   do not reintroduce mysql2 or change dependencies merely to write this plan.
8. Run tests/typecheck/build and appropriate source searches before a future PR.
   Push/PR/merge/deployment still require the user's current authorization.

Use the selected single durable 019 job runner throughout.

## Implementation tracking

- [x] Resolve owner policy and destination-type decisions.
- [x] Verify development Money-in access. Owner approved/completed Money-out Write and Balance Read setup in Xendit using their authenticator.
- [x] Build local durable refund/payout intents, immutable request details, masked destinations and event history.
- [x] Preserve successful payments; add unpaid-remainder voids, counter guards and printing/refund exclusion.
- [x] Build native refunds and linked QRPh transfer code. Actual disposable GCash refund completed.
- [x] Build Admin Library funds, approved-school-bank setup, withdrawal review, fee setup, recovery and CSV export.
- [x] Verify accounting, access restrictions, duplicate handling, fee rounding and responsive refund UI; automated gates pass.
- [ ] Enter the actual approved school bank and verified student refund destinations; no real destinations were invented or saved.
- [ ] Confirm the applicable provider transfer fee agreement. No PHP 5 example fee was configured.
- [ ] Verify actual provider payouts/QRPh fallback after destination/fee setup; currently covered with injected provider responses only.
- [ ] Production release/schema review and physical-device banking acceptance. No migration, push or deployment performed.

## Local implementation evidence — November 12, 2026

Code is implemented in `StiOrmocLibrary-main-sync` on
`codex/payment-local-integration`. Unrelated work in both checkouts is preserved.
The ordinary localhost app stays attached to the existing school database.

**Use:** Admin **Online payments → Refund payment** identifies the original payer
and payment, reviews principal plus proportional student-paid fee, requires a
restore/cancel choice for fines, then confirms one saved request. **Library funds**
shows provider cash balance, conservative pending reservations, verified school-bank
setup, withdrawal reviews, activity history and CSV export. A confirmed flat transfer
fee must be recorded with its agreement reference; zero is supported when actually
agreed. Varying destination rates require further setup, not a guessed flat fee.
Fee changes invalidate old reviews and preserve earlier approval history.

Borrower Transactions and payment details retain the original successful payment
with independent refund history. Fines, printing invoices and clearance use the same
net credits. Restore reopens only applied principal; Cancel retains a separate charge
cancellation. Refunding unapplied excess money cannot reopen an already paid bill.
Printing history/current state is locked and rechecked at review and confirmation;
pending refunds and confirmed cancellations also guard Start printing/counter actions.

**Storage/security:** ignored `output/local-payment-tests/money-out.json` holds
local intents, events, destination snapshots, voids and fee approvals. Existing
attempts stay backward compatible. Flushed temporary files plus atomic rename,
an in-process queue and a Postgres transaction advisory lock serialize writers,
including through Supabase transaction pooling. School financial tables/caches
remain unwritten. Provider timeouts retain reservations and never blindly resubmit.
Unknown payout results without an ID require an exactly verified provider reference.
All new routes enforce active Librarian authority, `library.manage`, cookie CSRF,
validation and rate limits. Students/Faculty see only their own refund history;
Staff and legacy technical Admin cannot execute money-out.

Native refund evidence binds merchant, captured payment, reference, channel,
currency and exact amount (major units, version 2024-11-11). Payouts additionally
bind the saved recipient/purpose and use minor units/version 2025-09-01 plus a
persisted idempotency key. Secrets remain server-only. Recovery reuses the durable
019 `payment-recovery` handler; no scheduler was added. The local launcher keeps
school jobs off. Admin Check open requests and owner-scoped borrower POST sync
offer bounded recovery; confirmed reversals adjust credits without deleting history.

**Checks:** `npm test` passed **531 API + 351 web = 882 tests**; typecheck/build
passed. `npm run qa:payments` passed isolated PostgreSQL readiness, four cookie
sign-ins, ownership/role boundaries, receipt checks and report CSV/PDF exports,
then cleaned its temporary app/database fixtures. New tests cover partial/full
refunds, centavo rounding, excess captures, pending/failure/recovery, tampered
evidence, duplicate keys/clicks, cookie CSRF, printing races, destinations,
withdrawals, reversals, fee changes and clearance.

Chrome checked the actual local Admin screens and Check open requests with no
alerts/console errors. Desktop/mobile refund screenshots were inspected; mobile
funds DOM had no horizontal overflow. Dark colors were checked, then light mode
restored. A separate funds-mobile screenshot capture timed out; the refund-mobile
capture succeeded. These are viewport checks, not physical-phone banking tests.

Actual Xendit development capture and **SUCCEEDED PHP 51.50 refund** (50 principal
+ 1.50 user fee) passed using `apps/api/scripts/verify-local-refund.mjs`. It uses
disposable synthetic owners/charges in `output/refund-qa/provider/` and never
connects to the school DB. Provider first returned PENDING; authenticated GET
later confirmed SUCCEEDED. No existing school-linked payment was refunded.
Keep this evidence for audit; do not delete it to imply the provider movement vanished.

Logs/screenshots are in ignored `output/refund-qa/`; actual provider confirmation
is `provider/result.json`. No secret appears in tracked evidence. No dependencies
or applied migration files changed; tracker stays 036 applied / 042 next unused.

Local screens: `http://localhost:5173/librarian/payments` and
`http://localhost:5173/librarian/funds`. Native development refunds are enabled.
Transfers remain gated until verified destination and applicable fee setup.
Production storage, migrations, real funds and callback deployment remain outside
this local approval. Status stays `inprogress` for the listed external acceptance items.

## Change log

2026-11-12 — The owner additionally approved practice school-bank withdrawals and
bank funding, with cash excluded from online withdrawals and top-ups excluded from
collections. This local-only extension is built and documented in
[Library funds practice transfers](2026-11-12-library-funds-practice-transfers.md).
The original actual-provider destination, fee and physical banking gates below remain
open; practice success is not evidence of a real provider transfer.

2026-11-12 — Investigated missing local payment screens. Ports 5173/4000 were
running the older original checkout through its ordinary workspace scripts.
Verified/stopped only those two project listener processes and restarted the
latest `StiOrmocLibrary-main-sync` launcher. Health and served Library funds/
Transactions source checks passed; all 10 saved local attempts (7 successful)
were preserved. No feature code, account, school financial record, push or
deployment changed. Start `npm run dev` from the latest checkout to avoid serving
the older UI again.

2026-11-12 — Owner authorized implementation. Fetched origin; main remains an
ancestor of this branch (24 ahead, 0 behind), so no merge is needed. Preserve
all existing uncommitted local integration work. Build the local durable money-out
ledger first; school financial tables remain read-only. No migration drafted or
applied; current tracker remains 036 applied / 042 next unused. Provider
permissions, verified recipients and transfer fees remain explicit setup gates.

2026-11-12 — Owner confirmed proportional student-fee returns for partial
refunds and prohibited printing refunds once printing starts. Removed the
previous proposed printed-job exception. All planning policy questions are
answered. This historical planning entry predates the implementation approval recorded above.

2026-11-12 — Confirmed approved school bank accounts as the only destinations
for library withdrawals, and separate Admin transfers linked to original
payments for QRPh refunds. These are different money-out purposes; the school
bank restriction must not accidentally route a student's refund to the school.
Partial-refund fee allocation and already-printed job eligibility remain pending.
The plan remains planned; no feature implementation or financial action authorized.

2026-11-12 — Created planning-only scope after code/provider review. Owner chose
Librarian/Admin-only execution, an explicit restore-or-cancel decision for fine
refunds, and refunding both principal and the student-paid fee. Withdrawal
destinations, QRPh fallback and proposed partial-fee/printed-job policies remain
open. No implementation or provider operation was performed.
