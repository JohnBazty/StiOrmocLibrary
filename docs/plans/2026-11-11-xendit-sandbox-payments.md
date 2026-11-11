# Library payments with Xendit — phased implementation plan


> Current local integration, November 12: sign-in 036 is already applied (checksum verified November 11). Payment drafts were renumbered to 038–041; 033–035 remain unapplied and the next local number is 042. Payment recovery uses the single durable 019 runner. Historical phase numbers below describe earlier work; the [local integration record](2026-11-11-local-payment-integration.md) supplies current startup and verification. No payment migration was applied to Supabase.

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
| Current stage | Phases 1–6 built locally. Phase 7 automated/security/PDF checks pass; browser, completed hosted payment, external callback, deployed scheduler and Librarian acceptance remain open |

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

Phase 2 implements quotes, preparation, owner reads, the authorized staff list and Librarian fee versions. Checkout returns HTTP 202 with `state=Prepared` and `gatewayConnected=false`. The reconciliation and webhook routes in this table belong to Phase 3. No provider session or financial settlement is claimed by preparation.

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

## Phase 2 implementation record — 2026-11-11

Phase status is `built` for the local payment foundation. The overall seven-phase plan remains `inprogress`.

### Implemented behavior

- Owner-scoped quotes calculate a printing bill, finalized fine or confirmed lost-book charge from current database records. Printing and replacement charges require full payment; ordinary fines accept partial principal. Accruing overdue fines remain blocked.
- Each quote freezes integer-centavo principal, fee, total, balance and an immutable fee-rule version. Quotes expire after five minutes. A changed balance or fee requires a new review.
- Checkout preparation uses a transaction, account/obligation locks, owner-bound retry keys and unique active-target indexes. Repeated submissions resume the same saved attempt. A prepared attempt has a ten-minute deadline. A later preparation expires an old prepared attempt only when it has no provider references; uncertain provider activity remains reserved for later reconciliation.
- Borrowers can read only their own attempts. The real application account/session guard blocks revoked sessions and deactivated accounts. Staff/Librarians can list attempts; only Librarians can append sample fee-rule versions. Writes have a per-account limit of twenty per minute.
- Receipt structures preserve historical cash values and distinguish `Legacy`, human-confirmed `Staff` and verified `Xendit` provenance. Principal, fees and total received remain separate. Online references, event IDs and receipt links are unique.
- Online configuration remains disabled by default. The enabled schema readiness check requires the new tables and receipt columns. Existing cash service paths and financial reports have not been changed in this phase.

### Acceptance evidence

| Tracking item | Result | Evidence |
| --- | --- | --- |
| Shared module and routes | PASS | `apps/api/src/modules/payments/` with validation, repository, service, controller and JWT-protected routes |
| Exact amounts and fee snapshots | PASS | Validation tests plus actual PostgreSQL quotes. PHP 100 fine, PHP 40 principal and PHP 1.40 sample fee produce PHP 41.40 total and PHP 60 remaining |
| Partial/full payment rules | PASS | Real database verifier rejects partial printing/replacement payments, unavailable obligations and accruing fines |
| Ownership/session boundaries | PASS | Real JWT/account/session middleware rejects missing login, another owner's payment, deactivation and revoked sessions |
| Retry/concurrency controls | PASS | Concurrent different quotes yield one prepared checkout; repeated same-key submissions return the same attempt; changed fees/balances fail |
| Cash compatibility | PASS | Existing fine and printing receipt columns compare unchanged across migration; old receipts retain Legacy provenance; new cash receipts require staff |
| Gateway source/allocations | PASS | Synthetic succeeded attempts verify matching owner, bill, principal, fee, receipt uniqueness and principal-only allocation. Provider references are fixture strings |
| Server-only tables | PASS | RLS enabled and direct anon access rejected after granting schema visibility. PUBLIC, anon and authenticated table/sequence grants are revoked |
| Event deduplication | PASS | Repeated environment/provider-event ID rejected by PostgreSQL |
| Fee-history safety | PASS | Updates/deletes rejected. Append operations enforce Librarian permission, bounds and idempotence |
| General regression | PASS | `npm test` — 392 API tests and 268 web tests; `npm run typecheck`; `npm run build`; `npm run coverage` |
| Abuse protection | PASS | Route test confirms the twenty-write limit, unchanged by request-body changes, while a separate account remains usable |
| Live migration/deployment | NOT RUN | Migration 034 applied only inside a disposable local schema, which was dropped after verification; local cluster stopped |

Coverage runs pass without claiming complete path coverage. Real PostgreSQL acceptance runs separately from the unit coverage command. The web build still reports its existing large-chunk advisory.

### Reproduce isolated database acceptance

From the separate feature checkout, run the following command. It loads the ignored test credential sheet privately, performs the Phase 1 read-only provider check, creates a uniquely named local test schema, applies migration 034, exercises actual SQL and removes that schema in a finally block.

```powershell
npm run payments:sandbox:prepare -w @sti-library/api -- --credentials-file "C:/Users/JOHN/Documents/SSL/StiOrmocLibrary/docs/local/xendit-credentials-blank.md" --phase2
```

The retained Phase 1 fixture schema contains synthetic data only. No actual school records, normal account passwords, live financial balances or applied migration sources were changed. Secrets and local database files remain ignored and untracked.

### Limits and next phase

