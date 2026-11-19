# Add only fines and borrowing-policy features to the restored live site

**Date created:** 2026-11-18
**Date last updated:** 2026-11-18
**Status:** inprogress

## Why

The owner requested the new feat/fines-and-borrowing-policies features on Vercel while retaining the dashboard and full existing live experience from deployment dpl_6VS6DpgeoHtMXbnRhVkqGpeUacHG. Main uses a different dashboard/sidebar and is not the deployment baseline.

## How

Reconstruct the exact saved production source and verify its source-file SHA-1 values against Vercel's source manifest. Add the restored borrowing-policy editor, protected Fine rules API/page, due-instant policy selection, closing-time and fair-fine fixes, and only their navigation links within the existing File maintenance group. Keep the original dashboard, shell, grouped-sidebar renderer, payment features, dependencies and deployment configuration byte-for-byte intact. Preserve cookie-based authentication and CSRF tokens; do not import the branch's older browser token client.

Existing applied migrations 038 and 040 are retained as unchanged source records; no migrations or live database writes are part of this task. Current repository tracker records applied 041 and next unused 042, which reflects separate enrollment work. This deployment does not import that unrelated work.

## Implementation tracking

- [x] Recover and hash-verify the restored live source snapshot (1054 files).
- [x] Add only selected fines/policy features and grouped-menu links.
- [x] Verify 36 protected dashboard/shell/config files match the live baseline.
- [x] Reproduce the browser-client authentication incompatibility with a failing regression test and adapt to the existing cookie/CSRF boundary.
- [ ] Pass relevant tests, full checks, coverage and build.
- [ ] Review security, correctness, React, and database compatibility.
- [ ] Check the new UI locally with available browser tooling.
- [ ] Verify a production candidate, promote to Vercel, and confirm live health and feature assets.

## Change log

- 2026-11-18: Owner explicitly requested selected features only on the restored live baseline. No merge of main or full replacement of its dashboard is used. The first broad API test run was interrupted during resource contention; initial frontend failures included timing-sensitive unchanged import/supply tests. These are not claimed as passing. Fine rules initially failed type checks because the branch's getAccessToken helper is absent from the live cookie-based source. Added a failing client regression test before repairing that integration.

## Verification and review

- Focused API suite: 47 passed; focused web suite: 15 passed.
- Full API suite: 840 passed, 8 failed of 848. The same failures reproduced on the unchanged baseline: five attendance-credential fixture expectations, one job-handler fixture expectation, and two printing integration fixture queries missing `documents_expired_at`.
- Full web suite: 607 passed, 8 failed of 615 across 136 files. All eight failures reproduced in the baseline tests (password recovery labels, attendance shortcut expectation, circulation dashboard expectation, print supplies, collection review, holdings save-error labeling and quotation preview).
- `npm run coverage` ran and failed at the same baseline API failures, preventing the chained whole-web coverage run. Focused web coverage ran successfully. API coverage reports fine-calculator statements 98.53% and fine-policy service statements 100%; these are not whole-product coverage claims.
- Type checks and build pass after adapting the new Fine rules client to cookie sign-in and CSRF. The shared dashboard, shell, CSS, dependency manifests and Vercel configuration pass an exact 36-file baseline hash check.
- Local Chrome browser verification used synthetic data and intercepted local API reads only. Both policy pages, dialogs, desktop/mobile layouts rendered without page errors or horizontal overflow. Screenshots were visually inspected; no live sign-in or write was performed.
- Manual combined security/correctness/React review: new APIs remain behind active-account auth, global CSRF and Librarian `library.manage` authorization. Inputs are validated server-side and values are parameterized. Publish uses a transaction, advisory lock, row lock, immutable historical rates and audit notification. UI reviews changes, preserves errors, and focuses/traps dialogs. No new dependencies or client secrets. Fixed the cookie/CSRF compatibility issue found during review. No remaining release-blocking finding in the selected diff. Separate review agents could not finish, so these are manual reviews, not agent approvals.
- Manual database/concurrency review: copied migration source bytes are preserved; no new schema or ledger changes are proposed. Fine-rule publish serializes writers, updates effective ranges and selects each loan's rule at its due instant. Existing transaction callers preserve current circulation behavior and long-overdue handling. No live migrations or database writes were run.
- The baseline-first comparison deliberately uses the recovered live snapshot; comparing the entire recovered snapshot to GitHub main would mix unrelated pre-existing production changes into this feature.

## Known limits

Whole-product tests and coverage are not green because the saved production snapshot includes the verified failing tests above. These unrelated product areas were not rewritten. The plan remains inprogress for broader baseline test remediation; hosting the selected features is separately tracked below. The restored dashboard is preserved by source hashes, not by making any production account or loan changes.

## Newer deployment reconciliation

A separate production deployment dpl_76zoCyMhYfnwmVoHrTzx1PtvxHSZ replaced the feature-only release after it was promoted. Its bundle omitted Fine rules. Recovered that exact latest source, retained all dashboard and enrollment files, and applied only feature commit 321e99a cleanly without conflicts. This release preserves the latest live enrollment additions as well as its dashboard. No main merge or database write is involved.
