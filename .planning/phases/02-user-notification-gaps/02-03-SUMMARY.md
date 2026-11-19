---
phase: 02-user-notification-gaps
plan: 03
subsystem: api
tags: [notifications, printing, postgres, transactions, pglite]
requires: ["02-01"]
provides:
  - "Printing paused / Printing resumed notices to every user with an open print request, once per real switch"
  - "setServiceStatus as a locked transaction (SELECT ... FOR UPDATE before the upsert)"
  - "Exported notifyPrintingServiceChange(q, accepting, reason)"
affects: [02-04]
actuals:
  tokens: 4500
  tasks: 2
  commits: 2
plan_head_before: db98a4ec2e2a6c6be28d9248ee3165f2a701a043
plan_head_after: 16b0dbfa06f20c0a77b8249b0470e17e1adb94de
commits: 2
tech-stack:
  added: []
  patterns: ["Notice fan-out written on the caller's transaction connection via insertUserNotice", "Row lock read decides whether a save is a real switch"]
key-files:
  created:
    - apps/api/src/modules/printing/printing-service-notices.test.ts
  modified:
    - apps/api/src/modules/printing/printing.service.ts
key-decisions:
  - "A fresh randomUUID per real switch is the dedupe event id, so pause, resume, pause are three separate events"
  - "The actor's name is never read; the staff-typed reason goes only into the TEXT body as a ? parameter"
requirements-completed: [NOTIF-06, NOTIF-07, NOTIF-09]
status: complete
coverage:
  - id: D1
    description: "Pausing writes one Printing paused notice (Important) per user with an open request, with the public reason when present"
    requirement: NOTIF-06
    verification:
      - kind: unit
        ref: "apps/api/src/modules/printing/printing-service-notices.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Resuming writes one Printing resumed notice (Normal) to the same set of users"
    requirement: NOTIF-07
    verification:
      - kind: unit
        ref: "apps/api/src/modules/printing/printing-service-notices.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Same-state saves and empty queues send nothing; a failed notice rolls the setting back"
    requirement: NOTIF-09
    verification:
      - kind: unit
        ref: "apps/api/src/modules/printing/printing-service-notices.test.ts"
        status: pass
    human_judgment: false
---

# Phase 2 Plan 03: Printing paused and resumed notices Summary

Pausing or resuming printing now saves one "Printing paused" (Important) or "Printing resumed" (Normal) notice per user with an open print request, in the same transaction as the setting, and only when the accepting state really changes.

## Accomplishments

- `setServiceStatus` is a `getConnection` transaction: it locks row 1 with `SELECT accepting_requests ... FOR UPDATE`, runs the unchanged upsert, and calls `notifyPrintingServiceChange` only when the accepting flag differs. Same arguments and return value as before.
- `notifyPrintingServiceChange` (exported) selects the distinct users whose print requests are not Completed or Cancelled, and writes one notice each through `insertUserNotice`. The body adds the trimmed reason only when one exists. Links come from `rolePath(role, 'printing')` (Student `/student/printing`, Staff `/staff/printing`, Faculty `/faculty/notifications`).
- Dedupe key is `print-service:<randomUUID per switch>:paused|resumed`, so each switch is its own event while a user with several open requests still gets one notice.
- A paused-to-paused save still stores the new reason but sends nothing.

## Task Commits

1. Task 1: `40f3f75` feat(02-03): tell users with an open print request when printing is paused or resumed
2. Task 2: `16b0dbf` feat(02-03): prove repeated switches, same-state saves, empty queues and a failed notice send exactly once

## Verification

- `node --test` on printing-service-notices, printing.service and printing.validation tests: 27 pass, 0 fail.
- `npm test -w @sti-library/api`: 534 pass, 0 fail.
- `npm run typecheck -w @sti-library/api`: exit 0.
- Acceptance greps pass (`print-service:` 1, FOR UPDATE read 1, `Printing is paused` 1, `'/faculty/printing'` still 1, `randomUUID` 2 lines). `printing.validation.ts` unchanged. No migration; no live database touched.
- Tests run on PGlite (real Postgres). Two simultaneous saves cannot race on a single connection, so the lock is asserted on the SQL order (FOR UPDATE read before the upsert), as the plan specified.

## Deviations from Plan

None - plan executed exactly as written. Task 2 needed no code change: the Task 1 implementation already satisfied E7, E8, E9 and E11, so Task 2 only adds the tests that prove them. (Process note: those tests were added after the Task 1 commit so each commit passes on its own.)

## Known Stubs

None.

## Threat Flags

None. No new endpoints or schema; recipients come only from open print requests, the actor name is never read, and the route authorization is unchanged.

## Next

Ready for 02-04.

## Self-Check: PASSED

- Created and modified files exist; commits `40f3f75` and `16b0dbf` are ancestors of HEAD.
