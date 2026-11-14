# Library funds: collections and practice bank transfers

**Why:** Let the Librarian/Admin track online and onsite collections separately, withdraw only online funds, and practice adding funds from a school bank.

**Date created:** 2026-11-12
**Date last updated:** 2026-11-12
**Status:** built

## Latest owner amendment: added funds can be withdrawn

2026-11-12 — Confirmed bank additions must increase the withdrawal allowance as
well as confirmed online collections. Draft/cancelled additions and counter cash
remain excluded. Additions are school funding, not student payments or revenue.
Keep the provider balance as a second hard limit, reserve payout principal plus
fees, and deduct each successful withdrawal once. Failed/reversed payouts release
or restore their allowance through the existing verified status flow.

This applies to the existing development-only local ledger. A local bank addition
does not create an external bank deposit or increase Xendit's actual balance;
provider payout remains limited by available provider funds. Real-money funding
would require separately verified bank/provider deposit evidence. Preserve all
existing additions, withdrawals and history. No migration, push or hosting.

Update the server eligibility calculation and all affected interface wording.
Verify confirmed versus unconfirmed additions, provider balance changes, fees,
duplicate protection and unchanged collection totals with isolated tests.

### Added-funds verification

The shared confirmed-bank-additions calculation now feeds the provider withdrawal
allowance and the local funds summary. Only Succeeded TopUp entries count. The
provider balance remains a hard cap, with open payout reservations and fees checked
again before submission. Top-ups never enter student collections/revenue or change
cash totals. Existing records were preserved; no new funding or withdrawal was made
on the owner's ledger during verification.

Tests were written and observed failing before the repair. The complete suites
passed **548 API + 359 web = 907 tests**, along with typecheck, build and coverage.
New tests confirm that an unconfirmed addition cannot fund a withdrawal; a confirmed
addition enables one larger than student collections; collections stay unchanged;
and a lower provider balance blocks both review and confirmation without posting a
payout. Existing status, refund, fee, duplicate and failure/reversal checks pass.
Overall coverage remains below 80%: API 71.85% lines, web 64.90% lines.

A read-only check against the normal local configuration confirmed that saved bank
additions are included and both provider/eligible-funds limits hold. The API was
restarted with the updated code and health returned 200. A browser check redirected
to Staff sign-in and did not reach the updated screen; no completed visual check
is claimed for this amendment. The UI wording was compiled and covered by the web
suite. The previously verified Xendit payout rail is unchanged, so no new provider
transaction was created merely to retest the allowance calculation.

Branch remains `codex/payment-local-integration`. No commit, push, hosting,
dependency change, hosted migration or school financial write. Migration tracker
remains 036 applied / 042 next unused. Evidence is in ignored
`output/funds-additions-*.log`.

## Current amendment: Xendit-connected withdrawals

2026-11-12 — The owner now requires the primary Withdrawal action to create an
actual Xendit development payout and show its verified status automatically. They
approved Xendit's sample bank recipient for this check. Retain old local history
without presenting it as a provider-confirmed transfer. New withdrawals must use
the existing provider payout service; bank additions remain local practice only.
Withdrawable funds are capped by both verified provider balance and confirmed
online collections less refunds, completed withdrawals, fees and pending holds.
Cash and simulated top-ups never increase this provider withdrawal cap.

Use the existing approved single durable recovery runner, plus bounded status checks
while the Library funds page is open; do not start school background jobs or add a
scheduler. Refresh must recover provider status before returning balances, update
the open detail/review and stop polling on unmount or while the tab is hidden.
Keep unknown payout outcomes reserved and never submit twice. Verify actual Xendit
success/failure with synthetic recipients and isolated ledgers only, then record
the evidence. No live key, school bank transfer, database migration, push or hosting.