Migration `038_online_payment_foundation.sql` remains unapplied on Supabase. Branding 033 also remains pending. Latest applied migration is 032 and the next unused number is 035. The previously documented 003 checksum discrepancy is unchanged.

No gateway checkout, callback route, reconciliation endpoint, receipt issuance or financial settlement runs from these APIs yet. Preparation explicitly returns `gatewayConnected:false`. Phase 3 adds provider sessions and authenticated confirmation. Cash/online settlement guards, gateway-compatible receipt queries, reporting and UI follow in Phases 4–6. Device/browser payment tests and callback simulations remain later acceptance work.

The complete application schema and real login UI were not installed into the local fixture database. The acceptance schema uses the existing receipt DDL and minimal synthetic account/obligation parents to test this phase's actual SQL and middleware. A complete isolated application deployment and approved HTTPS callback host are still needed for end-to-end checkout testing.

### Phase 2 tracking

- [x] Implement payment records, fee-rule versions and authenticated shared APIs.
- [x] Add additive migration 034 without changing applied sources.
- [x] Preserve cash history and require explicit gateway provenance.
- [x] Verify ownership, integer amounts, fee quotes, retry keys and duplicate prevention.
- [x] Verify migration and constraints on disposable local PostgreSQL, then clean up.
- [x] Run regression tests, type checks, build and coverage; review access controls and secret handling.
- [ ] Apply the reviewed migration to an approved full test deployment in a later authorized step.
- [ ] Add actual gateway sessions, callbacks and reconciliation in Phase 3.

2026-11-11 — Completed Phase 2 locally on `feat/xendit-sandbox-setup`. Reserved 034 for the additive payment foundation, advanced trackers to next unused 035 and preserved the live ledger. Gateway sessions, production data changes, push and hosting remain outside this phase.

## Phase 3 implementation record — 2026-11-11

Phase status remains `inprogress` for external acceptance. The backend implementation and local acceptance are finished. Real completed-payment verification, public callback delivery and full-deployment acceptance remain open. No hosting, push or live migration is included in this run.

### Implemented behavior

- `POST /api/v1/user/payments/checkout` now claims a prepared attempt under account/obligation locks, rechecks balance and fee version, commits the Creating state, then calls Xendit outside the transaction. Concurrent submissions issue one provider creation request.
- The provider client uses the fixed HTTPS API origin, test credentials, ten-second timeouts, a bounded response size and rejected redirects. It permits checkout links only on the documented test hosts. Payment evidence requests pin API version `2024-11-11`.
- Hosted sessions use PAY, PAYMENT_LINK, PH, PHP, automatic capture, a thirty-minute expiry, one selected channel and an opaque attempt reference. The sandbox uses a synthetic Sandbox Payer and sends no school ID, email, library document or card data. Future live configuration requires a separately reviewed payer-data policy.
- Xendit's session creation reference does not document an idempotency header or lookup-by-reference endpoint. A lost creation response therefore stays reserved as Review. The system never automatically repeats that POST. An authenticated callback can recover the missing session ID through its opaque reference and a verified provider lookup.
- `POST /api/payments/xendit/webhook` accepts bounded JSON and authenticates the callback token using a timing-safe comparison. It saves a minimal normalized event in a transaction before returning HTTP 200. Provider customer/card details and delivery tokens are omitted from saved events.
- The recovery task leases saved events, retries transient failures with backoff and reclaims expired leases after a restart. It checks current session/payment evidence, including merchant, internal reference, environment context, currency, method, full gross amount, matching payment-request identity and captured total. AUTHORIZED or PENDING payments do not settle a bill.
- Verified success records one gateway receipt and principal allocation atomically, recomputes fine status/clearance or settles the printing/lost-book charge. A changed balance enters Review without a second allocation. Failure during receipt/allocation writes rolls back the success state and financial effect together.
- Stored event IDs, provider references, active-obligation constraints and receipt links prevent duplicate effects. A delayed expiry event cannot undo a successful payment. Receipt identity/amount fields are protected after gateway attribution, and the cash reversal API rejects gateway receipts until an actual provider refund exists.
- `POST /api/v1/user/payments/:id/check` is authenticated, owner-scoped and throttled. It verifies saved provider references rather than trusting browser return parameters. An existing successful result remains final.

### Recovery and scheduler boundary

`POST /api/jobs/payments/run` reuses the existing scheduled-job bearer authorization and runs a bounded recovery batch. It creates no second scheduler and changes neither `library_job_runs` nor the October `scheduled_job_state` runner. Each event has a two-minute renewable-by-reclaim lease. Transient event failures retry at increasing intervals up to eight attempts before Review. Callback-free session lookups have a twenty-four-check automatic budget. Unknown creation outcomes never create another session automatically.

This endpoint was exercised through its recovery service locally. Recurring invocation is deliberately unwired while the team chooses its shared runner, as recorded in Phase 6. Until that wiring exists, a signed-in owner check or an authorized on-demand recovery call processes confirmation. Do not describe callback arrival alone as immediately settling an obligation.

### Verification evidence

