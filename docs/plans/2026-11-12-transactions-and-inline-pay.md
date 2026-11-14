# Inline payment and unified transactions

| Field | Value |
| --- | --- |
| Date created | 2026-11-12 |
| Date last updated | 2026-11-12 |
| Status | `built` |
| Why | Pay directly beside bills and keep online/onsite activity in one readable history |

## Approved behavior

Keep the school database and the latest local app together. Show a Pay action on
unpaid printing/fine rows. Replace the duplicate Payments worklist with
Transactions, containing online attempts and confirmed onsite printing/fine
records, with filters, pagination and downloads. Keep assessment and job details
in their original service screens; move their duplicate receipt lists to
Transactions. Preserve old payment URLs as redirects.

John explicitly chose Xendit Test checkout while keeping real school bills
unpaid. Do not run the real-money settlement service, apply hosted migrations,
push or deploy. Local Test attempts use a private ignored file, not school
financial tables. Reuse the current provider client, exact fee calculation,
ownership checks and cookie/CSRF boundary. Only the local launcher enables this
mode; hosted execution rejects it. The owner subsequently requested normal
**Payment** labels instead of environment terminology. The owner subsequently
asked to remove the explanatory notice too. The interface now uses regular
payment messages, while the development credential and unchanged school bills
remain the approved underlying boundary. No official receipt or clearance
payment is created. Uncertain creation is not retried.

## Implementation tracking

- [x] Owner-scoped combined transaction reads, filters and pagination.
- [x] Local-only Test checkout without changing school balances.
- [x] Inline Pay controls, unified Transactions and original-service links.
- [x] Remove duplicate receipt sections; preserve old URLs and downloads.
- [x] Verify security, balances, provider actions, tests, typecheck and build.
- [x] Leave the same local school-data app running; record remaining limits.

## Change log

2026-11-12 — Owner requested that Clearance use the same confirmed payments as
Fines. Added the existing scoped principal credits to the local borrower
clearance calculation before totals, reasons and status. Unreturned books,
in-library hand-backs, unpaid replacement charges and authorized overrides are
preserved. The local projection never writes the school's clearance cache.
Initial load, Refresh and returning focus reconcile payment status before reads.
Verification completed: 509 API and 345 web checks passed (854 total), plus
typecheck, production build and whitespace checks. Tests cover full/partial
payment, unreturned-book protection, replacement charges, unrelated bills and
authorized overrides. A read-only check using the owner's existing completed
payments showed Fines and Clearance totals matching, zero outstanding charges
and computed Cleared; the official clearance cache compared identically before/
after. The local app was restarted. Browser visual/device inspection remains
unverified. No push or hosting occurred for this correction.

2026-11-12 — Owner approved hosting the return page only. Published the separate
Vercel project `sti-library-local-return-20261112` and verified its public HTTPS
endpoint returns HTTP 303 to the fixed local confirmation route. Invalid input,
open redirects and writes are rejected. Configured the ignored local return URL
and verified actual GCash and QRPh provider sessions retain it for success and
cancellation. Only the navigation bridge was published; the library deployment,
school schema, accounts and financial records were not published or altered.

2026-11-12 — Owner reported successful transactions leaving local fine rows
Unpaid. Added owner-and-linked-user scoped verified principal credits to local
bill views and checkout balance calculations. Fine summaries/status filters run
after credits and before pagination. Partial payment becomes Partially Paid;
full payment becomes Paid, with zero balance and no repeat Pay action. Older
duplicate completions cap at the bill balance. Printing status and borrower
invoices use the same local view. Refresh/return performs bounded authenticated
provider reconciliation with CSRF/rate-limit protection. School receipt,
allocation, fine/print status and clearance tables are untouched; staff reports
retain their original financial records. Verification completed: 505 API and
344 web checks passed (849 total), along with typecheck, build, the full isolated
HTTP app and the separate return-page checks. A read-only check of the owner's
existing completed attempts showed the affected bill as Paid, a matching local
summary, and identical school fine rows before/after. The local app was restarted
with the fix. Browser/physical-device completion remains unverified.

2026-11-12 — Removed the unwanted explanatory notice and unchanged-balance
wording from the payment interface at the owner's correction. Quoted fine
payments show a projected balance after the selected amount; completed local
preview payments do not claim an actual settled school balance. Payment
verification and no-financial-write protections remain intact.

2026-11-12 — Owner requested automatic return after successful payment. Actual
provider creation with `http://localhost:5173` was rejected with HTTP 400,
`INVALID_URL`, confirming the HTTPS requirement. Prepared server-configured
return addresses and a separate navigation-only HTTPS bridge under
`tools/payment-return-bridge`. It accepts only a UUID payment reference and
redirects to a fixed localhost destination. It has no credentials, database,
payment capture or API proxy. Owner approval and subsequent publication are
recorded above; the library application itself was not published. Existing
sessions are unchanged; return settings apply to new sessions only.

