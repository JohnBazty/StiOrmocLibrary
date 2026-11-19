---
phase: 02-user-notification-gaps
plan: 01
subsystem: api
tags: [notifications, circulation, postgres, pglite]
requires: []
provides:
  - "Shared in-transaction notice helper (insertUserNotice, rolePath, manilaTime) for plans 02-02 to 02-04"
  - "Book returned notice for the borrower on both return routes, inside the return transaction"
  - "PGlite notifications test database (createNoticeTestDatabase)"
affects: [02-02, 02-03, 02-04]
actuals:
  tokens: 7291
  tasks: 2
  commits: 2
plan_head_before: 00d694ab9177dbab4742dc1aad9dd4eecdd0791b
plan_head_after: 5f35ef595fb579215ec87acdf0679a2d7f3c7918
commits: 2
tech-stack:
  added: []
  patterns: ["Notice written with the caller's connection before commit; ON CONFLICT (user_id, dedupe_key) DO NOTHING"]
key-files:
  created:
    - apps/api/src/modules/notifications/user-notices.ts
    - apps/api/src/modules/notifications/user-notices.test.ts
    - apps/api/src/modules/notifications/user-notices.test.helper.ts
    - apps/api/src/modules/circulation/return-notice.test.ts
  modified:
    - apps/api/src/modules/circulation/circulation.service.ts
    - apps/api/src/modules/circulation/desk-circulation.service.ts
key-decisions:
  - "Late fine text uses the saved fines row read after the upsert, and is omitted when the row is Paid, Waived or Voided"
  - "Condition text comes only from the condition passed in by the desk route, never the copy's prior condition_status"
requirements-completed: [NOTIF-01, NOTIF-09]
status: complete
coverage:
  - id: D1
    description: "Both return routes create one Book returned notice with title and Manila return time, rolled back with the return on failure"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "apps/api/src/modules/circulation/return-notice.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Shared helper dedupes per (user_id, dedupe_key) on real Postgres and maps roles to existing pages"
    requirement: NOTIF-09
    verification:
      - kind: unit
        ref: "apps/api/src/modules/notifications/user-notices.test.ts"
        status: pass
    human_judgment: false
---

# Phase 2 Plan 01: Book returned notice Summary

One shared notice helper plus a "Book returned" notice written inside `returnBook`'s transaction, naming the title, the Manila return time, the saved late fine (only when owed) and a recorded non-Good condition.

## Accomplishments

- `user-notices.ts`: `insertUserNotice` (one parameterized insert, dedupe by `(user_id, dedupe_key)`), `rolePath` (Student/Faculty/Staff/Librarian links, null for unknown roles, Faculty printing goes to `/faculty/notifications`), `manilaTime`.
- `returnBook` inserts the notice before commit for `PUT /borrowing/:id/return` and for the desk take-home return (same code path); the borrower id and role come from the locked loan row (scalar subquery, no extra row lock).
- Body order: return sentence, `Late fine: ₱N.NN.`, `Condition recorded: X.`. The fine is the saved `fines` row, not the recalculated charge; Paid, Waived, Voided and 0.00 add no fine text.
- Desk `returnCopy` passes its recorded condition to `returnBook`; Lost is still rejected before it. A failing notice insert rolls the return back and writes no scan receipt; a replayed `requestId` adds no second notice.

## Task Commits

1. Task 1 (tracer): `2e734a5` feat(02-01): write the Book returned notice inside returnBook
2. Task 2: `5f35ef5` feat(02-01): state the saved late fine and recorded condition in the return notice

## Verification

- `node --test` on user-notices, return-notice, circulation.service and desk-circulation.validation tests: 34 pass, 0 fail.
- `npm test -w @sti-library/api`: 517 pass, 0 fail.
- `npm run typecheck -w @sti-library/api`: exit 0.
- All acceptance-criteria greps pass; `circulation.service.test.ts` unchanged.

## Deviations from Plan

None - plan executed exactly as written. (Process note: the Task 2 tests were written up front and trimmed out of the Task 1 commit so each commit passes on its own.)

## Known Stubs

None.

## Threat Flags

None. No new endpoints or schema; no migration.

## Next

Ready for 02-02.

## Self-Check: PASSED

- Created files exist; commits `2e734a5` and `5f35ef5` are ancestors of HEAD.
