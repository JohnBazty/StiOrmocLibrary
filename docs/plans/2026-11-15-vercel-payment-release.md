# Vercel catalog and payment release

Why: owner authorized updating Vercel to the latest catalog and payment features.

Date created: 2026-11-15 (Asia/Manila)
Date last updated: 2026-11-15
Status: inprogress

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
- [ ] Build a production candidate without switching the public alias; check API, public pages and protected payment access.
- [ ] Promote verified candidate, then confirm the public site and scheduled jobs.

## Migration tracker

Live inspected through 039_category_record_kind.sql. Applied 033–037 match the preserved source. 038/039 are external applied catalog migrations, not rewritten here. Unapplied drafts 040–043 remain reserved for the isolated normal gateway; this hosted-practice deployment uses only new 044_hosted_payment_preview.sql. Next unused 045 after reservation. No school financial tables are altered.

## Verification and rollback

Keep the previous Vercel production deployment dpl_8kRe8iq2oj9sWxpES8CTY8d9DMEe available for immediate alias rollback. Disable HOSTED_PAYMENT_PREVIEW on a subsequent build to stop practice checkout without deleting its ledger. A successful provider redirect is never accepted as payment evidence. Verify through Xendit API. Do not make a real purchase or transfer during deployment checks.

## Change log

- 2026-11-15: owner requested latest Vercel update including payments. Added hosted persistence adaptation rather than enabling filesystem-backed practice code on Vercel or removing its safety checks.
