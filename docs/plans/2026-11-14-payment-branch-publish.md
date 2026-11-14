# Payment branch publication

Why: the owner requested a separate GitHub branch containing the latest local payment work.

Date created: 2026-11-14 (Asia/Manila)

Date last updated: 2026-11-14

Status: built

## How

Branch codex/payment-updates starts from the existing reviewed payment-local-integration checkout. It retains its previously integrated cookie sign-in, audit/lazy loading, durable runner and real-SQL test dependencies. Latest payment source, print/fine/clearance synchronization, transaction history, wallet checkout, refunds, withdrawal/funds UI and return bridge are included. The circulation audit's separate additions and the unfinished PR 36 review are excluded using the saved pre-integration source images. Neither existing working checkout is switched, reset, stashed or committed.

No private environment file, credentials sheet, payment attempt ledger, school upload, browser session, operational QA script or generated output is published. Publishing is not deployment or payment activation. Payment migrations 040–043 remain unapplied; the existing single runner retains payment recovery. Preserve applied migration source bytes and reconcile main before pushing.

## Implementation tracking

- [x] Owner approved a separate branch and push
- [x] Reconstruct latest payment work without separate circulation/PR36 changes
- [x] Check changed/new source for supplied credentials and actual student ID; no matches
- [x] Reconcile current main, migration source and dependencies
- [x] Run tests, typecheck, build and coverage; inspect security-sensitive payment boundaries
- [ ] Push and verify GitHub branch and exact commit

## Change log

- 2026-11-14: Prepared isolated codex/payment-updates without disturbing the running checkout or pending PR36 review. Hosting, migrations and real transactions remain unrequested.

## Verification and limits

- 577 API tests and 392 web tests passed (969 total); typecheck, build and coverage commands passed. API/web coverage remains below 80% overall; web line coverage is 65.91%. No new live financial transaction or browser mutation was performed for this publication. Existing payment UI checks remain earlier acceptance evidence.
- Source and 608 unique branch-history blobs were checked for supplied Google/Xendit credentials, private keys, the owner's student ID and supplied personal passwords: no matches. Only the expected blank .env.example template is tracked; no private env, credentials sheet, local ledger or school upload is included.
- Combined review checked payment ownership, cookie/CSRF guards, Librarian permissions, test-only fixture credential gates, provider confirmation, payment/refund/withdrawal state updates and the single durable recovery runner. Local preview refuses production/Vercel, keeping private fixture ledgers separate from real school balances.
- Fresh dependency audit reports 18 advisories: 8 moderate, 7 high, 3 critical (concurrently, proxy-addr and shell-quote). This publication preserves existing dependency ranges and documents that debt; it does not claim deployment readiness or run a broad breaking npm audit fix.
- Live schema source checks confirmed local 033/034/035/036 match the live checksums. Applied 037 book register, 038 research optional details and 039 category kind are external catalog work; no applied file was renamed or rewritten. Only unapplied payment files were moved to 040–043 and exact filename references updated. Main's lock was taken and npm install restored this branch's needed dependencies; mysql2 remains absent.
- Automatic deployment is disabled specifically for codex/payment-updates in vercel.json. Main and Vercel were not changed, no live migration was run and no PR was opened.

Publication scope is a review branch containing the latest payment work and its earlier auth/audit/runner integration prerequisites. It does not include the separate circulation audit's unmerged additions or the unfinished PR36 merge review.
