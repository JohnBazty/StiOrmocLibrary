# Groupmate safety sprint review

| Field | Value |
| --- | --- |
| Date created | 2026-11-11, Asia/Manila |
| Date last updated | 2026-11-11, Asia/Manila |
| Status | `built` — review complete; integration and hosted acceptance remain pending |
| Why | Complete John's requested review and identify what can safely be combined with the local payment work |

## Result

**Follow-up, November 12:** the owner subsequently requested local payment
integration. The four integration findings below are now resolved locally in
`codex/payment-local-integration`; see the
[implementation and verification record](../plans/2026-11-11-local-payment-integration.md).
That local work does not merge GitHub's draft PRs, deploy or apply live migrations.

The audit branch passes its reported 423 API and 302 web tests on this computer,
and its typecheck and production build pass. The sign-in branch passes 399 API
and 284 web tests, typecheck and build. PR #21's dependency installation and all
377 API tests pass, including its real-SQL RLS tests.

The requested database ownership check passes for the API connection configured
in the original local checkout: its `postgres` role owns all three circulation
tables. Migration `036_sign_in_hardening.sql` is already in the hosted database's
public ledger and its checksum matches the sign-in branch. Do not rerun or
rename that file.

These results do not authorize a blind merge into our payment branch. There are
real source conflicts, overlapping migration numbers, an authentication-client
change and a runner replacement to reconcile first. No app source was changed
and no migration ran. After the initial review, John explicitly approved merging
#17 and retargeting #20; those two GitHub actions are now complete, as recorded
below. No local code was pushed and nothing was deployed. The running localhost
payment checkout was preserved.

## How the review was performed

- Read the three supplied handoff files as review material, not as automatic
  permission to publish, merge, change accounts or alter the hosted database.
- Fetched GitHub references and checked live PR metadata. Tested in a separate
  disposable clone under ignored `output/`; no environment file or credentials
  were copied into that clone.
- Read the job implementation and activation runbook, RLS migrations/tests,
  mock-route removal, PGlite helper, cookie/CSRF and forced-password-change code,
  lazy routes, refresh changes and error sanitizer.
- Used `git merge-tree` to simulate integration without changing branches,
  the working tree, running application or GitHub.
- Used explicit `BEGIN READ ONLY` transactions for the configured hosted
  connection's ownership, migration and public-schema privilege checks. No
  student/account/loan rows were read or changed.

## Reviewed revisions and independently run checks

