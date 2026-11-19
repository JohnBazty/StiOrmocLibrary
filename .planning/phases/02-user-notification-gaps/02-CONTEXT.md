# Phase 2: User notification gaps - Context

**Gathered:** 2026-11-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Users get exactly one in-app notice for six librarian actions that notify them nothing today (book returned, clearance override granted, clearance override revoked, in-library use started, in-library use overdue, printing paused/resumed), and the existing Borrow confirmed notice gets source, link and dedupe fields. In-app only; no email, no new UI screens.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**9 requirements are locked.** See `02-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `02-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- In-app notices for R1 to R7
- Field fix for the Borrow confirmed notice (R8)
- Role-correct action paths on every new notice
- Tests for every requirement, edge and prohibition

**Out of scope (from SPEC.md):**
- Account status change notices — needs email
- Semester end and roster eligibility notices — own wording, affects everyone
- Invoice issued or voided notices — not linked to user accounts; receipts already notify
- Email or SMS delivery — separate roadmap item
- A notice when an in-library copy is handed back — owner chose start and overdue only
- New web UI — existing notifications screen lists these rows

</spec_lock>

<decisions>
## Implementation Decisions

### Wording and priority
- **D-01:** Titles and priorities:

  | Notice | Title | Priority |
  |---|---|---|
  | R1 | Book returned | Normal |
  | R2, R3 | Clearance updated | Important |
  | R4 | In-library use started | Normal |
  | R5 | Please return the book to the desk | Important |
  | R6 | Printing paused | Important |
  | R7 | Printing resumed | Normal |
  | R8 | Borrow confirmed (title unchanged) | unchanged |

- **D-02:** Body style follows the fines notices: short plain sentences, title in the sentence, dates as `en-PH` medium date + short time in Asia/Manila (for example "Introduction to Algorithms was returned on Nov 19, 2026, 3:10 PM.").
- **D-03:** R5 body asks the borrower to return the title to the library desk and names the hand-back time it was due. No penalty wording (SPEC P4).

### Printing paused text
- **D-04:** When the librarian saved a non-empty unavailable reason with the pause, the R6 body includes it ("Printing is paused: <reason>. Your open requests are kept."). Without one: "Printing is paused. Your open requests are kept." The reason is already public on the student printing page; SPEC P1 covers only the clearance override reason.
- **D-05:** R7 body: "Printing has resumed. Your open requests will continue."

### Return notice details
- **D-06:** One notice per returned loan (one per book), never a combined notice; dedupe per borrow transaction. — **Reversibility:** reversible — dedupe keys are per notice row.
- **D-07:** Body order: return sentence; then "Late fine: ₱X.XX." only when a fine above ₱0 was saved for that return (SPEC P3); then "Condition recorded: <condition>." only when the return recorded a condition other than Good.
- **D-08:** Lost copies never reach this notice; the desk already rejects them into the lost-book flow, which has its own notices.

### Where each notice opens
- **D-09:** Action paths, `{role}` = `student` or `faculty` from the borrower's role:

  | Notice | action_path |
  |---|---|
  | R1 Book returned | `/{role}/borrowing` |
  | R8 Borrow confirmed, R4, R5 | `/{role}/my-books` |
  | R2, R3 Clearance updated | `/{role}/clearance` |
  | R6, R7 Printing | `/student/printing` for Student, `/staff/printing` for Staff, `/faculty/notifications` for Faculty |

- **D-10:** Faculty printing notices open `/faculty/notifications` because the web app has no `/faculty/printing` route.

### Claude's Discretion
- Exact `trigger_type` / `source_type` values and dedupe key formats, following existing ones (for example `print:<id>:<status>`, `reservation:<id>:<status>`).
- Whether to add a small shared helper for the role-to-path rule or keep inline SQL like the surrounding code.
- R4/R5 path for Staff borrowers if Staff can hold in-library uses (planner to confirm; fall back to `/staff/notifications`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements
- `.planning/phases/02-user-notification-gaps/02-SPEC.md` — Locked requirements — MUST read before planning

### Project rules
- `CLAUDE.md` and `AGENTS.md` — branches, tests first, review agents, no destructive commands
- `agent.md` — architecture, module boundaries, roles
- `docs/schema-context.md` — `notifications` table columns and `(user_id, dedupe_key)` uniqueness
- `.cursor/agent-protocol.md` — migration tracker (only if planning finds a migration is needed; none expected)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/src/modules/fines/fines.service.ts` (around lines 320-440): model inline `INSERT INTO notifications(... dedupe_key, scheduled_for, delivered_at) ... ON CONFLICT DO NOTHING` inside the action transaction.
- `apps/api/src/modules/printing/printing.service.ts:100`: existing role-to-path rule for print notices.
- `apps/api/src/modules/attendance/attendance-operations.service.ts:86`: role-based path for Student/Faculty/Staff.

### Established Patterns
- Notices are written in the same transaction as the action with a dedupe key and `ON CONFLICT (user_id, dedupe_key) DO NOTHING`.
- Librarian alerts go to `admin_notifications`; keep those unchanged and add the user notice next to them.
- Times formatted in Asia/Manila (`toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })`).

### Integration Points
- R1: `apps/api/src/modules/circulation/circulation.service.ts` return path (~640-648, fine saved at ~640) and desk `returnCopy` in `apps/api/src/modules/circulation/desk-circulation.service.ts:122` (records condition).
- R2/R3: `apps/api/src/modules/clearance/clearance.service.ts` `applyOverride` (242) and `revokeOverride` (254).
- R4: in-library use insert in `apps/api/src/modules/circulation/desk-circulation.service.ts:119`.
- R5: overdue sweep `apps/api/src/modules/circulation/desk-circulation.service.ts:82` (moves uses to Review; `RETURNING use_id, user_id, ...`).
- R6/R7: `setServiceStatus` in `apps/api/src/modules/printing/printing.service.ts:125`; open request = `job_status NOT IN ('Completed','Cancelled')`.
- R8: `apps/api/src/modules/circulation/circulation.service.ts:588`.

</code_context>

<specifics>
## Specific Ideas

Example R1 bodies (owner-approved):
- "Introduction to Algorithms was returned on Nov 19, 2026, 3:10 PM."
- "Introduction to Algorithms was returned on Nov 19, 2026, 3:10 PM. Late fine: ₱20.00."
- "Introduction to Algorithms was returned on Nov 19, 2026, 3:10 PM. Late fine: ₱20.00. Condition recorded: Damaged."

</specifics>

<deferred>
## Deferred Ideas

- Existing Faculty print notices link to `/faculty/printing`, a route the web app does not have (`apps/api/src/modules/printing/printing.service.ts:100` vs `apps/web/src/App.tsx`). Fix in its own small change.
- Account status, semester end and invoice notices (from SPEC out of scope).

</deferred>

---

*Phase: 02-user-notification-gaps*
*Context gathered: 2026-11-19*
