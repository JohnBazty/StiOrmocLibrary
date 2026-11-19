# Phase 2: User notification gaps — Specification

**Created:** 2026-11-19
**Ambiguity score:** 0.17 (gate: ≤ 0.20)
**Requirements:** 9 locked

## Goal

Six librarian actions that today send the affected user nothing (return, clearance override granted, override revoked, in-library use started, in-library use overdue, printing paused/resumed) each create exactly one in-app notice for that user, and the Borrow confirmed notice gets the same source, link and dedupe fields as every other notice.

## Background

User notices are rows in `notifications` (`user_id, message_title, message_body, trigger_type, source_type, source_id, action_path, priority, dedupe_key`, unique on `(user_id, dedupe_key)`). Fines, lost books, reservations, printing status, due dates and attendance already write them, usually inside the same transaction as the action (for example `fines.service.ts` "Cash payment received").

Gaps found on 2026-11-19 by matching every staff write route to the notices it creates:

- **Return:** `PUT /borrowing/:transactionId/return` (`circulation.service.ts:648`) and the desk `POST /return` (`desk-circulation.service.ts` `returnCopy`) write only an `admin_notifications` "Return completed" row. The late fine is computed and saved at return (`circulation.service.ts:640`) but the borrower is not told.
- **Clearance override:** `POST /clearance/:userId/overrides` and `.../:overrideId/revoke` change the user's clearance status with no user notice.
- **In-library use:** starting a use (`desk-circulation.service.ts`, `in_library_uses` insert) sends nothing; the overdue sweep (`desk-circulation.service.ts:82`) moves the use to `Review` and alerts librarians only.
- **Printing service:** `PATCH /printing/service-status` (`printing_service_settings.accepting_requests`) tells nobody.
- **Borrow confirmed:** `circulation.service.ts:588` inserts the notice with no `source_type`, `source_id`, `action_path` or `dedupe_key`.

## Requirements

1. **R1 Book returned**: Every recorded return creates one "Book returned" notice for the borrower.
   - Current: Both return routes notify librarians only.
   - Target: The borrower gets one notice naming the title and the return time in Asia/Manila time; when a fine row with an amount above ₱0 was saved for that return, the notice also states the amount as ₱ with 2 decimals, exactly as stored; when the return recorded a condition other than Good, the notice also states that condition.
   - Acceptance: A return through each route creates exactly one notice for the borrower with the title and time; a late return's notice shows the stored fine amount; an on-time return's notice has no fine text; a return recorded as Damaged says "Condition recorded: Damaged"; a Good return has no condition text.

2. **R2 Clearance override granted**: Granting an override creates one notice for the user.
   - Current: No user notice.
   - Target: One notice per new override stating the user's new clearance status, linking to the user's clearance page.
   - Acceptance: After a grant, the user has exactly one notice with the new status.

3. **R3 Clearance override revoked**: Revoking an override creates one notice for the user.
   - Current: No user notice.
   - Target: One notice stating the new clearance status and "Contact the library for details". The librarian's typed reason is never included.
   - Acceptance: After a revoke, the user has exactly one notice with the new status and that sentence; the reason text appears nowhere in it.

4. **R4 In-library use started**: Starting an in-library use creates one notice for the borrower.
   - Current: No user notice.
   - Target: One notice naming the title (book or research item) and the hand-back time in Asia/Manila time.
   - Acceptance: After starting a use of a book and of a research item, each borrower has exactly one notice with the title and hand-back time.

5. **R5 In-library use overdue**: When the sweep moves a use to `Review`, the borrower gets one notice asking them to hand the copy back.
   - Current: Librarians are alerted; the borrower is not.
   - Target: One notice per overdue use, sent only for uses the sweep actually moved.
   - Acceptance: A use past its hand-back time produces one borrower notice after the sweep; running the sweep again adds none; a use handed back before the sweep produces none.

6. **R6 Printing paused**: Switching the printing service from accepting to not accepting requests notifies users with an open print request.
   - Current: Nobody is told.
   - Target: Each user with at least one print request whose status is not `Completed` or `Cancelled` gets one "Printing paused" notice per switch; other users get nothing. When the librarian saved a non-empty public unavailable reason with the pause, the notice includes it.
   - Acceptance: With two users holding open requests and one holding only completed requests, a pause creates exactly two notices; a pause saved with reason "Out of paper" puts that text in each notice; a pause without a reason has no reason text.

