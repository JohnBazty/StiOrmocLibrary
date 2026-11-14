# Demo wallet and simplified Library funds

Why: provide the owner-approved demonstration payment journey and remove duplicate bank-transfer controls for nontechnical personnel.

Date created: 2026-11-13

Date last updated: 2026-11-13

Status: built

UI follow-up (2026-11-13): the inline wallet presentation described below has been superseded by the [dedicated library wallet payment page](2026-11-13-dedicated-wallet-payment.md). It uses ordinary Payment/PIN labels and library branding, retains fixed-fixture credentials and all provider-only confirmation guards, and preserves fields when switching tabs. Earlier provider and funds evidence below remains applicable; no real GCash credential collection was introduced.

## How

Local application only, on codex/payment-local-integration in StiOrmocLibrary-main-sync. Keep existing work and financial history. No push, hosting, new dependency, schema change or migration. Applied migration remains 036; next unused 042.

GCash review uses a clearly identified Demo wallet, ten fixed Philippine-format numbers and fake PINs. These identifiers are not verified phone subscribers or wallets. No SMS, lookup or real credentials. Validate the fixture server-side, discard its credentials immediately, and create the existing development-only Xendit hosted session using the server's reviewed amount. Save intent before provider writes. Continue to Xendit's approval screen and return through the existing confirmation path. Verify the session and captured payment before applying the existing local payment credit. Ambiguous provider responses remain held for review, never automatically replayed. Existing hosted QRPh and hosted GCash remain intact. Authentication, ownership, CSRF and rate limits apply; live credentials cannot use the demo route.

### Provider capability result

