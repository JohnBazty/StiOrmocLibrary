# Vercel payment-options validation repair

Why: owner reported disabled Pay buttons and "Review the payment details and try again" on the hosted fine screen.
Date created: 2026-11-15
Date last updated: 2026-11-15
Status: inprogress

## Cause and how

The Vercel Node request includes a pre-parsed query object containing the internal __api_route rewrite field. The entry previously removed this field only from request.url. Strict parseTarget rejects extra query keys, so valid payment options fail before checking the bill. Vercel documents its request.query helper separately from request.url.

Extract the existing URL normalization into core/vercel-request.js, remove only __api_route from the pre-parsed query object too, and invoke this normalization from the deployed entry. Preserve genuine query fields and strict rejection of unexpected fields such as userId; do not bypass ownership, authorization, CSRF or financial checks.

## Implementation tracking

- [x] Reproduce the reported 422 in an HTTP regression with a Vercel-style pre-parsed own query property.
- [x] Fix both rewritten URL and pre-parsed query handling.
- [x] Targeted HTTP adapter and payment validation/routes/preview tests: 24 passed; unauthorized extra fields remain rejected.
- [ ] Full tests, typecheck and build.
- [ ] Deploy candidate and check API/catalog/protected payment routes.
- [ ] Promote and confirm the public site.

## Scope and verification limits

No credentials, dependency, migration, bill, fine, payment-history or school-data changes. Last applied migration stays 044; next 045. The fix is at the hosting adapter, not by weakening payment validation. No fresh provider charge or transfer is performed for this repair; full authenticated hosted payment completion is not claimed without a user checkout.

## Change log

- 2026-11-15: reproduce and repair Vercel-only payment options failure.