2026-11-12 — Owner approved modernizing the library-owned review, Transactions
and confirmation screens using relevant installed design/accessibility guidance.
Use a clear total, compact notices, readable activity rows and responsive light/
dark surfaces. Keep Xendit's hosted UI, fee math, settlement and Test boundaries
unchanged. Make our confirmation page reachable when returning from checkout.
Implementation and automated verification completed locally; no push or hosting
authorized. Browser visual inspection remains unavailable.

2026-11-12 — Owner clarified that the interface should simulate ordinary money
payments, using “Sandbox” instead of “Test.” Updated review, statuses, method
names and derived transaction references without changing the provider's Test
credential/environment or the protection that keeps school bills unpaid.

2026-11-12 — Owner then requested **Payment** terminology throughout the interface,
removing the Sandbox label too. The provider still uses development credentials;
the compact financial disclosure and unchanged school balances are preserved.

2026-11-12 — Completed the modern payment interface: 497 API checks and 342 web
checks passed (839 total), including 22 focused payment checks. Typecheck,
production builds and whitespace checks passed. The same school-data local app
was restarted with the final labels. No account, bill, receipt or hosted schema
was changed by this UI work. Physical payment completion and desktop/mobile
visual inspection remain outside the verified result.

2026-11-12 — Replaced the borrower Payments worklist with Transactions. Added
read-only local Xendit Test sessions, kept the school database connected, and
restarted the local launcher to load the new setting. Verified actual GCash and
QRPh Test session creation, lookup and cancellation, plus read-only options and
history against the existing school schema. No payment migrations were applied.
Completed 833 tests, typecheck, build and isolated full-app acceptance. Updated
the launcher to wait for API health before starting Vite, avoiding initial
unavailable messages. Left the normal school-data application running on 5173.

2026-11-12 — Scope confirmed by the owner, including Test checkout with real bills
remaining unpaid. No live migration or hosting approval inferred.

## How it works

The borrower selects Pay beside an unpaid printing bill or eligible finalized
fine, reviews the amount and sample fee, and continues to Xendit Test checkout.
GCash and QRPh are enabled for this local test. Partial payments are supported
for fines; printing and replacement charges require their full bill amount.
The sample transaction fee is PHP 1.00 plus 1% of principal, rounded to centavos.
These sample fees are not approved production rates.

The local launcher keeps `XENDIT_ENABLED=false` for the financial settlement
service. When the existing ignored `apps/api/.env.xendit-sandbox` exists, it sets
`LOCAL_PAYMENT_PREVIEW=true` for the separate read-only Test path. Startup
rejects production/Vercel execution, a non-localhost origin, or invalid Test
credentials. It uses the existing provider client and transmits synthetic payer
details rather than a student's name, school ID or email. No credentials are
returned to the browser or copied into tracked files.

Preview attempts are saved atomically in ignored
`output/local-payment-tests/attempts.json`. Quote and checkout requests validate
the authenticated borrower and current bill balance. A serialized queue and
retry keys prevent duplicate creation. Uncertain provider creation is retained
for review rather than retried. Status checks verify provider references,
amounts, currency, merchant and channel; success additionally requires verified
captured-payment evidence. Every result remains a **Test** result: school bills
stay unpaid, with no official receipt, allocation or clearance update.

