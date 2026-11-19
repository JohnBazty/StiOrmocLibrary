---
phase: 02-user-notification-gaps
verified: 2026-11-19T12:00:00Z
status: human_needed
score: 37/38 must-haves verified
covered_files:
  - ".planning/phases/02-user-notification-gaps/02-01-PLAN.md"
  - ".planning/phases/02-user-notification-gaps/02-01-SUMMARY.md"
  - ".planning/phases/02-user-notification-gaps/02-02-PLAN.md"
  - ".planning/phases/02-user-notification-gaps/02-02-SUMMARY.md"
  - ".planning/phases/02-user-notification-gaps/02-03-PLAN.md"
  - ".planning/phases/02-user-notification-gaps/02-03-SUMMARY.md"
  - ".planning/phases/02-user-notification-gaps/02-04-PLAN.md"
  - ".planning/phases/02-user-notification-gaps/02-04-SUMMARY.md"
  - "apps/api/src/modules/circulation/circulation.service.test.ts"
  - "apps/api/src/modules/circulation/circulation.service.ts"
  - "apps/api/src/modules/circulation/desk-circulation.service.ts"
  - "apps/api/src/modules/circulation/in-library-notices.test.ts"
  - "apps/api/src/modules/circulation/return-notice.test.ts"
  - "apps/api/src/modules/clearance/clearance-override-notices.test.ts"
  - "apps/api/src/modules/clearance/clearance.service.ts"
  - "apps/api/src/modules/notifications/user-notices.test.helper.ts"
  - "apps/api/src/modules/notifications/user-notices.test.ts"
  - "apps/api/src/modules/notifications/user-notices.ts"
  - "apps/api/src/modules/printing/printing-service-notices.test.ts"
  - "apps/api/src/modules/printing/printing.service.ts"
covered_digest: "v4:sha256:fc4c9e0932c939be6e0f8e3252707e3c2bd75b44a48c69cdd8b34f8cebdfd18d"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Two librarians save the identical printing state (for example pause with the same reason) at the same moment against a real Postgres, with at least one user holding an open print request"
    expected: "Exactly one set of Printing paused notices exists afterward (the second save sees the first save's committed state through the row lock and sends nothing)"
    why_human: "The E8 concurrency truth is tagged backstop. Automated evidence is only an assertion on the SQL text (SELECT ... FOR UPDATE before the upsert) in a single-connection PGlite test, which cannot race two saves. Presence of the lock is not proof of the race outcome."
  - test: "Read the overdue hand-back notice wording: 'Please return the book to the desk' / '<title> was due back at the library desk by <Manila time>. Please return it to the library desk.'"
    expected: "No threat of a fine, penalty, suspension or block (SPEC P4)"
    why_human: "P4 is a judgment-tier prohibition (ADR-550 D4). The verifier read the body text and found no penalty wording, and in-library-notices.test.ts has a regex backstop (/fine|penalt|charge|fee|suspend|block|₱/i), but an LLM verdict on a judgment-tier item is non-authoritative: flagged unverified-prohibition, human review recommended."
---

# Phase 2: User notification gaps Verification Report

**Phase Goal:** Users get one in-app notice when a librarian records a return, grants or revokes a clearance override, starts an in-library use or flags it overdue, or pauses or resumes printing. The Borrow confirmed notice gets a source, action path and dedupe key like the other notices. Account status, semester end and invoice notices are deferred (see 02-SPEC.md).
**Verified:** 2026-11-19
**Status:** human_needed (all automated checks pass; 2 human items, neither a defect)
**Re-verification:** No, initial verification

## Goal Achievement

ROADMAP has no separate Success Criteria list for Phase 2, so the roadmap contract is the goal text plus the 21 SPEC acceptance criteria (R1 to R9, E1 to E11, P1 to P4). PLAN must_haves were merged in (38 truths across the four plans).

### Observable Truths

