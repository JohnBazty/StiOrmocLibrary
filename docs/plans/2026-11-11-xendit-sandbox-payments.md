# Library payments with Xendit — phased implementation plan

| Field | Value |
| --- | --- |
| Date created | 2026-11-11 |
| Date last updated | 2026-11-11 |
| Status | `inprogress` |
| Goal | Make printing and fine payments easy to complete, automatically confirm verified online payments, and preserve accurate financial records |
| Payment provider | Xendit, starting in its Test environment |
| Architecture | Existing React portal, Express API and Supabase PostgreSQL |

## 1. Confirmed decisions

| Decision | Owner's choice |
| --- | --- |
| Services | Printing fees and library fines |
| Online methods | All Xendit methods enabled for the account and supported for the particular payment |
| Counter payments | Keep cash payments |
| Printing payments | Pay the full outstanding bill |
| Fine payments | Allow full or partial payments |
| Transaction fees | Add the online transaction fee to the user's payment |
| Current stage | Phase 1 local setup implemented, with callback hosting pending the payment routes |

The test secret key and webhook token have been saved in the ignored local sheet at `docs/local/xendit-credentials-blank.md`. The key has Money-in Read and Write permission. Read-only API authentication passed during Phase 1. Hosted channel simulations and webhook delivery are scheduled for later phases.

The preserved Final Draft, PDF page 10, describes manual cash and GCash collection. The owner's current request adds the Xendit gateway scope. Its existing printing, fine, clearance and audit requirements continue to guide the integration.

## 2. Simple user workflows

### Printing

1. Upload the document and review the existing calculated printing bill.
2. Submit the print request.
3. Choose Pay online or Pay cash at the library.
4. For online payment, select an available payment method and review the printing amount, transaction fee and total.
5. Continue to Xendit's hosted checkout and complete the test payment.
6. Return to the library page. It shows Waiting for confirmation until the server verifies the result.
7. After confirmation, the request shows Paid and offers View payment and Download payment record.
8. Staff proceed through the existing printing queue.

The confirmed payment makes the request eligible for staff processing. Staff still control printing and collection. Paper and ink deductions stay tied to the existing printing operations.

### Library fines

1. Open Library fines and select an eligible outstanding charge.
2. Choose Pay full amount or enter a smaller amount.
3. Select a payment method and review the payment amount, transaction fee, total and remaining fine balance.
4. Complete the hosted checkout.
5. After verified confirmation, the system applies only the principal amount to the fine and shows the remaining balance.

For example, a PHP 100 fine with a PHP 40 principal payment leaves PHP 60 outstanding. The separately displayed online transaction fee is added to the checkout total. This example does not set an actual fee rate.

The current payment service requires an overdue book to be returned before its changing fine can be paid. Preserve that rule. A finalized lost-book charge can use the existing Library fines obligation model once its assessment and amount are confirmed.

### Staff and Librarian

Staff can continue recording cash payments. Verified gateway payments are recorded automatically. Payment views show the payer, purpose, principal, transaction fee, total, method, reference, status and time.

A Librarian can review exceptions and financial reports. Existing role permissions determine who can collect cash, adjust a fine or handle a reversal. An online payment record identifies Xendit as its automated confirmation source.

## 3. Transaction fees

The fee amount must be known before the user confirms checkout. Provide a method selector in the library's payment review so the server can calculate the correct fee and bind the hosted session to that method.

All compatible methods remain available through this selector. Changing the method obtains a new quote. Xendit's session API supports restricting the hosted checkout to specified channels. [Create session](https://docs.xendit.co/apidocs/create-session)

| Amount shown to user | Meaning |
| --- | --- |
| Printing bill or fine payment | Principal applied to the library obligation |
| Online transaction fee | User-paid fee under the approved schedule |
| Total to pay | Principal plus the fee |
| Remaining fine balance | Outstanding principal after the selected partial payment |

