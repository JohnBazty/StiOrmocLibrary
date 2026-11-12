# Job runner production handoff and Manila timezone

| Field | Value |
| --- | --- |
| Why | Complete John's production handoff from the groupmate's November 12 note and make business calendar reads use Manila time |
| Date created | 2026-11-12 |
| Date last updated | 2026-11-12 |
| Status | `built` — John's production handoff complete; groupmate owns Vault/Cron activation |
| Scope | Production runner setup, a minimal timezone correction, and a private-key handoff; no school jobs or migrations run |

## Findings and implementation

- Initial production health was healthy (200), but an unauthenticated jobs request
  returned `AUTHENTICATION_REQUIRED`, confirming the old deployment.
- Read-only Vercel inspection found neither `JOB_RUNNER_SECRET` nor `TZ` in Production.
- The owner explicitly instructed following the groupmate's production steps and
  authorized pushing relevant work. A clean independent clone of current `main`
  (`75b403267787c5a59f24fea481577b5118871f32`) preserved both existing dirty checkouts.
- First production deployment from that exact clean main completed as
  `dpl_CQaignVnTMKQptHKnCtaca952bYj`; health is 200 and the jobs route now correctly
  returns `401 JOB_RUNNER_UNAUTHORIZED` without the runner header.
- The owner-provided runner key was saved as a Sensitive Production environment
  variable. It is never present in tracked files, command arguments, logs or this document.
- Vercel rejected `TZ=Asia/Manila` with "The name of your Environment Variable is
  reserved." The API therefore sets its Node process timezone after environment
  loading, before business-calendar services run. Stored UTC instants and lease
  duration calculations remain unchanged.
- A regression test starts isolated processes in UTC, New York and Tokyo and
  verifies that the same instant resolves to November 12, 00:30 Manila time with
  UTC+8 while keeping its original ISO timestamp. All three failed before the fix.
- Automatic deployments for this feature branch are disabled through the existing
  `git.deploymentEnabled` pattern. Pushing a review branch must not publish unreviewed
  local payment code or create another hosting rollout.

## Implementation tracking

- [x] Read the provided handoff and current runbook.
- [x] Verify the old production behavior and clean main source.
- [x] Main tests (426 API + 272 web), typecheck and build passed before first deployment.
- [x] Redeploy clean main and verify health/unauthenticated job access.
- [x] Save the owner-provided runner key for Production only.
- [x] Reproduce the host-zone problem and implement the minimal Manila fix.
- [x] Final tests (429 API + 272 web = 701), typecheck/build and scope/security review passed.
- [x] Push only the review branch initially; preserve the private key and unrelated work.
- [x] Owner separately approved merging commit `2dacbde` into main and finishing the redeploy. Main was fast-forwarded without conflicts and pushed.
- [x] Production deployment `dpl_3D2npKmoNPjTe9BxMZbNVo47PM2i` completed and the public alias was verified against that deployment.
- [x] Verify key acceptance using an unknown job name (404), never by executing a school job.
- [x] Prepare the ready production URL and verified results for the owner's handoff to the groupmate.

## Ready for the groupmate

Production base URL: `https://sti-ormoc-smart-library.vercel.app`.
The groupmate's planned Cron target is
`https://sti-ormoc-smart-library.vercel.app/api/internal/jobs/all`.
Use the same privately supplied runner secret in Supabase Vault. This document
does not contain it. This work did not configure Vault or create/execute Cron.

Verified after the final production alias was ready:

| Check | Result |
| --- | --- |
| Production health/schema | 200, healthy |
| Missing runner key | 401, `JOB_RUNNER_UNAUTHORIZED` |
| Incorrect runner key | 401, `JOB_RUNNER_UNAUTHORIZED` |
| Correct runner key with an unknown job name | 404, `JOB_NOT_FOUND`; authorization accepted, no job executed |
| Manila timezone | Effective startup normalization is included in deployed commit `2dacbde`; isolated UTC/New York/Tokyo checks passed |

The final deployment contains the exact tested main source. The report completion
is a documentation-only follow-up on the feature branch, with automatic feature-
branch deployment disabled. No extra production rollout is needed for this report.
Private verification evidence is in the owner's ignored
`StiOrmocLibrary-main-sync/output/job-runner-activation/verification.json`.

## Safety and remaining responsibilities

Do not apply migrations, change applied filenames/checksums, expose `net`/`cron`
through the Data API, or create a second scheduler. The note reports migrations
033–036 applied and pending PR #28's 033 source correction; this setup does not
edit or reapply any migration. Supabase Vault and the once-per-minute Cron remain
the groupmate's next step, as the supplied note requests. Do not manually call
`jobs/all` to test this setup against school records.

The local payment application remains running from `StiOrmocLibrary-main-sync`.
Its uncommitted features, private attempts, database settings and local timer-off
configuration are preserved. They are not part of this main-based deployment.

## Change log

2026-11-12 — Owner approved merge and final production redeploy. Main now includes
`2dacbde`. Production is Ready with the supplied key accepted and unauthorized
requests refused. Manila normalization is included in the deployed source.
No school jobs, SQL migrations, Vault entries or Cron schedules were executed
or changed. John's requested handoff is complete; the groupmate can proceed with
their Vault/Cron activation and subsequent job-health checks.

2026-11-12 — Owner adopted the groupmate's production instructions. Redeployed
clean main, saved the Production key, and discovered Vercel's reserved TZ setting.
Prepared the minimal Node timezone fix with isolated regression checks; production
schedule remains off pending the group's Vault/Cron activation.