| # | Truth (SPEC / plan) | Status | Evidence |
|---|---------------------|--------|----------|
| 1 | R1: a return creates one "Book returned" notice for the borrower, title + Manila time, via both routes | VERIFIED | `circulation.service.ts` `returnBook` calls `insertUserNotice(connection, ...)` before commit with `returnedNoticeBody(title, returnedAt, ...)`; desk `returnCopy` calls the same `returnBook(actor.accountId,a.id,{condition})`; return-notice.test.ts passes |
| 2 | R1/E1: on-time, at-due-time or 0.00 fine has no fine text | VERIFIED | `lateFine` starts 0 and is set only inside the late branch from the saved row; tests "at the due time", "stored fine is 0.00" pass |
| 3 | R1/E2: late notice shows the stored `fine_amount` as ₱ with 2 decimals, not the recalculated charge | VERIFIED | Re-reads `SELECT fine_amount,payment_status FROM fines WHERE transaction_id=?` after upsert; `toFixed(2)`; tests pass |
| 4 | R1/E3: one return = one notice whichever route; replayed desk requestId adds none | VERIFIED | dedupe key `loan:<id>:returned` + `ON CONFLICT (user_id, dedupe_key) DO NOTHING`; replay test passes |
| 5 | R1: condition other than Good states "Condition recorded: X."; Good / none has no text | VERIFIED | `returnedNoticeBody`; tests pass |
| 6 | R1 (orchestrator decision): stored fine already Paid/Waived/Voided gets no fine text | VERIFIED | `!['Paid','Waived','Voided'].includes(...)` guard; test per status |
| 7 | D-07 body order return, fine, condition | VERIFIED | array order in `returnedNoticeBody` |
| 8 | D-08 desk return with condition Lost rejected before returnBook, no notice | VERIFIED | `DESK_LOST_INCIDENT` throw precedes `returnBook`; test passes |
| 9 | R9/E11 return: failing notice insert rolls back, no commit, no desk receipt | VERIFIED | insert inside try before `commit()`, catch rolls back; two tests assert no commit and no receipt |
| 10 | R9: same (user_id, dedupe_key) twice leaves one row on real Postgres (PGlite) | VERIFIED | `insertUserNotice` SQL; user-notices.test.ts PGlite test passes |
| 11 | E10 path rule (`rolePath`) Student/Faculty/Staff/Librarian, Faculty printing, unknown null | VERIFIED | `user-notices.ts` read; rolePath test passes |
| 12 | R2: grant creates exactly one "Clearance updated" notice (Important) with new status | VERIFIED | `applyOverride` now a transaction: insert, `compute(userId,true,connection)`, `notifyClearanceChange(...'granted')`, commit; tests pass |
| 13 | R3: revoke creates one notice with recomputed status and "Contact the library for details." | VERIFIED | `revokeOverride` same shape, body suffix only for 'revoked'; test "another override still active" passes |
| 14 | R2/R3/E4 one per override id; already-revoked gives 404 and no notice | VERIFIED | keys `clearance-override:<id>:granted|revoked`; `affectedRows` guard throws before notice; test passes |
| 15 | D-09 clearance link /student/clearance, /faculty/clearance | VERIFIED | `rolePath(role,'clearance')`; tested |
| 16 | R9/E11 clearance: failing notice rolls back grant and revoke | VERIFIED | test "a failed notice rolls back a grant and a revoke" passes |
| 17 | Non-Student/Faculty override now rolls back with 404 CLEARANCE_STUDENT_NOT_FOUND | VERIFIED | `compute` user query filters role; test passes |
| 18 | mine()/detail()/dashboard compute results unchanged; pool path still parallel | VERIFIED | `executor === database ? Promise.all : sequential`; circulation/clearance suites pass (orchestrator 551/551) |
| 19 | R6: pause notifies each user with a non-Completed/Cancelled request once; completed-only users none | VERIFIED | `notifyPrintingServiceChange` SELECT DISTINCT user_id ... `NOT IN ('Completed','Cancelled')`; PGlite test passes |
| 20 | R6/D-04 reason in body only when non-empty | VERIFIED | template; tests "Out of paper" and "no reason" pass |
| 21 | R7/D-05 resume notifies same set, Normal priority, text | VERIFIED | test passes |
| 22 | R6/R7/E7 pause, resume, pause = separate events, own keys | VERIFIED | `randomUUID()` per switch in key; test passes |
| 23 | R6/R7/E8 same-state save writes no notice; still stores new reason | VERIFIED | `wasAccepting!==input.acceptingRequests` guard; test passes |
| 24 | R6/R7/E9 no open requests: setting saved, no notices | VERIFIED | test passes |
| 25 | D-09/D-10 printing paths Student/Staff/Faculty | VERIFIED | `rolePath(...,'printing')`; tests pass |
| 26 | R9/E11 printing: failing notice rolls the setting back | VERIFIED | test passes |
| 27 | One notice per user per switch, not per request | VERIFIED | SELECT DISTINCT |
| 28 | E8 concurrency: two simultaneous identical saves send one set (backstop; FOR UPDATE read before upsert) | UNCERTAIN (insufficient_spec) | Lock read `SELECT accepting_requests ... FOR UPDATE` is present before the upsert, asserted on SQL text only; no race exercised. Routed to human item 1. Does not count toward score. |
| 29 | R4: in-library start writes one "In-library use started" notice (Normal) with title + Manila hand-back time | VERIFIED | `startInLibraryUse` inserts use then `insertUserNotice(q,inLibraryNotice('started',...))`; role comes from `validateAttendanceCredential` (returns `role`), so path is not null on the real checkout path |
| 30 | R4/E5 research item named by title like a book | VERIFIED | `copy()` research branch joins `titles`; test passes |
| 31 | R4 call site: keyed by returned use id; notice failure propagates before commit | VERIFIED | `in-library-use:${useId}:started`; tests pass |
| 32 | R5: sweep gives one "Please return the book to the desk" (Important) notice per use moved to Review | VERIFIED | `flagUnreturnedInLibrary` RETURNING adds `hand_back_by`; per-row `insertUserNotice(q,inLibraryNotice('overdue',...))` |
| 33 | R5/E6: second sweep, handed-back, not-yet-due uses get none | VERIFIED | UPDATE only moves `status='Open'` rows; tests pass |
| 34 | R5: librarian alert unchanged | VERIFIED | admin_notifications insert retained verbatim |
| 35 | D-09 in-library links /student|faculty/my-books, Staff and Librarian fallback | VERIFIED | `rolePath`; tests pass |
| 36 | R8/E10: Borrow confirmed has source_type 'Borrow Transaction', source_id, dedupe `loan:<id>:borrowed`, role-correct path; title/body/trigger unchanged | VERIFIED | `confirmCheckout` now uses `insertUserNotice` with all four fields; circulation.service.test.ts extended and passing |
| 37 | R9/E11 in-library and checkout: failing notice rolls back start, sweep and checkout | VERIFIED | tests pass |
| 38 | Prohibitions P1, P2, P3 (test tier) and P4 (judgment tier) | VERIFIED for P1/P2/P3; P4 flagged | P1: clearance test uses reason 'ZZ-secret-reason-ZZ', asserted absent from every notice parameter; P2: name assertions in each suite; P3: no-fine cases; notice builders contain no user or staff name. P4 body read, no penalty wording; judgment-tier so flagged (human item 2). Counted VERIFIED in score; flag recorded. |