References: [Create payout](https://docs.xendit.co/apidocs/create-payout-v3),
[Get payout](https://docs.xendit.co/apidocs/get-payout-v3-by-id),
[development scenarios](https://docs.xendit.co/docs/test-scenarios-payouts),
[balance](https://docs.xendit.co/apidocs/get-balance). Checked November 12, 2026.

### Connected withdrawal verification

- Primary Withdraw funds now opens the provider review and submits the saved payout
  with its durable idempotency key. Old local withdrawal creation is blocked. Old
  records remain labeled Recorded locally and are not replayed into Xendit.
- Provider status checks run before balances load, refresh the open detail/review,
  and poll at ten-second intervals only for recent/pending transfers in a visible
  page. Requests are coalesced, errors preserve the last visible data, and polling
  stops on unmount. Opening/refocusing the page also checks existing requests.
  No server scheduler or school job was enabled.
- Available withdrawals are limited to both provider funds and confirmed online
  collections, less completed withdrawals/refunds/fees and open holds. Cash and
  simulated top-ups cannot increase this cap. Refund transfers still check provider
  funds for their full amount including the library-paid transfer fee.
- Owner-approved sample school bank and PHP 5 sample fee were saved to the ignored
  local ledger after checking the active merged Admin's authority. The sample fee
  is explicitly distinguished from an actual Xendit contract. No real school bank
  account or school financial row was added/changed.
- Actual provider acceptance passed: one PHP 50 development payout reached
  **SUCCEEDED**, and one official invalid-destination scenario reached **FAILED**.
  Only synthetic recipients and isolated ledgers were used. Provider records and
  safe evidence remain under ignored `output/withdrawal-qa/provider/`. They did not
  become school receipts, student credits, or the owner's operational withdrawals.
- Actual response inspection exposed an omitted optional `source_amount`. The
  repaired PHP-to-PHP validator requires the exact destination amount and compares
  source amount whenever supplied, without weakening other identity checks.
  Regression tests reject a mismatched destination amount. One diagnostic replay
  reused the exact saved payload/idempotency key and returned the same payout;
  ordinary recovery does GET checks and never reposts an unknown transfer.
- Full automated API coverage passed **547 tests**, web coverage passed 358 tests,
  and the final complete web suite passed **359 tests**, including the added
  primary-button/legacy-history regression: **906 automated tests total**.
  Typecheck/build passed. Overall coverage remains below
  80% (API 71.86% lines, web 64.90% lines); no higher coverage is claimed.
- Chrome checked the actual connected Admin page, configured sample bank and
  withdrawal form. At a 390px viewport, input text was 16px and the document/dialog
  fit without horizontal overflow. Desktop DOM checks at 1440px also fit. Viewport
  overrides were reset, the unsubmitted form was closed, and no withdrawal was
  initiated against the owner's ledger. A local screenshot is preserved under
  `output/withdrawal-qa/library-funds-connected.png`. Physical banking/devices and
  public payout callbacks remain outside this local test scope.

All current connected-withdrawal work is local on `codex/payment-local-integration`.
No commit, push, deployment, dependency change or hosted migration was performed.

## Approved behavior and implementation

The owner approved local implementation of the quoted conversation. Reuse the existing Library funds screen, server permissions, local atomic funds store and payment lock. Preserve all unrelated uncommitted work. No push, deployment, live migration or real money movement is authorized.

Show confirmed online collections plus issued counter cash receipts as total collections. Show cash separately and exclude it from withdrawals. Exclude reversed cash receipts, pending/failed online attempts and bank top-ups from revenue. Confirmed refunds reduce online collections. Display bank additions separately from student payments. Existing counter payment and borrower transaction workflows remain the source of onsite records; do not create another cash-entry form.

Practice transfers use their own append-only history within the existing ignored local funds ledger. Use a fixed practice school-bank destination, without inventing real account details. Admin reviews amount, direction, purpose, fee and resulting balance, then confirms. The approved sample withdrawal fee is PHP 5; additions have no fee. These entries never call Xendit or write school financial tables. Keep the existing provider-backed transfer workflow separate and gated by its actual destination and fee setup.

Server enforcement: active Librarian with library.manage, cookie CSRF, write rate limits, exact centavos, immutable retry keys, actor-bound confirmation, fifteen-minute review expiry, pending withdrawal reservations, serialized writes and balance recheck. Cash cannot fund a withdrawal. Bank additions affect online funds, not collections. Restart/retry must not duplicate a movement. Provider refunds and withdrawals reduce available practice funds conservatively.

## Implementation tracking

- [x] Tests first for accounting, concurrent withdrawals, retry conflicts, expiry, role/CSRF, and no provider/financial writes.
- [x] Add server accounting, practice review/confirm/cancel endpoints and durable local records.
- [x] Add collection cards, practice withdrawal/top-up review and filterable history to Library funds.
- [x] Run tests, typecheck, build and coverage; inspect the local UI when available.
- [x] Record results and any limits.

## Verification and limits

Implemented locally on `codex/payment-local-integration`; no commit, push, deployment,
dependency change or migration was made. The existing local preview guard prevents
these actions from running on Vercel/production. Funds persist alongside the existing
local payment ledger. Student payment, counter receipt and school history records
are preserved. Bank transfer dates and CSV exports explicitly use Asia/Manila.

The full automated suites passed: **542 API + 354 web = 896 tests**. Typecheck and
production build pass. New accounting tests execute the cash-total query against
disposable in-memory PostgreSQL, verify exclusion of reversed/noncash/provider
receipts, and cover online-only availability, refunds, expiry, competing withdrawals,
recreated-service retries and balance changes before confirmation. Route tests cover
forbidden roles and missing cookie CSRF. UI tests cover review-before-confirm,
server-returned fees, expected balance, double clicks, top-up separation, retries,
saved-review recovery and history filters. The final balance-snapshot addition also
passed the focused API/UI tests and final typecheck/build.

Coverage completed with all API/web tests passing. Overall existing coverage remains
below 80%: API 71.82% lines; web 64.61% lines (56.77% statements). A high-concurrency
coverage attempt hit Windows `ENOBUFS` in an unrelated route test; rerunning the API
coverage with `--test-concurrency=2` passed all 542 tests. Logs are ignored under
`output/funds-*.log`; they contain synthetic verification data, not copied credentials.

Chrome sign-in and the actual localhost Library funds overview were checked at the
existing narrow viewport: collection totals loaded correctly and cash was separate.
The extension detached while opening the withdrawal form, then rejected an attempted
new tab as inactive. Full desktop/mobile dialog screenshots and browser-driven final
confirmation remain unverified; automated dialog/confirmation tests pass. No bank
destination was added, no practice transfer was confirmed against the owner's local
ledger, and no provider payout/top-up call was made. Only disposable test ledgers
were mutated. The app was restarted from the latest checkout for the owner to use.

The feature is built for the approved local practice scope. Real bank funding,
withdrawals, settlement availability and production persistence are separate work,
not claimed as verified here.

## Database / release boundaries

No migration required. Applied tracker remains 036, next unused 042. Local practice storage is not production accounting; hosting requires separate approval and a reviewed persistent database design. No applied migration, dependency or job runner changes.

## Change log

2026-11-12 — Owner requested implementation of total collections, separate cash/online balances, online-only withdrawals and simulated bank additions. Continue the existing local payment integration branch; preserve prior refund/withdrawal work.

2026-11-12 — Built the approved local scope with tests first, no new tables or provider
operations. Admin Library funds now shows collections and cash separately, offers
review/confirm/cancel for practice withdrawals and bank additions, preserves transfer
history, and exports it separately. Existing Xendit transfer/refund controls are
collapsed to distinguish provider operations from practice transfers. Documented
verification evidence, coverage shortfall and the browser connection limit above.

2026-11-12 — Owner requested one withdrawal button. Kept the Xendit-connected
Withdraw funds action under School bank transfers and removed its duplicate from
School bank account. Bank management controls and the shared withdrawal flow are
unchanged. Verified with the existing connected-action/withdrawal tests and web typecheck.