7. **R7 Printing resumed**: Switching back to accepting requests notifies the same set of users.
   - Current: Nobody is told.
   - Target: Each user with an open print request gets one "Printing resumed" notice per switch.
   - Acceptance: After pause then resume, each user with an open request has one paused and one resumed notice.

8. **R8 Borrow confirmed fields**: The Borrow confirmed notice is saved like the other notices.
   - Current: `source_type`, `source_id`, `action_path`, `dedupe_key` are null.
   - Target: All four are set; the dedupe key is unique per loan; the action path matches the borrower's role.
   - Acceptance: A checkout creates a Borrow confirmed row with all four fields set; a Faculty borrower's path starts with `/faculty/`, a Student's with `/student/`.

9. **R9 One notice per event, same transaction**: Every notice in R1 to R8 is written in the same database transaction as its action and is deduplicated per event.
   - Current: Not applicable (notices missing).
   - Target: A failed notice insert rolls back the action; a retried request for the same event never creates a second notice.
   - Acceptance: Forcing the notice insert to fail leaves the action unsaved; repeating the same event key creates no second row.

## Boundaries

**In scope:**
- In-app notices for R1 to R7
- Field fix for the Borrow confirmed notice (R8)
- Role-correct action paths on every new notice
- Tests for every requirement, edge and prohibition below

**Out of scope:**
- Account status change notices — a deactivated user cannot sign in to read them; needs email
- Semester end and roster eligibility notices — affects every enrolled user at once and needs its own wording
- Invoice issued or voided notices — invoices are stored by customer name and school ID, not user account, and fines and printing already send receipt notices
- Email or SMS delivery — Gmail SMTP notices are a separate roadmap item
- A notice when an in-library copy is handed back — owner chose start and overdue only (5a)
- New web UI — the existing notifications screen already lists these rows

## Constraints

- Postgres only, parameterized `pg` queries, same transaction as the action (project rules).
- Reuse the existing `notifications` table and its `(user_id, dedupe_key)` uniqueness; no migration expected. If planning finds one is needed, it is additive and gets its own number per the migration tracker.
- Times shown in Asia/Manila; money as ₱ with 2 decimals.
- Tests first with `node --test` and supertest next to the code.

## Acceptance Criteria

- [ ] R1: each return route creates exactly one "Book returned" notice for the borrower with title and Manila return time
- [ ] R1/E1: a return at or before the due time, or with a ₱0 fine, has no fine text
- [ ] R1/E2: a late return's notice shows the stored fine amount as ₱ with 2 decimals, no extra rounding
- [ ] R1/E3: one return produces one notice, whichever route recorded it
- [ ] R1: a return recorded with a condition other than Good states "Condition recorded: <condition>"; a Good return has no condition text
- [ ] R6: a pause saved with a non-empty unavailable reason includes that reason; a pause without one has no reason text
- [ ] R2: a grant creates exactly one notice with the new clearance status
- [ ] R3: a revoke creates exactly one notice with the new status and "Contact the library for details"
- [ ] R2/R3/E4: one notice per override id; revoking an already revoked override creates none
- [ ] R4/E5: starting a use of a book or a research item creates one notice with title and hand-back time
- [ ] R5/E6: the sweep creates one notice per use it moves to Review; a second sweep creates none; a use handed back before the sweep creates none
- [ ] R6/E9: a pause notifies only users with a request not Completed or Cancelled; with none, the switch still saves and no notices are written
- [ ] R7: a resume notifies the same set of users
- [ ] R6/R7/E7: pause then resume within one minute produces one paused and one resumed notice per user
- [ ] R6/R7/E8: saving the state it already has (paused to paused) creates no notice
- [ ] R8/E10: Borrow confirmed has source_type, source_id, action_path and dedupe_key set; every new notice links to `/faculty/...` for Faculty and `/student/...` for Student
- [ ] R9/E11: a failing notice insert rolls back the action
- [ ] MUST NOT (P1): no user notice contains a librarian's typed override reason
- [ ] MUST NOT (P2): no notice names another user or the acting librarian
- [ ] MUST NOT (P3): no notice mentions a fine unless a fine row above ₱0 was saved for that return
- [ ] MUST NOT (P4): the overdue hand-back notice does not threaten a penalty

