# Payment release and acceptance checklist

| Field | Value |
| --- | --- |
| Date created | 2026-11-11 |
| Date last updated | 2026-11-11 |
| Status | `inprogress` |
| Why | Keep local sandbox evidence distinct from external acceptance and real payment approval |
| Related plan | [Xendit phases](2026-11-11-xendit-sandbox-payments.md) |

## Current release boundary

Only Xendit Test credentials and a dedicated loopback `sti_xendit_sandbox` database are allowed. Production database URLs and live keys are rejected. This work does not enable payments on the hosted school system, apply migrations, push or deploy. Real-money release is a separate future change and owner instruction.

Recorded live migration is 032. Draft 033 branding and payment drafts 034–037 are not applied. Next unused is 038. Match every applied checksum and filename before any separately authorized migration; do not edit applied history or dismiss the previously documented 003 discrepancy.

## Local technical acceptance

- [x] Full printing/replacement and partial ordinary fine payments use server-calculated principal and fees.
- [x] Ownership, active/revoked session handling, library roles, cookie CSRF and account rate limits are covered.
- [x] Wrong callback credentials/evidence, duplicate callbacks, stale expiry and browser-return spoofing cannot create a payment.
- [x] Cash, waiver and cancellation races retain one financial effect; lost provider responses keep a reservation for review.
- [x] Recovery preserves callbacks, reclaims expired leases and rolls back provisional success on a financial-write failure.
- [x] Pausing new checkout leaves existing confirmation, cancellation and recovery operational.
- [x] Fine and printing reports separate principal, user fees, gross, known provider costs and library-recorded settlement.
- [x] Old cash rows remain identifiable and are not counted twice. Receipt source and settlement evidence are protected.
- [x] A late captured payment can retain Needs review evidence alongside a newer checkout. Unallocated captures appear in Online payment reconciliation and block further collection.
- [x] Existing operational-minute runner chosen by the owner; no second scheduler added. Local recovery logic is exercised against real PostgreSQL.
- [ ] Confirm the approved deployed scheduler calls that runner often enough for the chosen hosting plan. No hosting configuration was changed here.
- [ ] Finish browser and physical-device checks as recorded in the implementation plan.
- [ ] Record Librarian usability feedback after reviewing the actual screens. An automated pass is not human sign-off.

## External sandbox acceptance still required

The [Phase 7 acceptance runbook](2026-11-11-payment-phase7-acceptance-runbook.md) records scoped component browser evidence, the renewed connection failure, the full isolated local app and required external/human evidence. Four normal role sign-ins, local OTP verification (delivery sink only), role/ownership boundaries, partial cash/retry/receipt protection and real CSV/PDF report exports passed. Actual hosted capture and external callbacks remain untested.

1. Prepare a complete isolated application/database with synthetic accounts, an approved HTTPS callback/return origin and current draft migrations. Do not point the sandbox at school records. The current loopback-only guard deliberately prevents using the normal production database.
2. Set the Test callback token on the backend and matching Test-mode Xendit webhook. Do not expose keys in frontend code, the database, logs, screenshots or tracked files.
3. Finish one real hosted Test payment, verify provider capture and exactly one local receipt. Returning to a success URL alone is insufficient.
4. Observe an actual externally delivered callback being saved, recovered by the approved runner and reconciled. Repeat duplicate/outage/restart scenarios using disposable charges.
5. For every method actually enabled and configured for the merchant, test its documented simulator, minimum/maximum total, cancellation/expiry and failure path. Current controlled integration examples use GCASH; this is not a claim that all 12 documented method families have passed hosted acceptance.
6. Confirm cash collection remains usable, partially paid fines keep their balance and clearance still checks unreturned items.
7. Review the Needs review list and settlement reports with the Librarian. Captured conflicts stay reserved. Actual refund execution remains unavailable until a separately approved evidenced workflow exists.

The [Xendit simulator reference](https://docs.xendit.co/apidocs/simulate-payment-test-mode) documents a Test-only payment-request simulation. Its immediate PENDING response is not proof of capture. The hosted session must first create its method-specific payment request; do not invent a successful callback or insert a receipt manually to pass acceptance.

## Operator actions

- **Online payments:** filter Needs review, check an existing payment, cancel only with provider confirmation and download its protected payment record.
- **Payment recovery:** read pending/review counts and run a bounded check. This does not create a new checkout. Errors stay visible for follow-up.
- **Settlement evidence:** use the provider statement's reference, processing cost and settled date/time. Review the net amount, then confirm. This is library-recorded evidence, not an automatic bank verification; the original evidence is immutable.
- **Reports:** choose Fine payment records, Printing payment records or Online payment reconciliation, apply Asia/Manila dates/search/status and export matching CSV/PDF rows. Reversed records stay visible but do not contribute to issued totals. Captured attempts needing review are separate from successful principal and remain visible without a receipt.
- **Pause checkout:** set `XENDIT_CHECKOUT_ENABLED=false` and keep `XENDIT_ENABLED=true`. Existing money must finish reconciling. Disable the entire gateway only after resolving outstanding work and preserving callback delivery.

## Before any real-money release

- [ ] Owner separately approves production hosting/migrations and activation.
- [ ] Replace the test-only runtime boundary with a reviewed live environment/data policy; no production change is included in this implementation.
- [ ] Approve actual merchant rates, taxes, fee disclosure and limits. PHP 1 + 1% remains a sandbox sample.
- [ ] Confirm merchant onboarding, supported methods, settlement accounts and who handles discrepancies/refunds.
- [ ] Retain immutable receipt/allocation evidence, protected backups, least-privilege database access and credential rotation procedures.
- [ ] Verify recurring runner cadence, alert ownership and a rehearsed checkout-pause procedure.
- [ ] Complete security review, full end-to-end acceptance and Librarian sign-off; record date and responsible person.

## Change log

2026-11-11 — Browser briefly became available: tested recovery, settlement, partial fine review and three report components at desktop/mobile widths; retained screenshots with explicit keyboard/zoom/device limits. Full app browser navigation subsequently failed again. Added the guarded synthetic full-app verifier, corrected pending 033's table name and made worker shutdown await its active run (regression covered). Normal sign-in/access, cash remainder/idempotency and protected exports passed. No hosting, live migrations, provider capture or real email was performed.

2026-11-11 — Fresh chat browser check returned **No browser is available**. Reviewed and preserved the terminal incomplete hosted audit; no new provider checkout was created. Reproduced and fixed the QA fixture returning fine records for Online payment reconciliation, then passed its HTTP regression and affected disposable PostgreSQL acceptance. Added the detailed acceptance runbook. Browser/full-app/external/device/Librarian gates remain open.

2026-11-11 — Created a separate acceptance/release checklist while implementing payment Phases 6–7. External delivery, actual hosted capture, physical-device checks and human approval remain explicit gates.