The official [payment simulation endpoint](https://docs.xendit.co/apidocs/simulate-payment-test-mode) was checked against a disposable GCash development request. Xendit returned HTTP 400 `PAYMENT_METHOD_NOT_SUPPORTED`. The unused request was cancelled and independently read as CANCELED. Consequently the final feature uses supported [hosted sessions](https://docs.xendit.co/apidocs/create-session), with actual Xendit approval still required after the demo PIN. The client never claims a PIN authenticates GCash or marks a bill paid. No undocumented simulator endpoint, fake success, second payment ledger or provider approval bypass was added.

The backend returns the public demo fixture list only when the guarded local development configuration is available. The web flow has number and masked PIN steps, show/hide PIN, example details, amount/fee review and immediate PIN clearing. It uses no browser credential storage. The dedicated endpoint accepts no client amount or provider identity; the quote binds owner, charge, channel, fee and current balance.

| Demo mobile number | Fake PIN |
| --- | --- |
| 09174826315 | 4826 |
| 09183957264 | 7104 |
| 09196281437 | 3958 |
| 09207539618 | 8261 |
| 09218645729 | 6049 |
| 09275418362 | 1537 |
| 09356872941 | 9682 |
| 09453791682 | 2475 |
| 09568247315 | 5316 |
| 09982365147 | 8093 |

Library funds has one balance area, one school-bank area, one withdrawal action and one additions action. Merge additions, withdrawals and refunds into one filtered activity list without deleting legacy local records. Keep cash separate, additions out of revenue, provider balance limits, fee review, exact centavos and automatic status recovery. Advanced setup stays collapsed.

## Implementation tracking

- [x] Demo fixtures, guarded endpoint and supported provider creation/cancellation
- [x] Responsive number/PIN journey and existing result navigation
- [x] Consolidated funds and activity interface
- [x] Regression, provider creation/cancellation, typecheck, build and coverage
- [x] Admin funds/withdrawal desktop and mobile browser checks
- [x] Student sign-in and paid/refunded history inspection
- [ ] Student wallet journey and manual Xendit approval/return (QA PDF upload waiting on Chrome file-URL permission)

## Verification

- Full suite: 563 API and 375 web tests pass (938 total), including all ten fixture pairs, disabled/live-key guard, wrong PIN/unknown number, foreign account/role, CSRF, duplicate/uncertain submission, capture mismatch and financial database read-only assertions.
- Web checks cover amount preservation, routing to the demo endpoint, Xendit handoff, PIN visibility/clearing, one withdrawal/addition action, merged/filterable history, automatic details/balance updates and post-mutation reads that cannot reuse older results.
- `npm run typecheck`, `npm run build`, `npm run coverage` pass. Coverage remains below the project-wide 80% goal: API line coverage 72.10%; web line coverage 65.40%. This feature does not resolve that existing repository-wide gap.
- Actual development hosted session creation and cancellation passed through the new demo endpoint's service using a synthetic charge/in-memory ledger. The demo PIN did not settle it. No school database connection, owner payment ledger change or financial-table writes occurred in provider QA. Evidence: ignored `output/demo-wallet-qa/hosted-provider-result.json`.
- The earlier direct-request capability probe was cancelled, confirmed CANCELED and preserved in ignored `output/demo-wallet-qa/provider-result.json`. No actual wallet number/PIN was sent to Xendit. Browser inventory returned `Local browser access is unavailable for this chat`; visual appearance, real mobile device behavior and manual Xendit approval/return for this new journey are not claimed verified.
- No deployment, push, migration, new scheduler, dependency change or real-money transfer.

### Chrome follow-up — 2026-11-13

Resetting the browser-control session restored access to the existing Chrome library tab. Restarted the same latest local application and verified API health HTTP 200. No permission bypass or installation was required. The earlier connection failure is historical, not the current browser status.

Verified Admin Library funds at desktop 1440 × 1000 and mobile 390 × 844. No horizontal document overflow; one withdrawal action and one additions action. Activity filters correctly separate provider withdrawals, additions and refunds while retaining the earlier local withdrawal. Refresh preserves the current confirmed balance. The withdrawal form automatically selects the saved masked school bank, and blocks amounts exceeding available funds plus the transfer fee before submission. Open completed-refund details show Refunded/Done with no repeat Check status action. These checks did not submit a withdrawal, bank addition or refund, and did not alter school financial rows.

Corrected the bank verification label's inline icon/text alignment after visual inspection. Twelve affected web tests, typecheck and build passed again. Screenshot evidence remains ignored: `output/demo-wallet-qa/funds-desktop.png`, `funds-mobile.png` and `withdrawal-mobile.png`. Device dimensions are Chrome emulation; no physical phone claim is made. Student sign-in and the new wallet's approval/return check remain in progress.

### Student follow-up — 2026-11-13

Student sign-in succeeded after the owner completed email verification. Existing charges are already paid/refunded in the local payment view; the absence of a new Pay action on those records is correct. The owner approved a single clearly marked one-page QA print request, with no physical printing and no real-money movement. Its PDF is in ignored output. Chrome refused automated file selection until the owner enables the extension's "Allow access to file URLs" setting, so no new request or checkout has been submitted yet.

Browser inspection found two Dashboard inconsistencies: it still displayed official school fine amounts despite confirmed local credit, and its latest-print card displayed a request already cancelled by a confirmed refund. The dashboard now reads the same account-scoped clearance/payment view without writing its cache, and reuses the printing repository's owner-joined projection to exclude completed/cancelled requests before selecting the latest job. Added a failing-then-passing read-only clearance regression and real-SQL printing projection checks. A read-only runtime check confirms the corrected standing, cleared status and absence of an active refunded print job. Existing school financial rows are unchanged. Full tests (564 API + 375 web = 939), typecheck, build and coverage passed after the repairs. No passwords, codes or student identifiers are recorded in this document.

## Change log

- 2026-11-13: Owner approved implementation of the chat plan, unique varied-digit demo fixtures and simple funds UI. Local-only scope preserved.
- 2026-11-13: Capability check rejected automatic GCash API simulation; used hosted provider approval fallback. Removed unused direct-request code and cancelled its disposable request. No school records changed.
- 2026-11-13: Consolidated balances, bank management and transfer/refund/addition history. One withdrawal action, masked saved bank, amount-plus-fee check, preserved local records and fresh reads after mutations. Browser inventory explicitly reports local browser access unavailable; desktop/mobile visual checks remain unverified.
- 2026-11-13: Chrome connection recovered. Admin desktop/mobile, filters, withdrawal validation, refresh and completed refund details verified. Corrected the bank-label alignment; Student checkout check continues separately.
- 2026-11-13: Student browser inspection exposed and repaired Dashboard fine/print-card inconsistencies. Owner approved one disposable print request for checkout QA; upload remains pending Chrome's file-URL permission.