## Edge Coverage

**Coverage:** 21/21 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| boundary | R1 | ✅ covered | E1: return at the due time or ₱0 fine → no fine text |
| precision | R1 | ✅ covered | E2: stored amount, ₱ with 2 decimals, no extra rounding |
| unclassified | R2 | ✅ covered | E4: one notice per override id |
| unclassified | R3 | ✅ covered | E4: revoking an already revoked override sends none |
| unclassified | R4 | ✅ covered | E5: research item without a physical copy still named |
| unclassified | R5 | ✅ covered | E6: handed back before the sweep → none; sweep twice → one |
| adjacency | R6 | ✅ covered | E7: each real switch is its own event |
| empty | R6 | ✅ covered | E9: no open requests → switch saves, no notices |
| ordering | R6 | ⛔ dismissed | Order of notices across users has no meaning to any user |
| concurrency | R6 | ✅ covered | E8: same-state save sends nothing, so two simultaneous identical saves send one set |
| adjacency | R7 | ✅ covered | E7 |
| empty | R7 | ✅ covered | E9 |
| ordering | R7 | ⛔ dismissed | Same as R6 ordering |
| concurrency | R7 | ✅ covered | E8 |
| adjacency | R8 | ⛔ dismissed | One notice per loan; no two events can touch |
| empty | R8 | ✅ covered | E10: role decides the path; every borrower has a role |
| ordering | R8 | ⛔ dismissed | Single row per loan |
| adjacency | R9 | ⛔ dismissed | Cross-cutting rule; adjacency is covered per event in R1 to R7 |
| empty | R9 | ⛔ dismissed | Cross-cutting rule; empty cases covered in E1, E9 |
| ordering | R9 | ⛔ dismissed | Cross-cutting rule; no ordered output |
| concurrency | R9 | ✅ covered | E11: notice failure rolls back the action; dedupe key blocks retries |

## Prohibitions (must-NOT)

**Coverage:** 4/4 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT include the librarian's typed override reason in a user notice (P1) | R2, R3 | resolved | test |
| MUST NOT name another user or the acting librarian in a notice (P2) | R1–R7 | resolved | test |
| MUST NOT mention a fine unless a fine row above ₱0 was saved for that return (P3) | R1 | resolved | test |
| MUST NOT threaten a penalty in the overdue hand-back notice (P4) | R5 | resolved | judgment |

Canon items (injection, access control, personal data handling) are owned by the security review before the PR; not minted here.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                         |
|--------------------|-------|------|--------|-----------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Six actions plus one field fix, named         |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | Three gaps deferred with reasons              |
| Constraint Clarity | 0.75  | 0.65 | ✓      | Same transaction, dedupe, Manila time, ₱      |
| Acceptance Criteria| 0.75  | 0.70 | ✓      | 21 pass/fail criteria                         |
| **Ambiguity**      | 0.17  | ≤0.20| ✓      |                                               |

## Interview Log

| Round | Perspective     | Question summary                              | Decision locked |
|-------|-----------------|-----------------------------------------------|-----------------|
| 1     | Researcher      | Which of the eight gaps are in this phase?    | 1a: return, override, in-library, printing paused, Borrow confirmed fix; account status, semester end, invoices deferred |
| 1     | Simplifier      | What does Book returned say?                  | 2a: title, time, fine amount when late |
| 1     | Boundary Keeper | Who hears about printing paused?              | 3a: users with an open print request |
| 2     | Failure Analyst | Show the revoke reason?                       | 4a: status plus "Contact the library for details", no reason |
| 2     | Boundary Keeper | Which in-library moments notify?              | 5a: start and overdue only |
| 2     | Seed Closer     | Notify on resume?                             | 6a: yes, same users |
| 3     | Seed Closer     | Edge and must-NOT proposals E1–E11, P1–P4     | Accepted as proposed |

---

*Phase: 02-user-notification-gaps*
*Spec created: 2026-11-19*
*Next step: /gsd-discuss-phase 2 — implementation decisions (how to build what's specified above)*
