# Vercel catalog and payment release



Why: owner authorized updating Vercel to the latest catalog and payment features.



Date created: 2026-11-15 (Asia/Manila)

Date last updated: 2026-11-15

Status: built



## How



Combine payment branch 265cdaa with the verified circulation/catalog integration and merged PR #36. Preserve the current UI, cookie/CSRF guards, school data and single Manila-time runner. Resolve overlapping files using the already verified local integration. Publish only committed source, never private environment files, payment fixture ledgers or school files.



The existing payment implementation deliberately refuses production and uses local files. Add an explicit hosted-practice configuration restricted to development Xendit keys and the approved library origin. Keep the real settlement gateway disabled. New migration 044 adds one API-only, RLS-protected JSON ledger for attempts and funds, separate from real obligations and receipts. A 120-second fenced lease serializes writes across serverless workers; each save commits before provider calls so a lost response retains recovery evidence. An expired writer cannot overwrite or release a newer lease. The small independent storage pool avoids waiting for the school connection already held by counter workflows.



Hosted payments retain the existing owner-scoped status polling, provider evidence verification, refund-before-printing rule, permissions, cash history and payment/refund/withdrawal UI. Successful practice payments affect only displayed practice credits. Local file history is not uploaded. New practice history is persistent from activation onward. Real bills and real funds remain untouched. Refunds/payouts are enabled only if already allowed in the owner's existing local practice configuration. Return URLs point directly to the HTTPS library site.



## Implementation tracking



- [x] Combine reviewed source and latest main/PR36 without disturbing dirty working checkouts.

- [x] Add isolated hosted store/config tests: persistence, crash evidence, fencing, lease recovery and denied browser-role access.

- [x] Refresh compatible dependencies: production critical/high advisories removed; two moderate ExcelJS/uuid advisories remain, requiring an incompatible downgrade to auto-fix. No forced upgrade/downgrade.

- [x] Full tests: 699 API and 453 web passed (1,152 total); typecheck/build passed. Combined correctness/security/SQL review checked provider evidence, role/owner guards, CSRF, fenced storage and immutable applied migrations. Production dependency audit now has zero critical/high and two moderate ExcelJS/uuid advisories.

- [x] Applied only new 044 after checking immutable migration checksums and a rollback-only live permissions dry run; browser roles cannot read/write the ledger.

- [x] Configured nine server-only production settings, keeping development credentials and real settlement disabled.

- [x] Candidate dpl_XoTKmujCjMbCW6GKLhZDZd8wGZfF built from committed source 4a91ace. API/schema healthy; catalog reads 200; book register route 200; unauthenticated user/admin payment APIs 401.

- [x] Promoted verified candidate and confirmed the canonical public domain targets it. Public routes and current bundle include book register, wallet, student transactions and library funds. The single minute Cron is active and payment-recovery has succeeded without an error.



## Migration tracker



Live inspected through 039_category_record_kind.sql. Applied 033–037 match the preserved source. 038/039 are external applied catalog migrations, not rewritten here. Unapplied drafts 040–043 remain reserved for the isolated normal gateway; this hosted-practice deployment uses only new 044_hosted_payment_preview.sql. Next unused 045 after reservation. No school financial tables are altered.



## Verification and rollback



Keep the previous Vercel production deployment dpl_8kRe8iq2oj9sWxpES8CTY8d9DMEe available for immediate alias rollback. Disable HOSTED_PAYMENT_PREVIEW on a subsequent build to stop practice checkout without deleting its ledger. A successful provider redirect is never accepted as payment evidence. Verify through Xendit API. Do not make a real purchase or transfer during deployment checks.



## Change log



- 2026-11-15: owner requested latest Vercel update including payments. Added hosted persistence adaptation rather than enabling filesystem-backed practice code on Vercel or removing its safety checks.


## Completion evidence and limits

Live URL: https://sti-ormoc-smart-library.vercel.app
Deployment: dpl_XoTKmujCjMbCW6GKLhZDZd8wGZfF
Runtime source: 4a91ace (release branch; later documentation commits do not change the deployed source).
Migration 044 checksum: 5a686b526e5ce8c1cec4e87e32b690a62d6150ae643d2daca6f1973dc0f98f56. Verified live RLS and denied browser-role grants. The table contains only practice records; real obligations and receipt history were not modified.

1,152 tests, typecheck and build passed. Production package audit has zero high/critical and two moderate advisories requiring a breaking ExcelJS downgrade to auto-fix; no forced downgrade. No fresh authenticated hosted checkout, QR capture, refund, withdrawal or physical-device visual acceptance was performed during this deployment. These remain acceptance limits, not claimed test results. Existing development-provider credentials are used; real-money release remains off.

Deployment used an archive of committed source only. Local private payment history, environment files and user files were not copied. GitHub main/payment branches were not changed by this deployment. Source and migration are retained on local codex/vercel-payment-release.

- 2026-11-15: completed deployment, public route/asset checks, ledger protection verification and single-runner health check.