Before coding the fee calculator, obtain the applicable Philippine account rates and confirm which charges may be passed to the user for each channel. Record fixed fees, percentages, taxes, the calculation basis, rounding and effective dates. Xendit states that account rates can differ from published pricing and that some attempt fees have separate billing rules. [Transaction fees](https://docs.xendit.co/v1/docs/transaction-fees)

Use an approved, versioned fee schedule. Freeze its version and amounts on each payment attempt. A changed schedule affects a newly reviewed quote. Fee configuration must be restricted to authorized Librarians and retain change history.

The system must respect each channel's supported amount range. A small partial fine payment may have fewer compatible methods. Explain this beside the method choice and keep the cash option accessible.

## 4. Existing implementation that must be integrated

| Existing area | Required integration |
| --- | --- |
| `printing.service.ts` | Accept verified online payment as a paid bill while preserving staff control of printing |
| `print_cash_payments` | Retain its existing counter-payment meaning and history |
| `print_payment_receipts` | Add an explicit online payment source alongside the existing cash source |
| `fines.service.ts` | Reuse fine eligibility, allocations, remaining balances and clearance calculation |
| `fine_payment_receipts` and `fine_payment_allocations` | Record online principal through the existing fine accounting model |
| Receipt views and PDFs | Display the actual method, principal, fee, total and automated confirmation source |
| Printing and fine Reports | Include confirmed online amounts once and keep fees distinguishable from principal |
| Scheduled processing | Reuse the team's approved job runner for webhook recovery and reconciliation |

Current print receipts require a cash-payment link, and fine receipts require a human receiving user. The additive migration must support an authenticated gateway source and preserve required staff attribution for cash. Repository queries that currently join a required human receiver need a compatible gateway representation.

Some screens currently say Cash payments recorded or Online payment is not available. Update these labels together with the payment functionality so they describe the actual methods.

## 5. Implementation phases

### Phase 1 — Confirm configuration, fees and the test environment

**Work**

- Verify Test mode authentication using the stored key through a controlled backend check.
- Confirm the available channels, their amount limits and the approved fee schedule.
- Configure a dedicated test database or isolated schema containing disposable users, bills and fines.
- Define public HTTPS callback and result URLs for the test deployment.
- Recheck the current branch, PR #16, migration filenames and live ledger before selecting a migration number. Use the PostgreSQL-only implementation as the base.
- Keep the existing credential sheet ignored. Load runtime secrets from server environment settings.

**Ready when**

The test environment, fee schedule, channel choices and public URL requirements are documented. Any required hosting or live migration is presented for owner approval when the implementation is ready.

### Phase 2 — Payment records and shared API

**Work**

- Create a shared module under `apps/api/src/modules/payments/` using the existing repository, service, controller and route conventions.
- Add a reviewed PostgreSQL migration with server-only access controls.
- Add `online_payment_attempts` for the owner, exact obligation, selected principal, fee snapshot, total, environment, channel and provider references.
- Add `online_payment_events` for authenticated callback receipts, processing status, retries and deduplication.
- Add `online_payment_fee_rules` for approved channel rates and version history.
- Extend existing print and fine receipt records with a unique online attempt link. Reuse `fine_payment_allocations` for applied principal.
- Require each printing receipt to have exactly one cash or gateway source. Require human staff attribution for cash and explicit provider attribution for gateway payments.
- Store amounts using integer centavos or exact decimal arithmetic. Convert to the API's documented PHP format at the provider boundary.
- Enforce one active checkout per obligation. Use owner-bound retry keys and unique provider payment references.

**Proposed routes**

| Route | Purpose | Access |
| --- | --- | --- |
| `POST /api/v1/user/payments/quote` | Review an obligation, selected amount, eligible methods and fees | Owner |
| `POST /api/v1/user/payments/checkout` | Create or resume a quoted checkout | Owner |
| `GET /api/v1/user/payments/:id` | Read saved payment status | Owner |
| `POST /api/v1/user/payments/:id/check` | Request bounded provider reconciliation | Owner |
| `POST /api/payments/xendit/webhook` | Receive authenticated Xendit events | Verified provider |
| `GET /api/v1/admin/payments` | Search payments and exceptions | Existing authorized library role |
| `PUT /api/v1/admin/payments/fee-rules` | Record a new approved fee schedule version | Librarian |

Final route names must follow the application's current routing conventions.

**Ready when**

The schema works in the disposable database and tests cover ownership, decimal calculations, fee quotes, retry keys and source attribution. Existing cash records and callers still work.

### Phase 3 — Xendit hosted checkout and verified confirmation

**Work**

- Create a one-time hosted Payment Session from the backend. Set `PAY`, `PAYMENT_LINK`, `PH`, `PHP` and the reviewed total. Restrict its channels to the selected method. [Session API](https://docs.xendit.co/apidocs/create-session)
- Recheck the quote and outstanding balance under a row lock before reserving the attempt. Release the database transaction before contacting Xendit.
- Use an opaque reference that identifies the internal attempt without exposing a student's school ID.
- Persist the session reference and checkout URL. Validate provider URLs against the documented HTTPS hosts for the environment.
- If a creation request times out with an unknown outcome, reconcile it before offering another checkout. Confirm the provider's current deduplication support during implementation.
- Receive callbacks, authenticate the token, validate the payload and save the event durably before acknowledging it.
- Process saved events through a recoverable task. Verify the provider account, session/payment reference, environment, currency, channel, amount and completed payment outcome.
- Use a database transaction to record the receipt, principal allocation, fee and resulting balance once.
- Recover missed or delayed callbacks by querying the provider. Payment Sessions can be read through their server API. [Read session](https://docs.xendit.co/apidocs/get-session)
- Deduplicate callbacks and handle events arriving out of order. [Webhook handling](https://docs.xendit.co/v1/docs/handling-webhooks)

**Ready when**

A test payment creates exactly one receipt and financial effect. Invalid, repeated, delayed and out-of-order callbacks produce controlled results.

### Phase 4 — Printing, partial fines and cash coexistence

**Work**

- Connect full printing-bill payments to the existing request and receipt flow.
- Connect full or partial fine payments to eligible assessed balances.
- Show a fine as Partially paid while principal remains. Clear its financial block only when the remaining eligible balance reaches zero.
- Recompute overall clearance from every obligation. Unreturned books and other unpaid charges continue to affect clearance.
- Add shared checkout-reservation checks to cash payment, fine adjustment and printing cancellation entry points.
- If an online checkout is active, let staff see its status. Resolve or cancel that checkout before collecting cash for the same obligation.
- Accept provider cancellation as complete only after its outcome is known. A payment that succeeds during a race must retain its financial record and enter review if the obligation is already settled.
- Handle waivers, changed bills, refunds and externally duplicated payments without deleting payment history.
- Keep counter cash collections free of an online gateway fee.
- Prevent a generic receipt reversal from claiming that an online refund occurred. An online refund needs a confirmed provider result or documented authorized resolution.

**Ready when**

Printing, partial fine payments, cash collection and exceptional payment races preserve consistent balances and usable receipts.

### Phase 5 — Student, Faculty and staff screens

**Work**

- Add Pay online and Pay cash at library choices in the existing printing and fines screens.
- Show the method, principal, fee, total and remaining fine balance on one review panel.
- Explain the minimum amount beside a partial payment field when a method has a limit.
- Disable repeated submission while checkout is being prepared and offer Continue payment for an existing active attempt.
- Add a result page with a link back to the original bill and View payment.
- Show a receipt download after confirmed payment.
- Add method and status filters to the existing staff payment views and a Needs review filter for exceptions.
- Reuse existing components, notifications and layout patterns. Use readable text, keyboard access and touch controls on mobile.

| User-facing status | Meaning and next action |
| --- | --- |
| Unpaid | Choose online payment or pay at the counter |
| Payment in progress | Continue the existing checkout |
| Waiting for confirmation | Check the saved status or return later |
| Paid | View or download the payment record |
| Partially paid | Review and pay the remaining fine balance |
| Expired or cancelled | Start again from a fresh quote |
| Needs review | Show a reference and explain that the library is checking the payment |

A cancelled browser return does not prove that the provider payment was cancelled. The displayed status follows the saved and verified result.

**Ready when**

A student can complete each flow without staff instructions, and staff can locate the matching payment and its effect on the bill.

### Phase 6 — Reports, reconciliation and operational controls

**Work**

- Include principal, fee charged, gross amount, payment method, provider reference and confirmation time in relevant payment exports.
- Reuse the existing printing/fine report structure. Keep historical printing entries and cash records identifiable.
- Count successful principal once. Track user-paid fees separately from fine reduction and service revenue.
- Record provider processing costs separately when known. Treat provider settlement as a separate fact from payment success.
- Apply Asia/Manila dates consistently in screens and reports.
- Reuse the approved durable job runner for callback retries and unresolved payment checks. Resolve the runner choice noted in PR #16 before wiring recurring work.
- Bound retries, retain event history, and make failed processing visible to the Librarian.
- Support disabling new online checkouts while continuing to accept and reconcile payments already in progress.

**Ready when**

Reports reconcile to the recorded principal, fees and provider references. A restart or temporary outage can recover pending work.

### Phase 7 — Security QA and sandbox acceptance

**Work**

- Execute the test matrix below against disposable accounts and charges.
- Run the relevant API and web tests, then `npm test`, `npm run typecheck` and `npm run build`.
- Review the combined code diff for security, authorization, concurrency and migration compatibility.
- Verify desktop and mobile flows and record the Librarian's usability feedback.
- Demonstrate the selected methods using Xendit's supported sandbox simulations.
- Document a separate release checklist before real payment activation.

**Ready when**

The test evidence, security review, recovery behavior and human workflow review are recorded. Live activation needs the owner's separate release instruction and the approved account/fee configuration.

## 6. Security requirements

These security requirements follow the repository's API security guidance and must be verified during implementation.

| Area | Required behavior |
| --- | --- |
| Secrets | Keep secret keys and webhook tokens in backend configuration. Redact logs and errors. Keep the local sheet ignored by Git. Use separate test/live credentials. |
| User authentication | Enforce current login and session revocation on payment routes. A user can access only their own obligations, attempts and records. |
| Permissions | Apply existing library role checks to cash collection, fee settings, financial adjustments and exports. Gateway confirmation has a distinct provider identity. |
| Amounts | Recalculate balance and fees on the server. Accept a fine payment amount only within the eligible outstanding balance. Persist the reviewed quote. |
| Browser protection | Preserve CSRF protection on cookie-authenticated actions, narrow CORS, secure cookies and HTTPS redirects. |
| Callback authentication | Verify `x-callback-token` using a timing-safe comparison. Validate the event's structure and provider details before processing. |
| Callback recovery | Acknowledge after durable storage. Deduplicate events, bound payload sizes, rate-limit abuse and recover failed processing. |
| Payment verification | Confirm the expected account, environment, amount, currency, channel and provider payment identity. A return URL or screenshot cannot settle an obligation. |
| Concurrency | Use database locks and unique constraints to prevent duplicate allocations and competing cash/online settlement. |
| Outbound requests | Use a fixed provider API origin, TLS validation, bounded timeouts and redirects restricted to validated provider hosts. |
| Personal information | Send only the payer information required for the chosen channel. Keep library documents and unnecessary school data out of payment metadata. |
| Card/wallet data | Use hosted payment entry. Keep card numbers, CVVs, wallet PINs and authentication codes outside the library application. |
| Audit and refunds | Preserve append-only financial evidence and explicit source attribution. Confirm an actual refund before changing refund status. |
| Test isolation | Accept test events only for disposable test charges. Test payments must be excluded from real balances, clearance and production revenue. |

## 7. Required QA cases

| Test | Expected result |
| --- | --- |
| Successful printing payment | Full principal settles the bill once and staff can process the request |
| Partial fine payment | Only principal reduces the fine, with the correct remaining balance |
| Final fine payment | Fine is settled and clearance recomputes from all obligations |
| Excessive, zero, negative or over-precise amount | Rejected before creating a provider checkout |
| Fee calculation and rounding | Total matches the approved method's fee rule and saved quote |
| Method changed after quote | A fresh quote is required before checkout |
| Amount below a channel limit | Explain the limit and offer eligible methods or cash |
| Another person's bill or payment ID | Access denied without exposing the record |
| Expired or revoked login | New account actions require a valid session |
| Duplicate clicks or repeated callbacks | One provider attempt and one financial effect |
| Callback with wrong token or mismatched data | Rejected or quarantined for review, with no balance change |
| Old failure event after success | Confirmed payment retains its successful state |
| Browser closes or opens a return URL manually | Status follows provider evidence |
| Cash payment or waiver during checkout | Shared locks and reservation rules prevent double settlement |
| Provider success arrives after cancellation | Money history is preserved and any conflict enters review |
| Server/database outage after payment | Saved events and reconciliation recover the payment |
| Receipt download and export | Correct principal, fee, total, method and ownership |
| Sandbox callback aimed at a real obligation | Rejected without affecting real balances |
| Refund or reversal request | Correct permissions and confirmed provider evidence |
| Mobile and desktop use | Readable amounts, usable buttons and clear next actions |

## 8. Implementation map

| Area | Expected files |
| --- | --- |
| Shared backend | New `apps/api/src/modules/payments/` module and meaningful tests |
| API registration/configuration | `apps/api/src/app.js`, `apps/api/src/config/env.js`, schema readiness |
| Existing payment services | `printing/printing.service.ts`, `printing/printing.repository.ts`, `fines/fines.service.ts`, `fines/fines.validation.ts` |
| Receipts | Printing receipt modal/PDF code and `fines/fines.pdf.ts` |
| Student/Faculty UI | `StudentPrintingPage.tsx`, `StudentFinesPage.tsx`, API clients and payment result route |
| Staff/Librarian UI | Existing printing/fine payment views and restricted fee settings |
| Reports | Existing live report services, exports and historical printing integrations |
| Database | One or more additive reviewed PostgreSQL migrations, with applied filenames preserved |
| Background recovery | The team's approved shared durable job runner |
| Documentation | This plan, schema context, migration tracker and sandbox test evidence |

Inspect the implementation branch's latest versions before editing. The original workspace has unrelated local changes, and the PostgreSQL reconciliation is in a separate follow-up branch.

## 9. Decisions still needed before implementation

- Actual account fee rates, rounding, tax basis and channel rules before live payment release. The owner approved sample sandbox fees for development.
- A public HTTPS callback address on the approved test deployment. The dedicated local PostgreSQL sandbox is configured.
- The approved shared job runner that will process retries and reconciliation.
- The review/refund process for payments that succeed after a cash payment, waiver or cancellation.

## 10. Tracking and change log

- [x] Confirm printing and fines as the scope.
- [x] Confirm all supported methods, retained cash payments and partial fine payments.
- [x] Confirm that the user pays the online transaction fee.
- [x] Generate the approved Test key and save it with the webhook token in the ignored local sheet.
- [x] Inspect existing cash, receipt, allocation, printing and reporting logic.
- [x] Add security requirements and a phased QA plan.
- [ ] Finalize the outstanding implementation decisions.
- [x] Approve Phase 1 implementation with sample sandbox fees.
- [ ] Complete Phases 1–7 and record their acceptance evidence.

2026-11-11 — Created the initial payment plan and credential templates.

2026-11-11 — Refined the plan after the owner's method, cash, partial-payment and fee decisions. Added fee review before checkout, existing-schema integration, security requirements, recovery rules and phased acceptance criteria.

## Phase 1 implementation record — 2026-11-11

| Item | Result |
| --- | --- |
| Working branch | feat/xendit-sandbox-setup in the separate StiOrmocLibrary-main-sync checkout |
| PostgreSQL base | origin/main bead6ce, including merged PR #16 |
| API authentication | Passed a read-only lookup of a deliberately nonexistent session using the test key. The same lookup with an invalid fixture key returned HTTP 401. Hosted session creation is tested in later phases. |
| Local database | PostgreSQL 18 on 127.0.0.1:55438, database sti_xendit_sandbox |
| Fixtures | Two synthetic users and five sample printing/fine charges in the isolated xendit_sandbox schema |
| Fixture permissions | Separate sandbox_app login with read-only fixture access. The local cluster owner handles setup. |
| Sample fee | PHP 1 plus 1% of principal, zero sample tax, labelled SAMPLE TEST FEE. The owner approved sample sandbox rates. |
| Method references | Twelve PHP channel codes with documented total amount limits, plus Apple Pay and Google Pay variants awaiting hosted-session verification |
| Private configuration | apps/api/.env.xendit-sandbox, generated from the ignored credential sheet without reading the regular API environment |
| Public callback | /api/payments/xendit/webhook and /payments/result paths defined. Hostname awaits an approved test deployment and the later payment routes. |
| Migration audit | Read-only live ledger check found 36 applied files through 032. The existing 003 source mismatch is recorded in PR #16. Branding 033 is pending, with 034 available for the next new migration. |

The database contains Phase 1 setup fixtures. The full application schema, authenticated payment accounts and payment APIs are implemented in subsequent phases. The normal API defaults to XENDIT_ENABLED=false. A future public callback must reach the API connected to these local fixtures. A hosted preview would need a separately reviewed remote sandbox data configuration because the current guard accepts loopback databases only.

The configuration rejects live API keys, remote databases, mismatched application/database targets, arbitrary provider origins and production-site callback origins. A blank public origin is allowed during local preparation. A validated HTTPS test origin supplies the future callback and result URLs.

### Run local preparation

Run these commands from the separate feature checkout. The tool package installs under ignored output/ and adds no application dependency.

```powershell
npm install --prefix output/xendit-sandbox/tools --no-audit --no-fund embedded-postgres@18.6.0-beta.19
npm run payments:sandbox:prepare -w @sti-library/api -- --credentials-file "C:/Users/JOHN/Documents/SSL/StiOrmocLibrary/docs/local/xendit-credentials-blank.md"
```

Preparation starts the local cluster, verifies its fixtures and test API authentication, then stops the cluster while retaining local data. It is safe to rerun against the same fixtures.

Use the following command to keep the database running for later sandbox work.

```powershell
npm run payments:sandbox:prepare -w @sti-library/api -- --credentials-file "C:/Users/JOHN/Documents/SSL/StiOrmocLibrary/docs/local/xendit-credentials-blank.md" --keep-running
```

While it is running, another terminal can check the setup.

```powershell
npm run payments:sandbox:check -w @sti-library/api
```

The generated environment and local-state files contain private credentials. Keep them ignored and avoid displaying or sharing their contents. The sample fee schedule is test data until actual account rates are approved.

### Phase 1 tracking

- [x] Verify test-key authentication through a controlled server request.
- [x] Reject live keys, remote data targets and unsafe origins through configuration tests.
- [x] Configure local PostgreSQL and synthetic payment fixtures.
- [x] Confirm repeat preparation without duplicate fixtures.
- [x] Save the approved sample fee and documented channel limits.
- [x] Define callback/result path requirements for a later approved HTTPS host.
- [x] Run all 649 automated tests, type checks, production build and coverage.
- [ ] Verify hosted sessions, payment-method simulations and callbacks during Phases 3 and 7.

2026-11-11 — Began Phase 1 on the PostgreSQL-only main base. Added isolated configuration, repeatable local setup, sample fees, published channel limits and read-only provider checks.
