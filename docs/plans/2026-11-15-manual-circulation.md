# Manual borrowing and returns

Why: staff need a visible fallback when a borrower has no QR code or a scanner is unavailable.
Date created: 2026-11-15
Date last updated: 2026-11-15
Status: built

## How

Add Enter manually at the library counter. Find an active linked borrower by exact
School ID, review their identity, enter the physical book barcode and confirm through
the existing desk checkout. Returns accept a typed barcode or the existing Return
book action on a selected loan. Never identify a physical copy by ISBN alone.
Existing enrollment, attendance, balance, loan-limit, condition and reservation rules
remain enforced. Manual entry may record attendance after staff choose Check in here;
it shares operating hours/capacity controls and records the staff member and Manual
source in the existing attendance ledger. Retry keys bind borrower and actor.

Source review: Administrative System Flow page 1 includes Manual Input alongside
Barcode Scan. Final Draft pages 7, 18 and 22 describe physical-copy circulation and
transaction monitoring. Current owner request explicitly approves a QR-free fallback.

## Implementation tracking

- [x] Staff-only exact School ID lookup and manual entry with existing ledgers.
- [x] Visible mobile-friendly manual borrowing/return entry and review.
- [x] Retry, authorization, policy and UI regressions. 717 API and 460 web tests, typecheck and build passed.
- [x] Tests, coverage, typecheck, build, local synchronization, GitHub push and Vercel checks. Browser visual verification remains incomplete as disclosed below.

No migration or new dependency in the application. Applied 044, next 045 unchanged.
No real loan or return will be submitted for browser verification.

## Change log

- 2026-11-15: owner authorized manual circulation, GitHub publication and deployment.
- 2026-11-15: implemented exact School ID fallback, idempotent manual attendance with staff provenance, and typed book/return entry. Confirmations retain server eligibility and assignment checks; no public QR-validation behavior was weakened. Combined manual diff review covered security, correctness, React input/state preservation, mobile layout and existing SQL contracts. Coverage and publishing are in progress. Browser control ended because the Windows tool could not verify Chrome's current URL; no further browser automation was attempted. Live visual verification is therefore not claimed.
- 2026-11-15: `npm test`, `npm run typecheck`, `npm run build` and `npm run coverage` passed: 717 API and 460 web tests. Overall API line coverage is 74.82%; web line coverage is 68.4% (statement coverage 61.09%); the repository remains below 80% overall. Manual borrower lookup line coverage is 100%. No application dependency was added. Compared the release's changed applied migration files 033, 035, 036 and 044 to the live ledger; all SHA-256 checksums match. Payment drafts 040–043 remain unapplied. `mysql`/`dbDriver` search in active code and manifests was empty. The manual patch applied cleanly to the existing local integration checkout. Publication/deployment remain pending.
- 2026-11-15: pushed `codex/manual-borrow-return` and opened draft [PR #37](https://github.com/JohnBazty/StiOrmocLibrary/pull/37) into main. It retains the current verified hosted payment release and merges current main without conflicts; main itself was not changed. Deployed source `b567b3b`, production `dpl_3wcXiyojseQ8RAgFyxyED3zXJBpe`, to the canonical site. API health is healthy/schema-ready; anonymous POST to manual-check-in returns 401. Following the live HTML's module manifest confirmed the actual counter JavaScript returns 200 and includes Enter manually and School ID. A read-only check against the school database resolved the known borrower's exact School ID successfully. Local typecheck and five new backend checks passed. No live attendance, loan, return, payment or transfer was created for verification. Chrome's URL safety verification stopped interactive browser control; no subsequent browser automation was attempted.