| Item | Result | Evidence |
| --- | --- | --- |
| Actual Xendit Test session | PASS | Created one disposable PHP 51.50 GCASH-only session, read it, validated its test checkout URL and canceled it. No payment or real payer action was attempted |
| Fixed provider boundary | PASS | Client tests cover unsafe/live checkout URLs, sanitized errors, versioned payment requests, response-size limits and rejected path injection |
| Authentication and roles | PASS | Callback token checks, real middleware checks from Phase 2, owner-only gateway check and borrower-only checkout/check route tests |
| Exact capture evidence | PASS locally | Unit tests reject authorized-only payments, wrong merchant/request/method/currency and insufficient captured principal-plus-fee |
| Concurrent session creation | PASS locally | Actual PostgreSQL attempt locks with a controlled provider produce one POST for simultaneous checkout submissions |
| Callback deduplication/order | PASS locally | Duplicate completed callbacks create one receipt/allocation; later expiry retains Succeeded |
| Financial effect | PASS locally | PHP 40 principal plus PHP 1.40 sample fee leaves PHP 60 on a PHP 100 fine; printing and confirmed lost-book charges settle once |
| Unknown creation response | PASS locally | Controlled provider creates a session then throws a timeout; retries do not create another; authenticated callback recovers and settles it |
| Changed obligation | PASS locally | Adjustment during checkout preserves captured payment identity in Review with no allocation against the changed balance |
| Recovery after failures | PASS locally | Provider outage, expired Processing lease, pending capture and a write failure after provisional Succeeded all recover without duplicate receipts |
| Refund/source protection | PASS locally | Gateway receipt source mutation and ordinary cash reversal are rejected |
| Migration | PASS locally | Applied 034 then 035 inside a unique temporary schema; finally removed the schema and stopped local PostgreSQL. Historical migration source files are unchanged |
| Regression gates | PASS | `npm test` — 399 API and 268 web tests. Type checks, build and coverage pass. Existing web bundle-size advisory remains |
| Focused security review | PASS within scope | Reviewed ownership, callback authentication, exact amounts, transaction boundaries, replay, locking, outbound hosts and secret handling. Private-value scan found no credential leaks in changed files |
| External completed payment | NOT RUN | Hosted payer completion, an actual succeeded provider payment lookup and public webhook delivery require the next approved test environment |
| Desktop/mobile payment UI | NOT RUN | No UI was added in Phase 3; payment screens and real-browser flows are later phases |

The PostgreSQL verifier uses real receipt DDL and synthetic parent records. Its provider responses for completed-payment scenarios are controlled fixtures. These tests establish local database/service behavior without claiming an actual Xendit capture or externally delivered callback. Unit coverage is separate from these integration runs and is not complete path coverage.

### Reproduce the checks

Run from the separate `StiOrmocLibrary-main-sync` feature checkout.

```powershell
npm run payments:sandbox:prepare -w @sti-library/api -- --credentials-file "C:/Users/JOHN/Documents/SSL/StiOrmocLibrary/docs/local/xendit-credentials-blank.md" --phase3
node apps/api/scripts/verify-xendit-session-contract.mjs --create-test-session
npm test
npm run typecheck
npm run build
npm run coverage
```

The session contract tool stores its fixture ID in ignored output and reuses that ID on rerun. It refuses to repeat creation after an unknown outcome and cancels an ACTIVE test fixture during cleanup. The canceled session/customer remain test audit records at Xendit. The local fixture cluster and ignored private settings remain available for subsequent phases; disposable acceptance schemas are removed.

### Remaining acceptance and rollout gates

- [x] Implement hosted-session creation and safe unknown-outcome handling.
- [x] Implement durable authenticated callback intake and bounded recoverable processing.
- [x] Verify server evidence before atomic receipt, principal allocation and balance updates.
- [x] Verify local duplicates, races, stale events, retry leases and rollback behavior.
- [x] Verify actual Test create/read/cancel with no real money or email.
- [x] Add migration 035 and update trackers to next unused 036.
- [x] Run automated gates and focused security/database review.
- [ ] Set up an approved full isolated app/database and HTTPS callback host. The existing loopback-only guard intentionally rejects the normal production database.
- [ ] Choose and wire the team's single recurring job runner, retaining the protected on-demand path.
- [ ] Complete an actual hosted sandbox payment and observe provider capture, external delivery, recovery and one local receipt.
- [ ] Integrate gateway-compatible receipt reads/PDFs, broader cash/waiver/cancellation controls, UI and reports in Phases 4–6 before enabling user-facing online payments.