The provider requires HTTPS return URLs. At the owner's explicit approval, the
separate return endpoint at
`https://sti-library-local-return-20261112.vercel.app/payments/result` sends the
browser to its fixed localhost confirmation address. The API adds the payment
reference to new sessions' success/cancel return URLs. These settings were saved
and fetched successfully through actual GCash/QRPh Test sessions. The endpoint
is navigation-only, not a payment webhook or a publicly exposed local API. The
local app must be running on the same device/browser. Older sessions can still
use Back and Check status because their return settings cannot be changed.
See Xendit's
[Create a session reference](https://docs.xendit.co/apidocs/create-session).

Transactions uses the authenticated account and its linked borrower, never a
client-supplied user ID. It combines onsite fine/print receipts and owned online
attempts; gateway receipts are excluded from onsite results to avoid counting
them twice. Filtering, search and pagination run on this combined list. The SQL
also works before payment migrations are installed. Existing `/student/payments`
and `/faculty/payments` links redirect to Transactions. Receipt download routes
retain their normal ownership checks. Duplicate receipt panels were removed
from Fines and Printing; fine assessments and printing jobs/invoices remain.

## Verification and limits

- SQL-backed tests cover combined pagination/search, online receipt deduplication,
  inactive accounts, and both account and borrower ownership.
- Test service checks cover exact fees, partial-fine restrictions, duplicate
  clicks, uncertain creation, cancellation, mismatched provider evidence and
  verified simulated capture. Every school-query statement is SELECT; simulated
  success retains the complete real balance and has no receipt.
- Actual Xendit Test GCash and QRPh sessions both became Active, were fetched and
  cancelled. The tested PHP 50 synthetic bill quoted PHP 1.50 sample fees and
  PHP 51.50 total. Provider evidence is in ignored
  `output/local-payment-tests/provider-check.json`.
- Read-only checks against the existing school database returned enabled Test
  options for an eligible unpaid printing bill and readable transaction history.
  No school financial records were changed.
- The isolated full HTTP app passed four cookie sign-ins, OTP/CSRF and role
  boundaries, combined Transactions reads, pagination, another borrower's empty
  history, protected receipt PDF and three report CSV/PDF exports. Its disposable
  database was cleaned up; localhost kept the school database throughout.
- Browser control still reports unavailable in this chat. Desktop/mobile visual
  inspection, actual payer/physical QR completion and external webhook delivery
  remain unverified. No real-money release claim is made.
- Final regression: 497 API tests and 336 web tests passed (833 total), plus
  TypeScript checks, production builds and whitespace checks. Evidence is in
  ignored `output/transactions-tests.log`, `transactions-typecheck.log`,
  `transactions-build.log` and `transactions-app-acceptance.log`. Final localhost
  health, registration and catalog reads returned 200; anonymous Transactions
  returned 401. Only ordinary localhost 4000/5173 listeners were left running;
  the disposable QA listeners and cluster were stopped. No push or deployment.

Migration tracker unchanged: latest applied `036_sign_in_hardening.sql`;
`033`–`035` and payment `038`–`041` remain pending, next unused `042`.

## Modern payment interface — November 12

- Review now uses a two-column desktop dialog with amount/method choices beside
  a prominent total and fee breakdown. Mobile stacks the content and keeps the
  continue action accessible in the dialog footer. Limits, QR instructions and
  onsite options use progressive disclosure instead of repeated paragraphs.
- Payment-only styles reuse the brand and support light/dark themes, readable
  amounts, visible focus and native dialog/radio/select keyboard behavior.
  Controls are at least 44 pixels high; primary payment controls are 48 pixels.
  No new animation, font package or component framework was introduced.
- Transactions uses compact activity rows with online/onsite filters, search,
  amounts, status, protected receipt downloads and direct confirmation links.
  Empty and failed loads have distinct next actions. References use `PAY-`.
- Starting checkout first saves our confirmation route in browser history, then
  opens the verified Xendit URL. The one-time handoff flag is removed before
  leaving, so Back returns to our page without reopening checkout. Our page
  refreshes saved status on return and never trusts a URL claiming success.
  This does not configure a public HTTPS return URL or webhook.
- The final user-facing terminology is **Payment**. Development-provider
  metadata remains technically accurate. At the owner's subsequent correction,
  the explanatory note is removed. The interface simulates ordinary payment
  status using local verified credits. No official receipt is offered for a
  preview success and no school financial record is changed.
- Focused checks cover trusted checkout hosts/history, single handoff, status
  refresh, forged success parameters, normal labels, partial amounts, duplicate
  clicks and receipt restrictions. Full regression passed, with evidence under
  ignored `output/payment-design-*.log`. Browser access still reports unavailable;
  no claim is made of completed visual/device inspection.

## Payment status correction and return activation

The previous local flow displayed successful attempts in Transactions while
continuing to read unchanged school bills. Verified `Succeeded` attempts now
contribute principal-only credits to the local borrower view. Credits require
both the active account ID and its current linked borrower ID. Fees never reduce
a bill. Credits are applied before fine status filtering, summaries and
pagination; printing requests and borrower invoice displays share the same rule.
Cancelled/expired/pending/review attempts cannot settle a local bill. Full
payment sets Paid/zero, partial fines become Partially Paid, and legacy repeated
completions cap at the remaining amount. The API's new quote/checkout checks use
this same effective balance, preventing repeated collection on a completed bill.

The authenticated CSRF-protected `POST /api/v1/user/payments/sync` checks at most
three pending owned sessions per call using the existing evidence verifier and
rate limiter. Fines, Printing and Transactions refresh before loading their
records; returning focus refreshes the service pages too. Fine Pay controls reload
their options after refresh, and completed rows link to their payment details.

School status rows, receipt allocations, clearance and financial reports remain
unchanged under the owner's earlier development-only authorization. The ignored
local attempt file is still required to reproduce this view. Official settlement
continues to require its separate activation and payment migrations.

Verification evidence is under ignored `output/payment-status-*.log`,
`output/local-payment-tests/paid-status-check.json`,
`output/local-payment-tests/hosted-return-check.json` and the provider check JSON.
The isolated HTTP app includes sync CSRF and role checks, four sign-ins, private
receipt PDF and report exports; its fixtures were cleaned up. Final ordinary
localhost health/catalog/registration returned 200, anonymous sync returned 401.
Only the separately approved navigation bridge was deployed. No GitHub push or
library deployment occurred. Full payer redirect and visual checks still need
browser/device verification.
