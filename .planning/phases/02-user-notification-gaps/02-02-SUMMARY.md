---
phase: 02-user-notification-gaps
plan: 02
subsystem: api
tags: [notifications, clearance, postgres, transactions]
requires: ["02-01"]
provides:
  - "Clearance updated notice on override grant and revoke, written inside a new transaction"
  - "compute(userId, updateCache, executor) so clearance can be read on a transaction connection"
affects: [02-03, 02-04]
actuals:
  tokens: 5121
  tasks: 2
  commits: 2
plan_head_before: 350c014d85f53e952c08ef5febe9507100f3b94f
plan_head_after: d155f5b6445ec123579917a81b188228ebc1a2d2
commits: 2
tech-stack:
  added: []
  patterns: ["Notice written with the caller's connection before commit via insertUserNotice", "Pool reads in parallel, a transaction connection reads one query at a time"]
key-files:
  created:
    - apps/api/src/modules/clearance/clearance-override-notices.test.ts
  modified:
    - apps/api/src/modules/clearance/clearance.service.ts
key-decisions:
  - "The notice body is built only from the computed status plus fixed text, never the typed reason, compute's reason or any name"
  - "The revoke status is recomputed inside the transaction, so another active override or the computed standing is shown"
requirements-completed: [NOTIF-02, NOTIF-03, NOTIF-09]
status: complete
coverage:
  - id: D1
    description: "Granting an override writes one Clearance updated notice (Important) with the status the clearance page shows, linked to the role's clearance page"
    requirement: NOTIF-02
    verification:
      - kind: unit
        ref: "apps/api/src/modules/clearance/clearance-override-notices.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Revoking writes one notice with the recomputed status and Contact the library for details; an already revoked override writes nothing"
    requirement: NOTIF-03
    verification:
      - kind: unit
        ref: "apps/api/src/modules/clearance/clearance-override-notices.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "A failed notice or a non-Student/Faculty user rolls back the override write; the typed reason and names never reach a notice"
    requirement: NOTIF-09
    verification:
      - kind: unit
        ref: "apps/api/src/modules/clearance/clearance-override-notices.test.ts"
        status: pass
    human_judgment: false
---

# Phase 2 Plan 02: Clearance override notices Summary

Granting or revoking a clearance override now saves one "Clearance updated" notice (Important) in the same transaction, stating the user's current status, plus "Contact the library for details." on a revoke.

## Accomplishments

- `compute` takes an `executor` (default the pool). On the pool the six reads still run through `Promise.all`; on a transaction connection they run one after another. `mine()`, `detail()` and the dashboard's `compute(userId, false)` are unchanged.
- `applyOverride` and `revokeOverride` follow the `reportLost` transaction pattern. The override write, the `clearance_statuses` cache write and the notice commit or roll back together.
- Module-level `notifyClearanceChange` reads the user's role, builds the body from the status only, and links to `/student/clearance` or `/faculty/clearance` via `rolePath`. Dedupe keys are `clearance-override:<id>:granted` and `:revoked`.
- Revoking an already revoked override still returns 404 `CLEARANCE_OVERRIDE_NOT_FOUND` and writes no notice. An override for a user who is not Student or Faculty now rolls back with 404 `CLEARANCE_STUDENT_NOT_FOUND` instead of committing (RESEARCH Finding 2).

## Task Commits

1. Task 1: `292b8ed` feat(02-02): tell the user their new clearance status when an override is granted
2. Task 2: `d155f5b` feat(02-02): tell the user their recomputed clearance status when an override is revoked

## Verification

- `node --test` on clearance-override-notices, clearance.service and clearance.validation tests: 10 pass, 0 fail (8 on the grant commit, plus the revoke cases).
- `npm test -w @sti-library/api`: 525 pass, 0 fail.
- `npm run typecheck -w @sti-library/api`: exit 0.
- Acceptance greps pass; `clearance.service.test.ts` unchanged. No migration; no live database touched.
- Tests use a fake connection (the repo's pattern for this module), not real Postgres. The new SQL is one `SELECT user_role` and the shared helper, which 02-01 already proved on PGlite.

## Deviations from Plan

None - plan executed exactly as written. (Process note: the Task 2 tests were added after the Task 1 commit so each commit passes on its own.)

## Known Stubs

None.

## Threat Flags

None. No new endpoints or schema; the notice goes only to the override's target user, which compute checks is a Student or Faculty user.

## Next

Ready for 02-03.

## Self-Check: PASSED

- Created and modified files exist; commits `292b8ed` and `d155f5b` are ancestors of HEAD.