Primary protocol references checked during implementation are [Create session](https://docs.xendit.co/apidocs/create-session), [Get session](https://docs.xendit.co/apidocs/get-session), [Session webhook](https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session), [Get payment](https://docs.xendit.co/apidocs/get-payment), [Webhook handling](https://docs.xendit.co/v1/docs/handling-webhooks) and [Cancel session](https://docs.xendit.co/apidocs/cancel-session).

2026-11-11 — Implemented the Phase 3 backend locally on `feat/xendit-sandbox-setup`, including safe test-session creation, durable callback events, evidence verification, bounded recovery and transactional settlement. Reserved 035, leaving recorded live migration 032 and pending 033–035. External acceptance and recurring scheduler integration remain explicit gates.

## Phases 4-5 implementation record — 2026-11-11

Phase 4 and Phase 5 implementation status: `built` locally. The overall payment plan remains `inprogress`: Phase 3 external acceptance, Phase 6 operational/reporting work and Phase 7 release/usability checks are not complete. These changes are in the separate `feat/xendit-sandbox-setup` checkout. Nothing was pushed, hosted or migrated on Supabase.

### What changed

- Borrowers can choose **Pay online** or **Pay cash at library** from their printing requests and eligible fine cards. Cash instructions do not mark a bill paid or add a gateway fee. Changing overdue fines require return or confirmed loss first.
- Online review shows principal, transaction fee, gross total, method limits and remaining fine balance before continuing. Ordinary fines allow a partial amount; printing and confirmed lost-book charges require their full balance. Fees remain clearly labelled sandbox samples.
- The shared dialog requests authoritative server quotes. Changing amount or method immediately prevents submitting an older quote. Repeated checkout clicks reuse one request key. Existing active payments can be resumed, checked or canceled, including after a page reload.
- A server result, not the browser return address, determines Paid, Partially paid, Needs review or Waiting for confirmation. Confirmed records offer the existing protected receipt downloads. Faculty can use the printing screen already permitted by the API.
- Librarian and Staff have an **Online payments** screen with status, method, service and page filters. Both can check status; Librarian alone can cancel another person's checkout or download restricted counter records. A slow earlier filter response cannot overwrite newer results.
- Cash fine/replacement collection, fine adjustments, cash-receipt reversal and printing cancellation check shared online reservations after locking the obligation. This protection remains active if new online checkout is switched off. Old installations without payment tables retain their existing cash workflow.
- Unsent cancellation is local. Once session creation starts, cancellation intent stays reserved until provider verification confirms cancellation/expiry or captures a concurrent success. An unknown outcome never permits a second collection. Captured conflicts remain in Needs review and cannot be disguised as a cash reversal.
- Charge reads now acquire their row lock in a separate statement before reading allocation totals. A checkout waiting behind a cash collector sees the committed balance, preventing a stale quote from being accepted.
- Fine and printing receipt screens/PDFs show actual method and confirmation source, principal, transaction fee and gross total. An online receipt does not claim an employee collected cash. Printing payments cannot be casually canceled after collection.
- Draft migration `040_payment_counter_and_cancellation.sql` adds cancellation intent, a method/status/date index and receipt-status protection. Enabled-payment readiness requires its column. The live tracker remains **032 applied, 033–036 pending, next unused 037**; applied migration sources were not changed.

### Verification and limits

| Check | Result and evidence |
| --- | --- |
| Real local PostgreSQL | Passed foundation, gateway and counter acceptance against uniquely named disposable schemas. The counter verifier calls existing collection/adjustment/cancellation services, not a replacement implementation |
| Competing collection | Active online checkout blocks cash and waiver. Verified cancellation permits cash with no online fee. Lost cancellation responses retain the reservation. Cancellation racing a captured payment settles once |
| Fresh balance under concurrency | Holding the obligation lock, committing a cash allocation and then releasing a waiting checkout causes the changed quote to be rejected |
| Fine and clearance accounting | Partial PHP 40 plus the remaining PHP 60 pays a PHP 100 fine without counting fees toward principal. An unreturned loan still prevents clearance; after the synthetic loan is returned and clearance refreshed, the account clears |
| Ownership and permissions | Owner-only options/read/resume/cancel, role-checked counter actions, receipt ownership and restricted staff actions verified. A caller cannot choose another payer or change amount/currency through the return URL |
| Receipt protection | Actual fine/printing receipt readback and PDF generation passed; changing gateway attribution/status through ordinary reversal is rejected |
| Desktop/mobile UI | Actual React components checked in a controlled loopback fixture at desktop, 390 × 844 and 320 × 740, including dark mode. No horizontal overflow or browser console errors were observed; payment totals and touch controls remain readable |
| Keyboard behavior | Native dialog traps focus, Escape closes it and focus returns to Pay online. The title/close control remains reachable while scrolling |
| Filters and async behavior | Status/method filtering, Staff restrictions, return-URL distrust and late-response protection have automated coverage |
| PDF layout | Two synthetic one-page receipts rendered and inspected. PHP 41.40 fine and PHP 51.50 printing gross totals, methods, fee and provider labels are readable without overlap |
| Automated gates | Root tests pass: 402 API and 275 web tests, 677 total. Type checks and production build pass. The existing large web-bundle advisory remains |
| Coverage | Coverage command passed with 402 API and 274 web tests before the final late-response regression test. Web coverage: 56.46% statements, 63.02% lines. An earlier simultaneous run encountered a pg module-resolution failure; the standalone retry passed without a dependency change. Coverage is not proof of every payment path |
| External hosted payment | Not run in these phases. No actual completed Xendit payment, public webhook delivery or full isolated application deployment was tested |
| Device/human acceptance | Browser viewport emulation only; no physical phone or Librarian usability sign-off claimed |

The UI verification uses actual application components with synthetic API responses. The database verifier uses real SQL/services and controlled provider responses with minimal synthetic parent records. Neither is presented as a real externally captured payment. The earlier Phase 3 actual Test create/read/cancel evidence remains separate.

### Reproduce and clean up

From `StiOrmocLibrary-main-sync`:

```powershell
node apps/api/scripts/prepare-xendit-sandbox.mjs --credentials-file "C:/Users/JOHN/Documents/SSL/StiOrmocLibrary/docs/local/xendit-credentials-blank.md" --phase4
npm test
npm run typecheck
npm run build
npm run coverage
```

The `--phase4` run installs 034–036 only inside its disposable local schema and runs Phase 2–4 acceptance, then drops that schema and stops the loopback PostgreSQL cluster. Windows shutdown now uses the bundled `pg_ctl` for a graceful stop, preventing orphan workers/shared-memory locks. A failed early fixture run was cleaned up before rerunning successfully. The pre-existing sandbox data and ignored private settings are retained for later phases; no actual school holdings, users or financial history were changed.

For controlled visual verification, run `node apps/api/scripts/verify-payment-ui.mjs`. It creates uniquely named QA entry files with exclusive creation, binds the API/Vite fixture to loopback ports 47145/5174 and imports the real payment components. Finish using `POST http://127.0.0.1:47145/qa/stop` so its `finally` removes those exact entry files. This run's temporary entries and browser tab were removed; QA servers and local PostgreSQL were stopped.

Ignored evidence is under `output/xendit-sandbox/`: `phase45-acceptance-final.log`, `phase45-tests-final.log`, `phase45-typecheck-final.log`, `phase45-build-final.log`, `phase45-coverage-final.log`, `phase45-filter-test.log`, `payment-review-mobile.png` and the two `phase45-*-receipt.pdf/png` samples. These receipts are synthetic QA output, not real library records.

### Tracking and remaining boundaries

- [x] Implement partial ordinary fines, full printing/replacement payment and cash coexistence.
- [x] Protect cash, adjustment, cancellation, clearance and receipt paths against competing online money.
- [x] Implement review, hosted-checkout continuation, saved result and restricted staff payment screens.
- [x] Verify real local SQL, races, receipt accounting/PDFs and desktop/mobile/keyboard behavior.
- [x] Run regression gates and review permissions, redirect hosts, integer amounts, replay and credential handling.
- [ ] Complete the Phase 3 external hosted-payment/callback acceptance in an approved isolated deployment.
- [ ] Choose and connect the team's single recurring runner; on-demand recovery remains protected and available.
- [ ] Complete Phase 6 reconciliation/reporting and Phase 7 release/human usability checks.
- [ ] Design an explicitly evidenced provider-refund workflow before exposing refunds. Current captured conflicts remain reserved for review; ordinary cash reversal is intentionally forbidden.
- [ ] Separately approve migrations/hosting and any live fee policy. Sandbox defaults remain unchanged.

2026-11-11 — Built Phases 4–5 locally: collection guards, verified cancellation, fresh locked balances, accurate online receipts, borrower payment review and restricted staff support. Added unapplied 036, preserved the live migration tracker and documented controlled-browser versus external acceptance limits.

## Phases 6–7 implementation record — 2026-11-11

**Phase 6:** `built` locally. **Phase 7:** `inprogress`; automated/security/database/PDF checks are finished, but browser, external hosted payment/callback and human acceptance are not. The previous pending runner-choice item is superseded by the owner's explicit choice to use the existing operational runner. No push, hosting, live migration, real payment or real inbox access occurred.

### Reports and reconciliation

Fine payment records and Printing payment records now show principal, user transaction fee, gross, actual method, provider payment reference, confirmation time, known provider processing cost and recorded settlement. Successful principal is counted once per issued receipt, not once per fine allocation or callback. Reversed rows remain visible but do not contribute to issued totals. Receipted cash replaces its raw cash row; older cash without a receipt remains in the report. Sandbox records are explicitly identified. Online confirmation instants and range boundaries use Asia/Manila; legacy receipt dates retain their recorded local meaning.

Online payment reconciliation reads attempts directly, including captured Review records that have no receipt/allocation. It separates captured money needing review from successful principal, with searchable/exportable provider identities. Its date filter uses attempt creation; the updated timestamp is explicitly labelled.

The older printing revenue/finance endpoints now use the same issued-receipt-plus-legacy-cash collection rule. Their service revenue excludes user fees. Revenue exports include method, fee, gross and provider reference; the supply/revenue screen links to the full payment breakdown. The financial service-result export explicitly excludes user fees/provider costs rather than presenting a bank-settlement result.

Draft migration `041_payment_reconciliation.sql` adds server-only RLS, append-only settlement evidence. The Librarian reviews a provider statement reference, processing cost and settlement date/time before confirming; gross comes from the verified successful attempt and net is generated by PostgreSQL. Matching retries are harmless; conflicting evidence, excess costs, future dates and attempts that are not Succeeded are rejected. Migration 037 also adjusts active-attempt uniqueness so a late captured exception can retain its own Review record alongside another already-active session. Captured identity and Review state are written atomically. All Review rows continue to block further cash/online collection. Unknown settlement/cost remains unknown. These manually entered records are labelled **Library recorded**, not provider/bank verified. Refund execution remains outside the approved scope.

### Operational controls

- Owner chose `modules/jobs/job-runner.ts`'s existing `operational-minute` worker. It now calls payment recovery; no second timer, scheduler or rewrite of historical October 019 tables was introduced. Local startup and the existing authorized `/api/jobs/run` path inherit this work. Deployed trigger cadence remains a hosting acceptance gate.
- Recovery handles at most five events/checks per worker call, with a 45-second admission budget; an already-started bounded provider request may finish after that admission deadline. Event leases, per-attempt throttles, finite retries and preserved history remain in effect. Transient payment failure is sanitized and stored on the existing job row while circulation work continues.
- The Librarian-only Payment recovery panel shows pending/review counts, last worker success and safe event codes. **Run recovery check** uses the same bounded service. Staff cannot run recovery, record settlement or view restricted operational evidence.
- `XENDIT_CHECKOUT_ENABLED=false` pauses new quotes and provider-session creation. Keep `XENDIT_ENABLED=true` to retain authenticated callback intake, saved checks, cancellation, receipt access and recovery for existing money. Disabling the entire gateway is not the checkout-pause procedure.
- Enabled-payment schema readiness includes 037. Recorded live latest remains **032**, pending **033–037**, next unused **038**. No applied migration file was edited or applied to Supabase.

### Verification evidence

| Check | Result |
| --- | --- |
| Regression tests | PASS — 411 API + 278 web tests, **689 total** |
| Type checks/build | PASS — existing large web-bundle advisory remains; no new package dependencies |
| Coverage | PASS — web 56.70% statements / 63.10% lines. Coverage is not a claim that every external provider/device path was exercised |
| Real local SQL | PASS — 034–037 applied to a unique disposable PostgreSQL schema, including earlier cash/cancellation/clearance/race acceptance, then removed |
| Paused checkout | PASS — rejects a new quote, retains the current attempt, accepts its authenticated fixture callback and recovers one verified receipt |
| Late captured conflict | PASS — a canceled old checkout captures after an authorized price change/new checkout; its provider identity remains Review, both attempts remain auditable, and cash/new checkout remain blocked after the newer session is canceled |
| Settlement evidence | PASS — successful matching write/retry, conflicting retry rejected, exact net calculation, immutable UPDATE/DELETE guards, browser-role denial and enabled RLS |
| Reports | PASS — online principal/fees reconcile, raw cash does not duplicate receipted cash, existing printing revenue source agrees with payment reports, Asia/Manila range includes the confirmation and CSV integrity verifies |
| PDF export | PASS — fine/printing PDFs rendered and inspected after correcting long decimal formatting; no overlapping or missing financial cells observed |
| New UI behavior | Automated tests PASS — paused explanation, recovery action, explicit Philippine settlement time/net review and separate report totals. Controlled fixture endpoints also start/read/stop correctly |
| New desktop/mobile visual check | NOT RUN — CUA repeatedly reported local browser use disabled. The owner replied that they would enable it, but access remained disabled during this run. Earlier Phase 4–5 screenshots do not validate these new screens |
| Actual Xendit Test attempt | Created an actual disposable GCASH session. Browser completion could not proceed; the bounded attempt ended without capture and canceled the active session. No completed payment or real money claimed |
| Public callback / full app / physical device | NOT RUN — still needs an approved HTTPS origin, full isolated application deployment and enabled browser/device access |
| Human usability | NOT RUN — Librarian feedback/sign-off remains required |

Review found and repaired the late-capture uniqueness conflict: the initial regression reproduced Cancelled instead of Review, then the corrected migration/atomic write and real PostgreSQL regression passed. No applied migration bytes were changed.

Combined review covered current authentication/session guards, owner and library permissions, cookie CSRF, callback authentication, redirect allowlists, integer amounts, reservation/lock ordering, idempotent financial effects, bounded recovery, report duplication, immutable evidence and browser-role table exposure. Credential scans must also pass before the local commit. This review is scoped local evidence, not a payment-provider certification or production release approval.

### Reproduce

```powershell
node apps/api/scripts/prepare-xendit-sandbox.mjs --credentials-file "C:/Users/JOHN/Documents/SSL/StiOrmocLibrary/docs/local/xendit-credentials-blank.md" --phase6
npm test
npm run typecheck
npm run build
npm run coverage
```

`--phase6` runs the earlier foundation/gateway/counter cases plus operations/report acceptance with controlled completed-provider responses. `--hosted-payment` is a separate explicit opt-in after `--phase6`: it creates one actual synthetic Test checkout and waits up to ten minutes for payer completion. Its ignored audit file prevents accidental recreation after interruption. Review its saved terminal outcome before authorizing another run; do not delete an unknown-outcome file to force a retry. The canceled Test session/customer remain provider audit records. A successful local lookup would still not prove external webhook delivery.

The hosted run's failure is recorded in `output/xendit-sandbox/phase67-hosted-acceptance.log` and `phase67-hosted-payment.json`; this is a blocked acceptance step, not a passing capture test. `phase67-acceptance.log` records the subsequent passing controlled integration run. Other ignored evidence includes `phase67-tests.log`, `phase67-typecheck.log`, `phase67-build.log`, `phase67-coverage.log`, `phase67-auth-test.log`, `phase67-ui-test.log` and `phase67-payments/printRevenue.csv/json/pdf/png`. Only synthetic records appear in these artifacts. Temporary schemas, active Test session, UI fixture entries/processes and local database listener were cleaned up; private local tools/configuration remain ignored for later use.

### Final tracking

- [x] Build reports/reconciliation evidence and operational checkout pause.
- [x] Wire payment recovery into the owner-approved existing runner.
- [x] Complete automated, security/database and PDF QA with disposable fixtures.
- [x] Prepare the separate [release/acceptance checklist](2026-11-11-payment-release-checklist.md).
- [ ] Enable browser access and inspect new recovery/settlement/report screens on desktop/mobile.
- [ ] Complete actual hosted sandbox capture and external callback/worker acceptance for the configured methods.
- [ ] Verify deployed scheduler cadence in an approved isolated environment.
- [ ] Obtain Librarian usability feedback and record sign-off.
- [ ] Separately approve any push, hosting, migration or real-money activation. Current defaults remain sandbox-only and production payments remain disabled.

2026-11-11 — Built Phase 6 locally and completed the feasible automated portion of Phase 7. The owner chose the existing runner. Added pending 037, accurate financial exports, explicit settlement evidence and a checkout-pause switch. Browser use remained disabled; the incomplete actual hosted Test attempt was canceled. External/human acceptance remains open rather than being marked finished.

## Phase 7 fresh-chat continuation — 2026-11-11

The supported browser check returned **No browser is available** in the new chat. No settings loop, native-browser fallback or alternate driver was attempted. Desktop/mobile/keyboard/dark-mode acceptance and hosted checkout completion remain blocked. The existing hosted audit records an incomplete canceled-or-terminal outcome, a null checkout URL and no public callback test. It was preserved; no new hosted session was created and no fresh provider terminal lookup is claimed.

Source review found the controlled UI fixture returned `payments` data for `onlinePayments`. A new HTTP regression reproduced that mismatch. The operations verifier now retains the actual synthetic reconciliation JSON, including the captured Review exception, and the screen fixture serves exactly one of the three requested payment report kinds. Unsupported kinds return 400 rather than another report. `view=reports&report=onlinePayments` now selects reconciliation explicitly. This is QA-tooling work only; it changes no production payment behavior.

Verification: affected `--phase6` disposable PostgreSQL acceptance passed with controlled provider completions and read-only actual provider authentication. The new fixture HTTP regression passed after failing on the report-kind substitution; script syntax checks and `git diff --check` passed. Temporary UI entries/processes and the PostgreSQL listener were stopped. The existing 689 application tests/typecheck/build/coverage/PDF checks were not repeated for these script/documentation-only changes. No rendered visual or new PDF inspection is claimed.

## Phase 7 local application continuation — 2026-11-11

Status remains `inprogress`. Supported browser access briefly worked, allowing actual component checks: recovery busy/success and paused explanation, synthetic settlement reference/cost/Philippine date and net, partial fine fee breakdown, three correct report views and narrow keyboard scrolling. Screenshots cover 1440×900 light, 390×844 light/dark and 320×740 dark selections; they are not a complete per-screen/theme matrix. Escape restored the modal opener. Complete keyboard trapping, 200% zoom, actual phone touch and Librarian sign-off remain pending. No warning/error console entries were captured. The next-turn navigation to the full app returned **Local browser access is unavailable for this chat**; repeated installation is not a remedy supported by this evidence.

Added `apps/api/scripts/verify-payment-app.mjs` and a dedicated normalized-catalog fixture. It refuses wrong databases/hosts/roles, occupied application ports and nonempty public/storage schemas; hashes selected baseline/product sources and excludes historical 002/advisor administration. Four reviewed catalog definitions are explicit test fixture DDL, not a replay of old migrations or a production migration fix. Normal application routes and the production React build run only on loopback 47146/4174. Only synthetic Student/Faculty/Staff/Librarian accounts exist. OTP password/hash/session checks are real; delivery uses a private local sink, with no outgoing email or HTTP login bypass. New checkout stays paused. Cleanup removes only this run's formerly empty schemas and private password/code file, then gracefully stops the local database.

Found and repaired two defects:

1. Pending branding 033 referred to nonexistent `library_profiles`. The app and baseline use `library_profile_settings`. Corrected the unapplied draft; full local schema readiness passes. Applied files and live tracker remain unchanged (032 applied, 033–037 pending, next 038).
2. Stopping the local worker cleared its timer but did not await the active job. The new full-app verifier reproduced a query after pool shutdown. Worker `stop()` now returns the in-flight completion, prevents later runs and is awaited during fixture restart/cleanup. A regression verifies no overlapping extra run and that shutdown waits for the database operation.

Full local acceptance passed: healthy real API/schema, all four role sign-ins, anonymous and unauthorized-role denial, other-borrower ownership denial, paused checkout with readable balance, PHP 40 cash against PHP 100 leaving PHP 60, same-key retry returning the same receipt, owner-only receipt PDF, and three real report reads plus protected CSV/PDF exports. Rendered cash receipt and fine-report PDF show the synthetic principal and remainder without clipping; Poppler reported optional Symbol/ArialUnicode font substitutions. Reconciliation provider rows/capture math remain earlier controlled SQL evidence, not actual provider capture in this full-app run. Local minute cadence/restart evidence is stored separately and cannot certify a deployed scheduler.

All work remains local in `feat/xendit-sandbox-setup`. No push, hosting, live migration, real-school mutation, real email or real funds. Actual Xendit Test capture, externally delivered callbacks, configured-method simulations and deployed cadence require the remaining prerequisites in the [acceptance runbook](2026-11-11-payment-phase7-acceptance-runbook.md). These are not marked passed by component mocks or local cash receipts.

Validation after these repairs: `npm test` passed **412 API + 278 web = 690 tests**; typecheck and production build passed. The existing web bundle-size advisory remains. The separate UI fixture HTTP regression passed. Full local schema/API/cash/export acceptance passed without the former worker-after-pool-shutdown error. This does not replace the still-pending external/browser/human checks.

## Borrower payment center and QR checkout — 2026-11-11

Status: `built` locally; external Phase 7 acceptance and live activation remain `inprogress`. Owner approved implementation locally and explicitly prohibited pushing. This extends the existing payment service instead of creating a second gateway, ledger or scheduler.

### What changed

- Student and Faculty navigation now includes Payments at `/student/payments` and `/faculty/payments`. The page separates Unpaid, Pending and Payment history. Printing bills, outstanding fines and confirmed replacement charges reuse existing owner-scoped source APIs. Printing and fine lists are paged; canceled printing bills and settled/waived/voided fines are excluded. The new outstanding fine filter runs before pagination and includes partially paid balances. Existing historical rows are not rewritten.
- `GET /api/v1/user/payments?view=pending|history&page=1` scopes both data and count to the authenticated account AND linked user. It hides automatic quote drafts, separates pending/terminal states and preserves role/session guards and private/no-store responses. Other-borrower IDs supplied in query parameters cannot change ownership. Gateway-disabled installs without payment tables return an explicit unavailable/empty list; installed historical records remain readable even with the provider off. Existing counter records remain available through their established APIs.
- The payment UI uses readable amounts, responsive neutral cards, large actions, visible labels, blue informational content, green success, amber pending and red errors. Payment actions say Pay now. QRPh appears as Scan QR only when returned in configured payment options. Instructions explain the provider-hosted transaction QR, merchant/amount review and same-phone wallet alternatives. No identity QR is changed and no fake payment QR is generated. The chosen method and reviewed total remain bound to the existing hosted checkout.
- Full printing/replacement and partial finalized-fine rules remain. Review separates principal, fee, total and remaining fine balance. Cash remains available. Successful online payments retain protected downloads; the new history also preserves counter receipts including legacy manually verified methods without listing Xendit receipts twice as counter payments.
- Refresh reloads bill sources and payment options. Returning from checkout performs up to four automatic saved-status checks at 15-second intervals, stops on terminal states and retains manual refresh. Provider reconciliation remains server-throttled. An address claiming success cannot set Paid.
- The shared Button now supports an accessible label for receipt-specific download actions. No new UI library or runtime dependency was added.

### Eight-rule integration record

Fetched origin; `origin/main` was already an ancestor (seven feature commits ahead, zero main commits missing at start), and `git merge origin/main` reported Already up to date. No conflicts. Main's lockfile is unchanged; `npm install --ignore-scripts --no-audit --no-fund` reported up to date. No MySQL runtime or mysql2 was introduced. No migration was added or applied, and applied migration sources were untouched. Recorded live tracker remains 032, pending 033–037, next unused 038; this run makes no new live-checksum claim. Existing documentation and feature logic are preserved. Work remains on `feat/xendit-sandbox-setup`; push, PR creation, merge into main, hosting and live payments are not authorized by this local implementation request. The existing operational runner remains the only active scheduler.

### Validation and limits

Tests were written failing first for the owner-scoped list/route, outstanding balance filter, QR review, payment center, legacy record display and provider-off history reads. Regression passed **418 API + 283 web = 701 tests**. Typecheck, production build, coverage and the UI fixture HTTP regression passed; the existing bundle-size advisory remains.

The full isolated application verifier passed schema health, four real role sign-ins (local OTP delivery sink), unpaid fine reads, own QR quote/prepare, pending ownership, cancellation before provider creation, terminal/provider-off history, cash balance/idempotency and protected CSV/PDF exports. Sample QR fee is still PHP 1 + 1%, not an approved live rate. Controlled-provider PostgreSQL acceptance additionally verified QRPH-only session creation, PHP 41.40 total for PHP 40 principal, capture matching, PHP 60 remainder and one receipt after repeated callbacks. It did not scan a real QR, move real funds or certify merchant channel enablement.

Combined local review covered authentication, owner predicates on both rows/counts, read access during outages, immutable accounting reuse, safe hosted redirects, fee/amount binding, canceled/paid source filtering, React async cleanup, accessibility labels, pagination and fresh-source refresh. It found/fixed legacy Paid rows appearing as outstanding and history being hidden by a disabled gateway. No claim of external provider/security certification or visual acceptance is made. The Ethan wiki/core path is absent on this computer; the durable continuation is recorded here without editing unavailable private wiki files.

Supported browser access still returned unavailable. Consequently this revision has no new desktop/mobile screenshots, visual/keyboard sign-off or actual hosted QR acceptance. The UI harness now supports `?view=payments` for a later supported browser inspection. A first full-app probe coincided with build output replacement and returned 404; rerunning after the build passed. Keep build and full-app screen serving sequential. Real Xendit Test checkout scanning/callback delivery, per-method device tests, approved actual rates, live configuration and owner-approved hosting/release remain explicit outstanding gates.

The new [acceptance runbook](2026-11-11-payment-phase7-acceptance-runbook.md) gives exact local URLs, a visual/keyboard matrix, role/device/Librarian tasks and the target isolated full-app topology. It identifies why the minimal service schema cannot satisfy the ordinary app's `public` schema health check. A complete local application bootstrap, approved HTTPS origin, external callback/runner evidence, configured method outcomes, deployed cadence and human sign-off remain open. No push, deployment, public exposure, live migration, email or real-money action was performed. Migration tracker remains live 032 / pending 033–037 / next 038.
