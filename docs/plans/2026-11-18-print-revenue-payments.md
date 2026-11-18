# Printing revenue connected to confirmed payments

| Field | Value |
| --- | --- |
| Why | Keep printing revenue and its details current when cash or online payments are confirmed |
| Date created | 2026-11-18 |
| Date last updated | 2026-11-18 |
| Status | built |

## How

The PostgreSQL report reads issued printing receipts, including confirmed online
receipts, once. Cash rows predating receipts remain included; a cash row with any
receipt is never counted a second time, including when its receipt is reversed.
Confirmed active historical entries remain included. Receipt principal is revenue;
online fees are excluded. Original transaction values are preserved through receipt
snapshots. Payment method is shown in the details and revenue PDF.

The new protected, uncached `/api/v1/admin/printing/revenue` read returns cards and
details from one database query. The screen uses the shared visible-page polling
hook, with one-second refresh, no overlapping reads, retry backoff and recovery on
focus/reconnection. Successful local printing actions request an immediate refresh.
Revenue loads independently from restock history. Background failures retain the
last successful data and show a readable retry message.

This checkout lacks the separate branch's gateway service. This change consumes its
confirmed receipt contract; it does not activate or deploy online checkout. Actual
provider capture/callback acceptance remains open as documented in the payment
release checklist. No real payment is simulated as school revenue.

No migration is required. Recorded applied Postgres remains 032; payment branch
drafts 033–037 remain unapplied (next unused on that branch 038). MySQL reference
048 / next 049 is unchanged. Existing applied views are not rewritten.

## Implementation tracking

- [x] Trace cash recording, online branch settlement contract and current report source.
- [x] Share confirmed receipt source across revenue and financial report reads.
- [x] Return a consistent card/detail snapshot and refresh automatically.
- [x] Show payment methods and preserve data during updates/failures.
- [x] Run regression tests, type checks and isolated PostgreSQL verification.
- [x] Record final validation and remaining gateway acceptance limit.

## Change log

2026-11-18 — Owner requested cash/online payment connection and automatic revenue
updates. Found cash-only report view and load/manual-only refresh. Added compatible
receipt reads without applying migrations or merging the separate gateway branch.

## Validation

- 31 printing API tests passed, including centavo totals and unknown quantities.
- 44 targeted web tests passed: automatic cash/online updates, retained data after
  failures, manual retry, initial-error messaging, shared polling and refresh controls.
- Both workspace type checks and the full production build passed. Vite retains
  its existing large-chunk advisory.
- `node apps/api/scripts/verify-print-revenue.ts` passed against PostgreSQL using
  connection-private temporary tables inside a rolled-back transaction. Confirmed
  cash, a synthetic online receipt, pre-receipt cash and historical records total
  once; reversed/unpaid/voided entries and the next Manila day are excluded. An
  online principal of PHP 60 with PHP 7 fee contributes PHP 60. Summary matches
  details. No real school record or permanent schema was changed.
- No live provider checkout/callback was performed. The separate gateway branch,
  activation and external acceptance remain outside this reporting repair. No
  push or deployment was performed.

2026-11-18 — Completed report implementation and automated/isolated-database
validation. Recorded the outstanding provider integration boundary explicitly.

## Vercel release — 2026-11-18

Owner requested hosting, then explicitly requested no further tests. Prepared
`C:/Users/JOHN/AppData/Local/Temp/sti-print-revenue-release-20261118` from the
existing production release rather than uploading the older working checkout.
The release retains the deployed online/counter payment collection query,
partial-payment handling and per-request output totals. Added a single-read
summary/detail snapshot and independent revenue loading using the production
30-second polling policy, payment-change events and retry handling. The release
also preserves concurrently published schedule/notification and sign-in wording
changes from their staged source. No environment variables or database migrations
were changed. The earlier one-second local polling description applies to this
checkout; the hosted release retains its existing 30-second refresh cadence.

Initial candidate: dpl_D5Tu8NChFRiwfpVeAeTP4h5AAWob (ready without public promotion).
Combined production deployment: dpl_Bfm7TeEEyFvpPS3mL1kyd77fReo4 (READY and aliased).
No additional tests or live payment actions are performed after the owner's
hosting-only instruction.