| PR | Reviewed head | Result |
| --- | --- | --- |
| [#17](https://github.com/JohnBazty/StiOrmocLibrary/pull/17) | `d7ecec79664ae89be9a5c254f968a437ac160a3a` | Reviewed runner, activation runbook and migration 034; its code is also included in the passing #20 test/build run |
| [#18](https://github.com/JohnBazty/StiOrmocLibrary/pull/18) | `9130d26e95e50a6a855227001b735539c3f7e6e5` | Reviewed removed route and read-only checker; no current web reference to the removed supplies route found; checker passed against the configured hosted public schema |
| [#15](https://github.com/JohnBazty/StiOrmocLibrary/pull/15) | `397bd15104f65221a4ec3ad1f33d8b7787dc5673` | Reviewed documentation scope; no app code or migration changes; no new test run attributed to this PR |
| [#21](https://github.com/JohnBazty/StiOrmocLibrary/pull/21) | `ff76a44279ac39846e8b9eb087ee1fdc2f5bbd5f` | Clean dependency install; 377/377 API tests pass with its pinned PGlite dependency |
| [#19](https://github.com/JohnBazty/StiOrmocLibrary/pull/19) | `7e6ab6e3c86d6449f53995d1d23bceb47e6c81b0` | 399/399 API and 284/284 web tests; typecheck and build pass; hosted preview not performed |
| [#20](https://github.com/JohnBazty/StiOrmocLibrary/pull/20) | `0b03f16db94eb08effe2cc364c26aa98aedbd7f6` | 423/423 API and 302/302 web tests; typecheck and build pass, including its PGlite circulation tests |

GitHub exposes only a skipped `Supabase Preview` check at the inspected #17,
#19, #20 and #21 heads. The successful checks above are local evidence, not
successful GitHub CI. Coverage was not rerun; no claim that the 80% target is met.
The sign-in build retains the existing large-bundle advisory. The #20 build
produces separate lazy-loaded page bundles.

## Integration findings that must be resolved

### 1. Preserve applied 036; coordinate the unapplied payment numbers

The safety work uses `034_job_runner_hardening.sql`,
`035_rls_circulation_hardening.sql` and the already applied
`036_sign_in_hardening.sql`. Our separate local payment branch has unapplied
drafts numbered 034, 035, 036 and 037 with different contents.

Keeping both sets unchanged creates duplicate numeric identities and an
unreliable migration order. Rename only our unapplied payment drafts to an
agreed unused, increasing range, update every script/test/document reference,
and retest the isolated schema before merging the payment branch. A possible
range is 038–041, subject to checking the team's latest reservations first.
Do not edit, replace, renumber or reapply the live sign-in 036. No files were
renumbered as part of this review.

The hosted ledger check found 036 and no 033–035 entry. Its checksum matches the
exact bytes from the sign-in branch. The earlier local statement that 032 is the
latest applied file is now stale; use this confirmed 036 evidence when updating
the trackers during integration. Gaps are not permission to replay a directory.

### 2. Move payment recovery into the replacement runner

PR #17 removes `modules/jobs/job-runner.ts` and uses
`modules/job-runner/` with the existing 019 tables. Our payment branch modified
the removed file to recover payments and report payment-worker status.

The merge simulation has modify/delete conflicts for that runner and its test.
Taking the deletion without moving our payment behavior would discard payment
recovery. Keeping both runners would violate the owner's one-runner decision.
Add payment recovery to the chosen durable runner, adapt its status reader and
fixtures, retain payment leases/idempotency and verify stop/restart behavior.
Keep one scheduler. This review did not activate either hosted scheduler.

### 3. Update payment requests for cookie authentication

PR #19 removes `getAccessToken` from `auth-storage.ts`; browser requests now use
the HttpOnly cookie and `getCsrfToken()` for writes. Our new
`features/payments/payments-api.ts` still imports `getAccessToken` and sends a
Bearer header. Combining them unchanged would fail typechecking and would not
supply the required CSRF token for payment writes.

Use the new authentication helper for payment calls and protected downloads;
retain `credentials: 'include'`. Verify Student/Faculty quotes, checkout,
cancellation, status checks and Staff/Admin recovery/settlement, including
missing/wrong CSRF denial, fresh-tab restoration and forced-password-change
restrictions. Do not restore JavaScript-readable JWT storage to work around it.

### 4. Resolve actual source and dependency conflicts

The #20/payment dry run reports eight conflicting paths, including both app
entrypoints, the removed runner/test and migration documentation. The #19/payment
dry run reports six conflicting paths. Preserve all payment routes when applying
the lazy-route and sign-in updates.

Merging #17 and #21 also conflicts in `apps/api/package.json` and
`package-lock.json`: #17 uses PGlite `^0.3.14`, while #21 deliberately pins
`0.5.13`. Resolve to the approved pinned version and run both the runner/RLS
tests and ordinary suites against the resulting dependency tree. Do not label
these integrations conflict-free just because each PR separately targets main
cleanly.

## Database preflight evidence

Scope: the connection used by the configured ordinary local API, pointing to
hosted Supabase. Vercel Preview/Production connection settings were not
independently inspected, so repeat the check there if either uses another role.

| Table | API owns table | API bypasses RLS | RLS on | SELECT/INSERT/UPDATE allowed |
| --- | --- | --- | --- | --- |
| `public.borrow_transactions` | yes | yes | yes | yes |
| `public.reservations` | yes | yes | yes | yes |
| `public.physical_copies` | yes | yes | yes | yes |
| `public.scheduled_job_state` | yes | yes | yes | yes |
| `public.scheduled_job_runs` | yes | yes | yes | yes |

The API role and table owner are `postgres`; FORCE RLS is off. The separately
reviewed #18 checker found no missing anon/authenticated roles, no public table
without RLS and no exposed table/view/column grants. Its scope does not certify
sequences, functions, defaults, other schemas or a differently configured API.

## Requested actions and remaining approval

| Request | State / next action |
| --- | --- |
| Review #17 runner and activation runbook | Completed; owner subsequently approved and completed its merge into main |
| Merge #17 before retargeting #20 | Completed in that order with John's explicit approval; #20 now targets main and remains a draft |
| Review #18 removal | Completed; current screens have no reference to the deleted mock supplies endpoint |
| Install/test #21 | Completed in the isolated review clone; all 377 API tests pass |
| Confirm role ownership before 035 | Completed for the configured API connection; repeat for any distinct Vercel role |
| Confirm 036 application | Completed read-only with matching checksum; never run it again |
| Deploy #19 preview | Prepared/tested source, not deployed; owner previously requires approval before hosting, and current Vercel read-only access returns HTTP 403 |
| #19 browser matrix / post results | Not performed by this review; do not mark hosted rows passed or post a completion claim |
| Apply 034/035, configure Vault/Cron, deploy production | Not authorized or performed; #17's runbook separates these activation steps |
| Integrate all work into payment branch | Not performed; resolve the four integration findings first |

The newest #19 documentation already records Ethan's localhost run, including
partial forced-change evidence and validation-only profile writes. That is
author-supplied evidence, not this review's browser work or a hosted preview.
Preview checks must use disposable Student and personnel accounts; do not repeat
lockout/password changes on real users. Verify an actual successful reversible
save, not just that a 422 validation response passed CSRF.

Before approving #19's policy, note that it changes the owner's earlier
eight-attempt/ten-minute lockout to five attempts/fifteen minutes. Ethan's plan
records that decision; John should explicitly accept that policy change before
release. Known open decisions remain temporary-password expiry, privileged
action rate limits and sole-Admin lockout recovery. Do not silently choose new
account recovery policy during a preview check.

Three PR descriptions need correction when authorized to edit GitHub: #17 still
says no migration is needed although its runbook includes 034; #19 still says
036 is unapplied despite its ledger entry and newer preview document. #20's
"next unused 036" line is stale now that 036 is applied. Retain the distinct
statement that 035 has not been applied.

## Implementation tracking

- [x] Read supplied handoffs and inspect current GitHub PR states/heads.
- [x] Review affected application, database, security and dependency paths.
- [x] Reproduce #20 tests, typecheck and build.
- [x] Install and run #21 API tests.
- [x] Reproduce #19 tests, typecheck and build.
- [x] Perform requested read-only ownership/RLS/checksum checks.
- [x] Simulate integration and preserve the running payment application.
- [x] Record exact findings, scope and remaining approvals.
- [x] Owner-approved merge of #17 and retarget of #20 to main.
- [ ] Separately authorized remaining PR merges and PR-description corrections.
- [ ] Owner-approved #19 hosted preview, supported browser acceptance and results.
- [ ] Separately approved migrations, production deployment and scheduler activation.

## Change log

2026-11-11, 23:31 Asia/Manila — John explicitly approved merging #17 and then
retargeting #20. Merged reviewed head `d7ecec7` through GitHub with a required
head-SHA check; merge commit `a5a588cd0e2d96376641eaa2c971afd7950c7dcb`.
Retargeted #20 to `main`, preserving its reviewed head `0b03f16`. Verified #20
is open, draft, mergeable without a GitHub conflict, with three commits and
29 changed files. Fetched the new main reference without merging it into the
payment branch. Local API health and payment routes still pass. No deployment,
migration, local code push, other PR merge or production activation occurred.

2026-11-11 — Completed review and isolated verification of the supplied safety
sprint handoffs. Confirmed live 036 identity and configured API table ownership;
found payment migration, runner, authentication and dependency integration work.
Preserved local source and running servers. No external state or hosted data was
changed.
