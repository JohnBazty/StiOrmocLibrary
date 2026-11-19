---
phase: 02-user-notification-gaps
plan: 04
subsystem: api
tags: [notifications, in-library, circulation, postgres, pglite]
requires: ["02-01"]
provides:
  - "In-library use started notice, written inside the desk checkout transaction"
  - "Please return the book to the desk notice, written inside the overdue sweep transaction"
  - "Borrow confirmed notice with source, role link and per-loan dedupe key"
  - "Exported inLibraryNotice and startInLibraryUse in desk-circulation.service.ts"
affects: []
actuals:
  tokens: 8000
  tasks: 3
  commits: 3
plan_head_before: 4b63c8244b03a04e3b2575dc72a464631ff08ea1
plan_head_after: 427907ea7267a97259a5a707fb57de7ebee2cf6d
commits: 3
tech-stack:
  added: []
  patterns: ["Notice written on the caller's connection via insertUserNotice, so a failed insert rolls the action back", "Notice sent only for rows the guarded UPDATE ... RETURNING actually moved"]
key-files:
  created:
    - apps/api/src/modules/circulation/in-library-notices.test.ts
  modified:
    - apps/api/src/modules/circulation/desk-circulation.service.ts
    - apps/api/src/modules/circulation/circulation.service.ts
    - apps/api/src/modules/circulation/circulation.service.test.ts
key-decisions:
  - "The in-library branch of desk checkout moved unchanged into startInLibraryUse so the call site can be tested with a fake connection"
  - "Notice source_id is the new use id from the insert, never the copy id (null for research items)"
  - "The overdue body asks for the hand-back only; no penalty wording (D-03, P4)"
requirements-completed: [NOTIF-04, NOTIF-05, NOTIF-08, NOTIF-09]
status: complete
coverage:
  - id: D1
    description: "Starting an in-library use of a book or research item writes one notice keyed by the use id; a failing insert propagates before any commit"
    requirement: NOTIF-04
    verification:
      - kind: unit
        ref: "apps/api/src/modules/circulation/in-library-notices.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The sweep sends one hand-back notice per use it moves to Review, none on a second sweep, none for Returned or not-due uses; a failure rolls the sweep back"
    requirement: NOTIF-05
    verification:
      - kind: unit
        ref: "apps/api/src/modules/circulation/in-library-notices.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Borrow confirmed carries source_type, source_id, a Student or Faculty my-books link and loan:<id>:borrowed"
    requirement: NOTIF-08
    verification:
      - kind: unit
        ref: "apps/api/src/modules/circulation/circulation.service.test.ts"
        status: pass
    human_judgment: false
---

# Phase 2 Plan 04: In-library use notices and Borrow confirmed fields Summary

Borrowers now hear when an in-library use starts and when the sweep flags it unreturned, and Borrow confirmed gets the same source, link and dedupe fields as every other notice.

## Accomplishments

- `inLibraryNotice('started' | 'overdue', ...)` builds both notices: Normal "In-library use started" with the Manila hand-back time, and Important "Please return the book to the desk" naming the time it was due. Links follow the role (`/student/my-books`, `/faculty/my-books`, Staff and Librarian fall back to their notifications pages).
- `startInLibraryUse` is the former in-library branch of desk `checkout`, moved out with the same SQL and values. It inserts the use, then one notice keyed `in-library-use:<useId>:started`, then the availability updates, all on the transaction connection. Research items are named by title like books.
- `flagUnreturnedInLibrary` now returns `hand_back_by`, and for each moved row reads title and role and inserts the overdue notice next to the unchanged librarian alert. Only rows the guarded `WHERE status='Open'` update moved get a notice, so a second sweep and handed-back uses send nothing.
- `confirmCheckout` writes Borrow confirmed through `insertUserNotice` with source `Borrow Transaction`, the loan id, role link and `loan:<transactionId>:borrowed`. Title, body and trigger type are unchanged.

## Task Commits

1. Task 1: `d344c1c` feat(02-04): tell the borrower when an in-library use starts
2. Task 2: `2b1a679` feat(02-04): ask the borrower to return the copy when the sweep flags an in-library use
3. Task 3: `427907e` feat(02-04): save Borrow confirmed with source, role link and a per-loan dedupe key

## Verification

- `npm test -w @sti-library/api`: 551 pass, 0 fail.
- `npm run typecheck -w @sti-library/api`: exit 0.
- All acceptance-criteria greps match the plan (startInLibraryUse 1, in_library_uses insert still 1, overdue builder 1, RETURNING hand_back_by 1, librarian alert kept, old inline Borrow confirmed insert 0).
- Sweep tests run on PGlite (real Postgres): E6 second sweep, Returned and not-due uses, P2, P4 and the E11 rollback.

## Deviations from Plan

None - plan executed exactly as written. The sweep throws if a moved use has no title to name (cannot happen with the foreign keys) rather than skipping its notice quietly.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or schema; no migration. All new SQL is parameterized.

## Self-Check: PASSED

- `in-library-notices.test.ts` exists; commits `d344c1c`, `2b1a679`, `427907e` are ancestors of HEAD.