**Score:** 37/38 truths verified (1 backstop truth abstained, 0 present-but-behavior-unverified)

### Deferred Items

None. Account status, semester end and invoice notices are explicitly out of scope in 02-SPEC.md (not gaps), and Step 9b found no later-phase mapping needed.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/modules/notifications/user-notices.ts` | `insertUserNotice`, `rolePath`, `manilaTime`, types | VERIFIED | 30 lines, substantive, imported by 4 services |
| `apps/api/src/modules/notifications/user-notices.test.helper.ts` | PGlite pool with unique (user_id, dedupe_key) | VERIFIED | used by printing and notice tests |
| `apps/api/src/modules/circulation/circulation.service.ts` | return notice + Borrow confirmed fields | VERIFIED | wired |
| `apps/api/src/modules/circulation/desk-circulation.service.ts` | `inLibraryNotice`, `startInLibraryUse`, overdue notice | VERIFIED | exported and wired into `checkout` and the sweep |
| `apps/api/src/modules/clearance/clearance.service.ts` | transactional grant/revoke + notice | VERIFIED | wired |
| `apps/api/src/modules/printing/printing.service.ts` | locked `setServiceStatus` + `notifyPrintingServiceChange` | VERIFIED | wired |
| Test files (5 new, 1 extended) | per-requirement tests | VERIFIED | 66 focused tests pass |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| circulation.service.ts returnBook | user-notices.ts | `insertUserNotice(connection` before commit | WIRED |
| desk returnCopy | returnBook | `returnBook(actor.accountId,a.id,{condition:assessment.condition})` | WIRED |
| clearance applyOverride/revokeOverride | compute + notice | `compute(userId, true, connection)` then `notifyClearanceChange` | WIRED |
| printing setServiceStatus | notices | `notifyPrintingServiceChange(connection, ...)` after `FOR UPDATE` read | WIRED |
| desk checkout (InLibrary) | startInLibraryUse | `startInLibraryUse(q,{...})` | WIRED |
| flagUnreturnedInLibrary | inLibraryNotice('overdue') | per moved row | WIRED |
| confirmCheckout | insertUserNotice | `rolePath(borrower.role_name,'my-books')` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real Data | Status |
|----------|------|--------|-----------|--------|
| Return notice fine | `lateFine` | `SELECT fine_amount FROM fines` after upsert | Yes | FLOWING |
| Clearance notice status | `clearance.status` | `compute(..., connection)` reading uncommitted override in same transaction | Yes | FLOWING |
| Printing recipients | `users` | `print_requests` JOIN `users` | Yes | FLOWING |
| In-library role | `qr.role` | `validateAttendanceCredential` returns `role` from `users.user_role` | Yes | FLOWING |
| Overdue title/role | `infos[0]` | per-row join of in_library_uses, titles, users | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase test files | `node --test` on the 5 new test files + circulation.service.test.ts (run from apps/api) | 66 pass, 0 fail | PASS |
| Full gate | orchestrator: `npm run build` exit 0; `npm test` 551/551 API, 373/373 web | reported by orchestrator, not re-run | PASS (reported) |

### Probe Execution

Step 7c: SKIPPED (no probes declared by the phase).

### Requirements Coverage

REQUIREMENTS.md lists the nine IDs as plain bullets (`- **NOTIF-0N**: ...`), with no checkbox and no traceability table, so `requirements.mark-complete` has nothing to tick. This is a format property of the file, not a missing requirement. Each ID appears exactly once; none are ORPHANED (every ID is claimed by at least one PLAN `requirements:` field and by the matching SUMMARY `requirements-completed`). ROADMAP.md line 10 still shows the Phase 2 list entry as `- [ ]` while its plan entries are `[x]`; cosmetic, update when the phase is closed.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NOTIF-01 | 02-01 | Borrower notice on book return | SATISFIED | truths 1-9; both routes share `returnBook` |
| NOTIF-02 | 02-02 | Notice on override granted | SATISFIED | truths 12, 14-16 |
| NOTIF-03 | 02-02 | Notice on override revoked | SATISFIED | truths 13-16 |
| NOTIF-04 | 02-04 | Notice when in-library use starts | SATISFIED | truths 29-31 |
| NOTIF-05 | 02-04 | Notice when in-library use overdue | SATISFIED | truths 32-34 |
| NOTIF-06 | 02-03 | Notice on printing paused | SATISFIED | truths 19-20, 22-27 (one concurrency item human-routed, truth 28) |
| NOTIF-07 | 02-03 | Notice on printing resumed | SATISFIED | truths 21-27 |
| NOTIF-08 | 02-04 | Borrow confirmed has source, link, dedupe key | SATISFIED | truth 36 |
| NOTIF-09 | 01, 02, 03, 04 | Saved in action's transaction, once per event | SATISFIED | truths 9, 10, 16, 26, 31, 37; every insert before `commit()`, `ON CONFLICT DO NOTHING`; NOTIF-09 concurrency for printing depends on item 1 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (changed files) | - | No TBD/FIXME/XXX/TODO, no stubs, no empty handlers in the phase diff | - | None |
| desk-circulation.service.ts `flagUnreturnedInLibrary` | per-row title read | Throws if a flagged use has no joinable title, rolling back the whole sweep | Advisory | Intentional (comment/test "a failing overdue notice rolls the whole sweep back"), consistent with R9. A single use with no title would block the sweep until fixed. The `copy()` helper already requires a title join to start a use, so it cannot occur through normal checkout. |
| desk-circulation.service.ts | - | Dense one-line style, file well over 800 lines | Advisory | Pre-existing house style; not introduced by this phase |

### Human Verification Required

#### 1. Concurrent identical printing saves
**Test:** Two simultaneous `PATCH /printing/service-status` saves of the same state on a real Postgres with users holding open requests.
**Expected:** One set of notices total.
**Why human:** Backstop-tier truth; only SQL text asserted, no race run.

#### 2. Overdue notice wording (P4)
**Test:** Read the overdue body text in `inLibraryNotice('overdue')`.
**Expected:** No penalty threat.
**Why human:** Judgment-tier prohibition; LLM verdict is non-authoritative (unverified-prohibition, human review recommended). Wording read: "<title> was due back at the library desk by <time>. Please return it to the library desk." Regex test backstop passes.

### Gaps Summary

No gaps. All nine requirements are implemented, wired and covered by passing tests; no migration was needed. The status is human_needed only because one backstop-tier concurrency truth cannot be proven by the single-connection test, and one judgment-tier prohibition (P4) must be signed off by a human. Neither indicates a defect found in the code. The code, tests and requirement IDs were checked directly, not taken from the SUMMARY files.

---

_Verified: 2026-11-19_
_Verifier: Claude (gsd-verifier)_
