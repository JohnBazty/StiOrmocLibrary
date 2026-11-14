# Vercel payment-options validation repair

Why: owner reported disabled Pay buttons and "Review the payment details and try again" on the hosted fine screen.
Date created: 2026-11-15
Date last updated: 2026-11-15
Status: built

## Cause and how

Confirmed root cause from authenticated production requests: Vercel also appends the named wildcard source capture `path` to the rewritten query. Field-name-only diagnostics showed `kind`, `targetId`, `path` reaching parseTarget. The earlier changes below did not remove this URL-level field and did not resolve the live failure.

Rename the rewrite's source capture to the existing reserved `__api_route` key and use that same key in the destination. Both the generated capture and explicit destination then use one internal key, which the adapter removes. Do not ignore an ordinary client-supplied `path` or loosen strict payment validation. A regression derives its simulated captures from the actual vercel.json: it failed with 422 before this change and passes afterward. Removed the temporary field-name diagnostics. Targeted checks: 28 passed. Full checks: 706 API tests and 453 web tests passed; typecheck and build passed.

## Final hosted verification

Promoted source `6bd7424`, deployment `dpl_DqB3TPeLQa4iKMZnSHe8xm7VFde1`, to the canonical public domain. Candidate API health returned healthy with schema ready. Production logs show three authenticated payment-options requests returning 200 on this deployment, replacing the former 422 results. Observed the owner's signed-in Brave tab displaying a fine wallet checkout for PHP 192.90, then printing payment review for PHP 3.02 with GCash and QRPh available. The owner was interacting with these screens; no payment was submitted by the agent. This verifies options/review, not a new completed payment, QR scan or refund. Copied the same routing correction and regression checks into the existing local integration checkout, preserving other edits. No GitHub push, migration, bill edit or credential change was performed for this repair.

The Vercel Node request includes a pre-parsed query object containing the internal __api_route rewrite field. The entry previously removed this field only from request.url. Strict parseTarget rejects extra query keys, so valid payment options fail before checking the bill. Vercel documents its request.query helper separately from request.url.

Extract the existing URL normalization into core/vercel-request.js, remove only __api_route from the pre-parsed query object too, and invoke this normalization from the deployed entry. Preserve genuine query fields and strict rejection of unexpected fields such as userId; do not bypass ownership, authorization, CSRF or financial checks.

## Implementation tracking

- [x] Reproduce the reported 422 in an HTTP regression with a Vercel-style pre-parsed own query property.
- [x] Fix both rewritten URL and pre-parsed query handling.
- [x] Targeted HTTP adapter and payment validation/routes/preview tests: 24 passed; unauthorized extra fields remain rejected.
- [x] Full tests: 702 API and 453 web passed (1,155 total); typecheck and build passed.
- [x] Candidate API health, catalog reads, book-register route and protected payment access checks passed.
- [x] Promoted dpl_FQ7bdBmXn9hCngDi2ujNqC7nEGCS (source 22b68d2); verified canonical production target, healthy API, catalog queries, protected payment-options route and intact image responses.

## Scope and verification limits

No credentials, dependency, migration, bill, fine, payment-history or school-data changes. Last applied migration stays 044; next 045. The fix is at the hosting adapter, not by weakening payment validation. No fresh provider charge or transfer is performed for this repair; full authenticated hosted payment completion is not claimed without a user checkout.

## Change log

- 2026-11-15: reproduce and repair Vercel-only payment options failure.

- 2026-11-15: deployed the verified adapter correction. Same scoped repair copied locally after confirming the local entry had no independent edits. No financial record or payment status was manually altered.

## Follow-up: signed-in failure after the first repair

Owner screenshots and an actual authenticated browser capture confirmed both fine option requests still returned 422. The first regression modeled only a stable pre-parsed object. Added a fresh-object hosting query getter regression; it fails with the first correction. Remove the configurable own hosting query property entirely so Express uses its parser on the normalized URL. Keep unexpected client fields rejected. Targeted adapter/payment checks: 25 passed. Full checks and signed-in hosted verification are required before marking this follow-up complete. No payment is submitted during review.

## Direct request-query boundary

A signed-in Brave retry still showed the reported error after the helper-removal deployment. Add an HTTP regression with an immutable hosting helper containing routing metadata; it reproduces 422. Payment options now use a dedicated requestQuery reader from the client URL, excluding only internal __api_route. Duplicate keys remain arrays and unexpected client fields still fail strict validation. Targeted HTTP/payment checks: 27 passed. Verify the actual Brave review screen before claiming this repair complete.
