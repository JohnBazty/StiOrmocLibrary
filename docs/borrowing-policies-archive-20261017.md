# Borrowing policy management archive

- Date created: 2026-10-17
- Date last updated: 2026-11-18
- Status: restored (2026-11-18, branch `fix/restore-borrowing-policies`)

## Why
The owner requested archiving Borrowing policies for now. Preserve the feature for restoration and retain the saved operational rules.

## How
- Remove Borrowing policies from the Librarian navigation.
- The existing protected `/librarian/borrowing-policies` address displays a short archived notice with a dashboard link instead of loading the editor.
- Keep authentication and Librarian permission checks on the management API. Authorized requests to `/api/v1/admin/borrowing-policies` and its subpaths return HTTP 410 without reading or publishing a policy.
- Retain the original editor, API client, router factory, policy service, tests, database versions and material rules. Circulation continues resolving approved effective policies through the service. Existing limits, due dates and eligibility rules are unchanged.
- Restore later by rewiring App.tsx to AdminBorrowingPoliciesPage, restoring the navigation entry and mounting borrowingPolicyRouter in app.js. No database restore is needed.

## Implementation tracking
- [x] Remove navigation and replace the protected editor page.
- [x] Archive management API while preserving the policy resolver.
- [x] Verify archived API, unchanged policy behavior and web build; restart local API.

## Database boundary
No migration, database write or policy change. Applied Postgres remains 027; Phase 2 draft 028 remains unapplied. MySQL rollback reference remains 048.

## Change log
- 2026-10-17: Began owner-authorized archive of borrowing-policy management. Unrelated unfinished Phase 2 work is preserved.

## Verification
- Eight focused API tests passed: archived management methods/subpaths, preserved role boundaries, policy resolution, no-policy blocking, validation and due-date rules.
- Web production build and API typecheck passed. The web build retains its existing bundle-size advisory.
- Local API restarted. Health is healthy/schema ready, the old SPA address returns HTTP 200, and anonymous management API access remains HTTP 401. No real checkout or policy publication was performed.
- Full API typecheck exposed a missing result-row type in the unfinished enrollment draft. Added the explicit query-row type without activating enrollment or changing its business behavior.
- Original editor/client/router/service files remain available for restoration. No database write, migration, push or deployment.

- 2026-10-17: Completed archive, scoped verification and local restart.
- 2026-11-18: Restored on Ethan's request. app.js mounts `borrowingPolicyRouter` again, `/librarian/borrowing-policies` renders `AdminBorrowingPoliciesPage`, the Librarian menu shows "Borrowing policies", and the archive router and notice page were deleted. No migration or database change.

## Deployment (restore, 2026-11-18)
- **Database:** none. `borrowing_policy_versions` and its material rules (migration 016) are live, and the live database holds 2 versions. No migration to apply.
- **Environment and Vercel:** no new variables and no `vercel.json` change. `npm run build` compiles `apps/api/dist/app.js`, which mounts `borrowingPolicyRouter`. Pushing the branch makes a Vercel preview deploy; production deploys when the PR merges to `main`.
- **Checked before deploy:** typecheck, 469 API and 315 web tests, and the production build all pass. A local run against the live database (2026-11-18) confirmed the Librarian menu link, the page loading the live policy and history, dialog focus, Escape and Cancel, the review step resetting after an edit, and the server rejecting an empty and a backdated publish (still 2 versions). Nothing was published.
- **After deploy:** sign in as a Librarian, open Borrowing policies, check the active policy shows, open and close "Create new version" without publishing. Check a Student gets no menu entry and 403 from `/api/v1/admin/borrowing-policies`.
- **Rollback:** revert the restore commit and redeploy. Saved policies are unaffected either way, because circulation reads them through the policy service in both states.
