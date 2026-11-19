# Phase 2: User notification gaps - Research

**Researched:** 2026-11-19
**Domain:** In-app notices (`notifications` rows) written inside existing Express + `pg` service transactions
**Confidence:** HIGH (every call site was read in this session; the only MEDIUM item is PGlite-vs-Supabase parity, see Assumptions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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
- **D-04:** When the librarian saved a non-empty unavailable reason with the pause, the R6 body includes it ("Printing is paused: <reason>. Your open requests are kept."). Without one: "Printing is paused. Your open requests are kept." The reason is already public on the student printing page; SPEC P1 covers only the clearance override reason.
- **D-05:** R7 body: "Printing has resumed. Your open requests will continue."
- **D-06:** One notice per returned loan (one per book), never a combined notice; dedupe per borrow transaction. (reversible - dedupe keys are per notice row)
- **D-07:** Body order: return sentence; then "Late fine: ₱X.XX." only when a fine above ₱0 was saved for that return (SPEC P3); then "Condition recorded: <condition>." only when the return recorded a condition other than Good.
- **D-08:** Lost copies never reach this notice; the desk already rejects them into the lost-book flow, which has its own notices.
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

### Deferred Ideas (OUT OF SCOPE)
- Existing Faculty print notices link to `/faculty/printing`, a route the web app does not have (`printing.service.ts:100` vs `apps/web/src/App.tsx`). Fix in its own small change.
- Account status, semester end and invoice notices (from SPEC out of scope).
- (SPEC out of scope) email/SMS, a notice when an in-library copy is handed back, new web UI.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTIF-01 | R1 Book returned notice, both routes, fine + condition text | Both routes reach one `returnBook`; fine read back after upsert; condition passed as an explicit option (Findings 1) |
| NOTIF-02 | R2 override granted | `applyOverride` must become a transaction; status from in-transaction `compute` (Finding 2) |
| NOTIF-03 | R3 override revoked, no reason | Same; already-revoked path throws 404 before any notice (Finding 2) |
| NOTIF-04 | R4 in-library use started | Insert after `in_library_uses` insert, `c.title` covers research items (Finding 3) |
| NOTIF-05 | R5 in-library overdue | Per-row notice inside `flagUnreturnedInLibrary`, rows come only from the guarded UPDATE (Finding 3) |
| NOTIF-06 | R6 printing paused | `setServiceStatus` becomes a locked transaction with transition detection (Finding 4) |
| NOTIF-07 | R7 printing resumed | Same code path, opposite transition (Finding 4) |
| NOTIF-08 | R8 Borrow confirmed fields | Replace insert at `circulation.service.ts:588`; role already in `borrower.role_name` (Finding 5) |
| NOTIF-09 | R9 one notice per event, same transaction | One shared `insertUserNotice` helper using `ON CONFLICT (user_id, dedupe_key) DO NOTHING`; failing insert rolls back (Findings 1-5) |
</phase_requirements>

## Summary

All nine requirements are additive inserts into the existing `notifications` table, so **no migration is needed**. The table already has every column the notices need, no CHECK on `trigger_type`, `priority` or `source_type`, and `UNIQUE (user_id, dedupe_key)` [VERIFIED: database/supabase/001_from_baseline.sql:661-683]. Existing code writes the same shape in six places (fines, lost-book, printing receipt, attendance, the notification worker).

Two of the five actions are **not transactional today** and need the real work: clearance `applyOverride`/`revokeOverride` (run on the pool with no transaction at all, `clearance.service.ts:242-266`) and printing `setServiceStatus` (a single `pool.execute` upsert, `printing.service.ts:125`). R9 ("failed notice insert rolls back the action") forces both onto a connection with `beginTransaction`/`commit`/`rollback`. The other three (return, in-library start/sweep, Borrow confirmed) already run in one transaction, so each is a small insert plus a handful of read-backs.

Return is simpler than feared: the desk `returnCopy` does **not** duplicate the return, it delegates take-home returns to the same `circulation.service.ts` `returnBook` through `transactionPool(q)` (`desk-circulation.service.ts:73,123`). One insert in `returnBook` covers both routes exactly once. The trap is the condition: `returnBook` cannot infer "condition recorded by this return" from `pc.condition_status` (a Worn copy returned through the plain PUT route would wrongly say "Condition recorded: Worn"), so the desk must pass `assessment.condition` in explicitly.

**Primary recommendation:** Add one tiny shared module `apps/api/src/modules/notifications/user-notices.ts` (`insertUserNotice`, `rolePath`, `manilaTime`), call it from the five sites inside their existing/new transactions, add an optional `{condition}` argument to `returnBook`, refactor `clearance.compute` to accept an executor (sequential on a connection), and wrap `setServiceStatus` in a `FOR UPDATE` transaction that notifies only on a real accepting-flag change.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Writing the notice row | API / Backend (service layer, same txn as the action) | Database (unique key dedupes) | SPEC R9: same transaction; project rule: parameterized `pg` |
| Deciding "is this a real change" (printing) | API / Backend (row lock inside txn) | Database (`FOR UPDATE`) | Must hold under concurrent saves |
| Role-correct `action_path` | API / Backend | Browser (`notificationRoute` only rewrites `/student/` to `/faculty/`) | SPEC E10 wants the right prefix stored; client rewrite is a harmless backstop |
| Listing / reading notices | Browser + existing notifications module | Database | Out of scope: existing screen lists these rows [VERIFIED: notification.repository.ts:52-60 filters `deleted_at`, `scheduled_for`, `expires_at` only] |
| Manila time formatting | API / Backend (string baked into body) | - | Body is stored text, so formatting happens at write time |

## Standard Stack

No new packages. Everything below is already installed and in use.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` (via `config/pg-pool.js`) | 8.23.0 [VERIFIED: node_modules/pg/package.json] | Postgres, `?` placeholders, `getConnection` transactions | Project rule |
| `node:test` + `node:assert/strict` | Node v24.22.0 [VERIFIED: `node --version`] | API test runner | `apps/api/package.json` `"test": "node --test ..."` |
| `supertest` | ^7.2.2 [VERIFIED: apps/api/package.json] | Route tests | Project rule |
| `@electric-sql/pglite` | ^0.3.14 [VERIFIED: apps/api/package.json] | Real-Postgres SQL tests without a live DB | Already used by `reservation-settings.test.ts`, `job-runner/*.test.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared helper | Inline INSERT per site (as fines do) | 8 call sites (R1, R2, R3, R4, R5, R6, R7, R8) repeat an 11-column INSERT; one helper is smaller and gives one place to test dedupe and path rules. Discretion item, recommend helper. |
| Per-user loop for printing | Set-based `INSERT ... SELECT` | Set-based needs `?::bigint` casts on every parameter in the SELECT list and a CASE for the role path; loop reuses the proven VALUES insert and the printing fake's `?`-count assertion. Recommend loop (open-request users are few). |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed by this phase. Nothing to audit. **Packages removed due to SLOP:** none. **Flagged SUS:** none.

## Architecture Patterns

### System Architecture Diagram

```
Librarian action (HTTP)
 |
 +-- PUT /borrowing/:id/return --------------------------+
 +-- POST /return (desk returnCopy) --receipt() replay--+--> circulation.returnBook(actor, txId, {condition})
 |        (assessment.condition passed in)               |      lock bt row -> UPDATE Returned -> fine upsert (late only)
 |                                                       |      -> SELECT stored fine_amount -> prepareReturnedCopy
 |                                                       |      -> insertUserNotice('loan:<tx>:returned')  -> admin_notifications -> COMMIT
 +-- POST desk checkout (InLibrary) --> INSERT in_library_uses --> insertUserNotice('in-library-use:<use>:started') -> COMMIT
 +-- POST desk checkout (TakeHome)  --> confirmCheckout --> insertUserNotice('loan:<tx>:borrowed') -> COMMIT
 +-- job 'in-library-unreturned' / desk uses() --> flagUnreturnedInLibrary
 |        UPDATE ... WHERE status='Open' RETURNING (only moved rows) --> per row: admin alert + insertUserNotice('in-library-use:<use>:overdue')
 +-- POST /clearance/:u/overrides            --> BEGIN; role check; INSERT override; compute(in txn); insertUserNotice('clearance-override:<id>:granted'); COMMIT
 +-- POST /clearance/:u/overrides/:o/revoke  --> BEGIN; UPDATE ... WHERE revoked_at IS NULL (0 rows => 404, rollback); compute(in txn); insertUserNotice('...:revoked'); COMMIT
 +-- PATCH /printing/service-status          --> BEGIN; SELECT accepting FOR UPDATE; upsert; if flag changed: users with open requests -> insertUserNotice each; COMMIT
                                                  (same-state save: upsert only, no notices)
Every insertUserNotice: INSERT INTO notifications(...) VALUES(...) ON CONFLICT (user_id, dedupe_key) DO NOTHING
```

### Recommended Project Structure
```
apps/api/src/modules/
  notifications/user-notices.ts        # NEW: insertUserNotice, rolePath, manilaTime (+ user-notices.test.ts)
  circulation/circulation.service.ts   # returnBook(+options), confirmCheckout R8
  circulation/desk-circulation.service.ts  # pass condition; R4 insert; R5 per-row notice
  clearance/clearance.service.ts       # compute(executor), applyOverride/revokeOverride transactional
  printing/printing.service.ts         # setServiceStatus transactional
```

### Pattern 1: shared helper (recommended shape)
```typescript
// Source: modeled on fines.service.ts:383-386 and clearance.service.ts:305-308 (same columns, same ON CONFLICT)
export type UserNotice = { userId: number; title: string; body: string; triggerType: string; sourceType: string
  sourceId: number; actionPath: string | null; priority: 'Normal' | 'Important' | 'Urgent'; dedupeKey: string }
export async function insertUserNotice(q: Pick<PoolConnection, 'execute'>, n: UserNotice) {
  await q.execute(
    `INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
     VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW()) ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [n.userId, n.title, n.body, n.triggerType, n.sourceType, n.sourceId, n.actionPath, n.priority, n.dedupeKey])
}
```
Column limits to respect: `message_title VARCHAR(150)`, `source_type VARCHAR(40)`, `action_path VARCHAR(255)`, `dedupe_key VARCHAR(191)` [VERIFIED: 001_from_baseline.sql:664,667,669,671]. Titles from D-01 are well under 150; a title string with a user-typed printing reason lives in the body (TEXT), not the title.

`rolePath(role, page)` rule (pure function, unit-tested): `Student` -> `/student/<page>`, `Faculty` -> `/faculty/<page>`; any other role (Staff, Librarian, Admin) -> `/<role lowercased>/notifications` because the web app only has `notifications` under `/staff`, `/librarian`, `/admin` [VERIFIED: apps/web/src/App.tsx lines 98, 111, 142: `/admin/notifications`, `/librarian/notifications`, `/staff/notifications`; no `/staff/my-books`, `/staff/borrowing`, `/staff/clearance`]. For printing: Student `/student/printing`, Staff `/staff/printing` [VERIFIED: App.tsx:82,139], Faculty `/faculty/notifications` (D-10), others the same fallback.

`manilaTime(value)` = `new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })`. On Node v24.22.0 this prints `"Nov 19, 2026, 3:10 PM"` with a plain space and no non-ASCII characters [VERIFIED: ran it]. Still build test expectations with the same formatter instead of a literal.

### Notice catalogue (discretion values; follows existing `loan:`/`print:`/`lost-report:` key style)

| Req | trigger_type | source_type | source_id | dedupe_key | Role source |
|-----|--------------|-------------|-----------|------------|-------------|
| R1 | `Return` | `Borrow Transaction` | transactionId | `loan:<tx>:returned` | `(SELECT user_role FROM users WHERE user_id=bt.user_id) AS user_role` added to the loan SELECT |
| R2 | `Clearance` | `Clearance Override` | overrideId | `clearance-override:<id>:granted` | `SELECT user_role FROM users WHERE user_id=?` in the txn |
| R3 | `Clearance` | `Clearance Override` | overrideId | `clearance-override:<id>:revoked` | same |
| R4 | `In-Library Use` | `In-Library Use` | useId | `in-library-use:<use>:started` | `qr.role` (already in scope, `desk-circulation.service.ts:119`) |
| R5 | `In-Library Use` | `In-Library Use` | useId | `in-library-use:<use>:overdue` | per-row SELECT joining `users` |
| R6 | `Printing Update` | `Printing Service` | 1 (settings_id) | `print-service:<randomUUID>:paused` | `u.user_role` from the open-request query |
| R7 | `Printing Update` | `Printing Service` | 1 | `print-service:<randomUUID>:resumed` | same |
| R8 | `Due Date` (unchanged) | `Borrow Transaction` | transactionId | `loan:<tx>:borrowed` | `borrower.role_name` |

`Printing Update` gets the printer icon and `Due Date` the calendar icon in the web client; other values fall back to the bell [VERIFIED: apps/web/src/features/notifications/notification-display.ts:11-17]. The worker already uses `Borrow Transaction` as `source_type` for loans and keys `loan:<tx>:due-12h`, `loan:<tx>:overdue`, so `loan:<tx>:returned` / `:borrowed` cannot collide with them [VERIFIED: notification.worker.ts:55-77].

### Anti-Patterns to Avoid
- **Reading `pc.condition_status` as "the condition recorded"** in `returnBook`: it is the copy's prior condition on the PUT route. Pass the assessment in.
- **Notifying outside the transaction** (e.g. after `commit`): violates R9. Insert before `commit`.
- **Calling `Promise.all` on a single connection**: `pg` 8.23 prints a deprecation ("Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0") [VERIFIED: node_modules/pg/lib/client.js:36]. `compute` currently uses `Promise.all` on the pool; on a connection it must run sequentially.
- **Using `loan.condition_status`/fine arithmetic for the fine text**: use the stored row (see Finding 1).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent notice | Check-then-insert | `ON CONFLICT (user_id, dedupe_key) DO NOTHING` | Race-free, matches 6 existing sites |
| Transaction wrapper for clearance/printing | New abstraction | Copy the in-file pattern `getConnection` / `beginTransaction` / `try commit catch rollback finally release` (e.g. `clearance.service.ts:272-312`) | Matches surrounding code and the fake-connection test style |
| Clearance "new status" | Re-deriving loans/fines/lost-book logic | Existing `compute` (the exact value the user sees on the clearance page) | A second definition already exists (`fines.service.ts:216 refreshClearance`) and ignores overrides; do not add a third |
| Role to path in SQL | `CASE` in each INSERT | `rolePath()` in TS | One tested function |

## Findings (planner's 8 questions)

### 1. Return paths (NOTIF-01) - one delegate, one insert
- Desk `returnCopy` take-home branch: `if(a.kind==='TakeHome')result=await createCirculationService(transactionPool(q),clock).returnBook(actor.accountId,a.id)` [VERIFIED: desk-circulation.service.ts:123]. `transactionPool` hands back the same connection with no-op begin/commit/rollback [VERIFIED: desk-circulation.service.ts:73]. The only other caller of `returnBook` is the controller behind `PUT /borrowing/:transactionId/return` [VERIFIED: circulation.controller.ts:47, circulation.routes.ts:33]. A grep for `transaction_status = 'Returned'` finds exactly one writer, `circulation.service.ts:638`. So **one notice in `returnBook` is written once for both routes**.
- Exactly-once guards already exist: the loan row is selected `FOR UPDATE` and rejected unless `Borrowed`/`Overdue` (`circulation.service.ts:632,636`); the desk wraps the whole thing in `receipt()` which replays the stored result for a repeated `requestId` without re-running (`desk-circulation.service.ts:94`). Add the dedupe key `loan:<tx>:returned` as the third guard.
- Where to insert: inside the block at `circulation.service.ts:648` (currently one dense line: `prepareReturnedCopy`, then the `admin_notifications` "Return completed" insert, then `commit`). Split it onto lines and put `insertUserNotice` before `commit`. Keep the `admin_notifications` insert unchanged.
- **Saved fine**: the late-fine upsert is `INSERT INTO fines(...) ... ON CONFLICT (transaction_id) DO UPDATE SET fine_amount=...` at `circulation.service.ts:641-646`, guarded by `if(loan.due_at&&(loan.transaction_status==='Overdue'||localTimestamp(loan.due_at)<returnedAt.getTime()))` (line 639). The column is `fine_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00` [VERIFIED: 001_from_baseline.sql:279 via grep]. Recommended: inside that `if`, after the upsert, run `SELECT fine_amount FROM fines WHERE transaction_id=? LIMIT 1` and keep `const fine = Number(row.fine_amount)`; text only when `fine > 0`; render `` `₱${fine.toFixed(2)}` ``. Reading the stored row (not `charge.amount`) satisfies "exactly as stored", and the value is already 2-decimal so `toFixed(2)` adds no rounding. A ₱0 row (status Overdue but within grace) yields no fine text (E1). The pg driver returns NUMERIC as a string; `Number()` handles both. Do not use the `RETURNING` form: fakes return `[{affectedRows:1}]` with no `rows`.
- **Condition**: `returnBook(actorAccountIdValue, transactionIdValue)` has no condition input today. Add an optional third parameter `options: { condition?: string | null } = {}`. Desk passes `assessment.condition` (null when none; `'Lost'` is rejected earlier at line 122, so values are `Good`/`Worn`/`Damaged`) [VERIFIED: desk-circulation.service.ts:25,122]. The desk writes the new condition to `physical_copies` *before* calling `returnBook` (line 122), so reading `pc.condition_status` would work only for the desk route; the explicit option works for both. Text only when `condition && condition !== 'Good'`: `Condition recorded: ${condition}.`
- Body (D-02/D-07): `` `${title} was returned on ${manilaTime(returnedAt)}.` `` + ` Late fine: ₱X.XX.` + ` Condition recorded: Damaged.` Matches the three owner-approved examples in CONTEXT.md.
- In-library hand-back is NOT in R1 (SPEC out of scope; the desk's in-library branch `desk-circulation.service.ts:124` stays untouched).
- Fakes: the existing `returnBook` test fake already answers `INSERT INTO notifications` (circulation.service.test.ts, "return assigns the copy..." test) and matches the loan row by `FROM borrow_transactions bt`, so adding a scalar subquery to that SELECT does not need a new fake branch; a new `SELECT fine_amount FROM fines` needs one.

### 2. Clearance overrides (NOTIF-02, NOTIF-03)
- Both methods run on the **pool with no transaction**: `database.execute` for the INSERT/UPDATE, then `compute(userId)` [VERIFIED: clearance.service.ts:247-251, 260-265]. R9 requires converting each to `getConnection` + `beginTransaction`/`commit`/`rollback`.
- "New clearance status" = the `status` field returned by `compute`, i.e. `activeOverride?.override_status ?? computedStatus`, the same value the user sees on the clearance page [VERIFIED: clearance.service.ts:158-159]. Override statuses are only `Cleared` or `Not Cleared` [VERIFIED: clearance.validation.ts:15]. After a **grant** the status is the new override's status (it is the newest active one); after a **revoke** it is another still-active override's status if one exists, otherwise the computed standing. So the revoke notice cannot just print the old override status; it must run `compute`.
- `compute(userId, updateCache = true)` reads through the module-level `database` using `Promise.all` over six queries (lines 81-145). Change the signature to `compute(userId, updateCache = true, executor: Pool | PoolConnection = database)`. For a connection run the six queries **sequentially** (`pg` 8.23 deprecates concurrent queries on one client, see Anti-Patterns); keep `Promise.all` for the pool path so the polling endpoint `mine()` stays parallel. Compute inside the transaction after the write; it also writes `clearance_statuses` there, which is harmless and consistent.
- Role/path: `compute` only accepts `Student`/`Faculty` and throws 404 `CLEARANCE_STUDENT_NOT_FOUND` otherwise (line 85,147). Today an override for any other `user_id` is **already committed** (autocommit) before that 404. In a transaction the 404 now rolls the insert back, which is strictly better; mention it in the plan and do not widen scope. Fetch `user_role` in the transaction (`SELECT user_role FROM users WHERE user_id=? LIMIT 1`) for `rolePath(role,'clearance')`.
- Bodies: R2 `Your clearance status is now ${status}.`; R3 `Your clearance status is now ${status}. Contact the library for details.` Never interpolate `input.reason` (P1) or the actor's name (P2). `compute`'s `reason` string ("Authorized override: <reason>") must not be used in the body either.
- Already-revoked: `UPDATE ... WHERE clearance_override_id=? AND user_id=? AND revoked_at IS NULL` returns `affectedRows 0` and throws `CLEARANCE_OVERRIDE_NOT_FOUND` (404) [VERIFIED: clearance.service.ts:260-264]. Keep that throw **before** any notice and let the catch roll back, so a repeat revoke creates nothing (E4). Grants always create a new override id, hence a new key (`clearance-override:<id>:granted`); a client retry of POST grant makes a second override, which is a second, legitimately distinct event (E4 says one per override id).
- No other callers: `applyOverride`/`revokeOverride` are only reached from the controller (`clearance.controller.ts:21-22`) [VERIFIED: grep]. No existing test covers them, so there is no fixture to protect.

### 3. In-library use (NOTIF-04, NOTIF-05)
- **Start** (line 119): runs inside `transaction()` (`desk-circulation.service.ts:86-90`: one connection, `library_profile_settings ... FOR UPDATE`, commit/rollback) and inside `receipt()` (idempotent replay by `requestId`). The insert is `INSERT INTO in_library_uses(user_id,physical_copy_id,material_id,research_inventory_id,attendance_log_id,started_at,hand_back_by,condition_out,started_by_account_id) VALUES (?,?,?,?,?,?,?,?,?)` and `r.insertId` is the `use_id` (the pg wrapper appends `RETURNING *` to INSERTs and takes the first `*_id` column, `use_id` is the first column) [VERIFIED: pg-pool.js:23-27,55-60; 023_revision_phase5_desk_circulation.sql:3]. Add the notice right after that insert: `userId=qr.userId`, role `qr.role` (set from `u.user_role`, `attendance-credential.service.ts:126`), `title=c.title`, hand-back = `handBackBy` which is an ISO string (`cutoffAt:cutoff?.toISOString()`, attendance-operations.policy.ts:30) so use `manilaTime(handBackBy)`.
- **Research items** (E5): the copy lookup falls back to `research_inventory` and still selects `t.title` (`desk-circulation.service.ts:33`), so `c.title` names the title for both; `physical_copy_id` is `NULL` there and must not be used as the notice source.
- **Staff can hold in-library uses**: `borrowerEligibility` accepts roles `['Student','Faculty','Staff','Librarian']` [VERIFIED: desk-circulation.policy.ts:21]. There are no `/staff/my-books` or `/librarian/my-books` routes, so `rolePath` falls back to `/staff/notifications` / `/librarian/notifications` for them. Student `/student/my-books`, Faculty `/faculty/my-books` exist [VERIFIED: App.tsx:80,155].
- **Sweep** (`flagUnreturnedInLibrary`, lines 79-84): `UPDATE in_library_uses SET status='Review',... WHERE status='Open' AND ended_at IS NULL AND hand_back_by<=? RETURNING use_id,user_id,COALESCE(physical_copy_id,research_inventory_id) AS physical_copy_id`. Only rows that were actually moved come back, so a second sweep returns none and a use handed back earlier (`status='Returned'`) never matches. That already satisfies E6; the notice goes in the existing `for(const row of result.rows??[])` loop next to the librarian alert. Extend `RETURNING` with `hand_back_by`, and per row run `SELECT t.title,u.user_role FROM in_library_uses iu JOIN users u ON u.user_id=iu.user_id LEFT JOIN physical_copies pc ON pc.physical_copy_id=iu.physical_copy_id LEFT JOIN research_inventory ri ON ri.research_inventory_id=iu.research_inventory_id JOIN titles t ON t.title_id=COALESCE(pc.title_id,ri.title_id) WHERE iu.use_id=?` (the same join `uses()` already uses, line 129). Do not interpolate `row.physical_copy_id`: it can be a research id.
- **Transaction + runner**: the function opens its own transaction when given a Pool (line 80) and reuses the caller's connection otherwise. Callers: the durable job `'in-library-unreturned'` (`job-runner.jobs.ts:44`) and desk `uses()` inside `transaction()` (line 129). Concurrent sweeps serialize on the `library_profile_settings FOR UPDATE` lock, and the row-level `UPDATE ... WHERE status='Open'` is re-evaluated after a lock wait, so a notice cannot be written twice; the key `in-library-use:<use>:overdue` is a third guard.
- Body (D-03, P4): `` `${title} was due back at the library desk by ${manilaTime(handBackBy)}. Please return it to the library desk.` `` Must not contain fine, penalty, charge or `₱`.

### 4. Printing pause/resume (NOTIF-06, NOTIF-07)
- `setServiceStatus` today: `INSERT INTO printing_service_settings(settings_id,accepting_requests,unavailable_reason,updated_by_user_id,updated_at) VALUES (1,?,?,?,NOW()) ON CONFLICT (settings_id) DO UPDATE SET ...` via `pool.execute`, no transaction, no read of the prior value [VERIFIED: printing.service.ts:125].
- Validation: `parseServiceStatus` returns `{ acceptingRequests, reason }` where `reason` is the trimmed text on pause and `null` on resume; a pause with fewer than 3 characters is rejected, max 255 [VERIFIED: printing.validation.ts:53-57]. So through the API a pause always has a reason; the "no reason" body (D-04) is only reachable by a direct service call, but implement it anyway (SPEC acceptance requires it).
- The reason is stored in `printing_service_settings.unavailable_reason VARCHAR(255)`; `accepting_requests INTEGER NOT NULL DEFAULT 1`; the single row is `settings_id = 1`, seeded by the migrations (`INSERT INTO printing_service_settings (settings_id,accepting_requests) VALUES (1,1)`) [VERIFIED: 001_from_baseline.sql:511-524; the repository's fallback for a missing row is `accepting_requests: 1`, printing.repository.ts:26-28].
- **Real change vs same-state save (E7/E8)**, recommended inside one transaction:
  1. `SELECT accepting_requests FROM printing_service_settings WHERE settings_id=1 FOR UPDATE` (missing row => treat previous as `1`).
  2. existing upsert (unchanged SQL).
  3. `const changed = Number(previous) !== (input.acceptingRequests ? 1 : 0)`; only if `changed`, notify.
  Two simultaneous identical saves serialize on the row lock: the second re-reads the already-flipped value after the first commits, sees no change, writes no notices (E8 concurrency). `paused -> paused` with a new reason is also "no change" (E8) but the upsert still saves the new reason.
- **Open-request users**: `SELECT DISTINCT pr.user_id,u.user_role FROM print_requests pr JOIN users u ON u.user_id=pr.user_id WHERE pr.job_status NOT IN ('Completed','Cancelled')`. The job statuses are `Pending`, `Printing`, `Ready for Pickup`, `Completed`, `Cancelled` [VERIFIED: printing.service.ts:17 `transitions`]. Empty result => no notices, switch still saved (E9). `DISTINCT` gives one notice per user even with several open requests.
- **Dedupe key per switch** (E7: pause, resume, pause must each notify; same-state retry must not): use `print-service:${randomUUID()}:paused|resumed`, generated once per real change and shared by all users of that change. Uniqueness comes from the UUID; idempotency (a retried request) comes from the locked transition check. A timestamp-based key was rejected: PGlite's `NOW()` has millisecond resolution, so a fast test cycle could collide (verified: `to_char(updated_at,'YYYYMMDDHH24MISSUS')` ended in `...033000`). `randomBytes` is already imported from `node:crypto` in this file; add `randomUUID`.
- Bodies (D-04/D-05): `Printing is paused: ${reason}. Your open requests are kept.` / `Printing is paused. Your open requests are kept.` / `Printing has resumed. Your open requests will continue.` The actor's name is never used (P2).
- Role path for print: Student `/student/printing`, Staff `/staff/printing`, Faculty `/faculty/notifications`, others via the fallback (see Pattern 1).
- Authorization is unchanged: `PATCH /service-status` sits behind the admin printing router, and `Staff` is limited to queue/status routes there [VERIFIED: printing.routes.ts:26-33].

### 5. Borrow confirmed (NOTIF-08)
- Current insert: `INSERT INTO notifications (user_id, message_title, message_body, trigger_type, is_read) VALUES (?, 'Borrow confirmed', ?, 'Due Date', 0)` [VERIFIED: circulation.service.ts:588]. Replace with `insertUserNotice` keeping title `Borrow confirmed`, body `` `${copy.title} is due ${dueAt.toLocaleString('en-PH',{...})}.` `` (unchanged text, now via `manilaTime(dueAt)`), `trigger_type 'Due Date'`, priority Normal, `source_type 'Borrow Transaction'`, `source_id transactionId`, `dedupe_key loan:<transactionId>:borrowed`.
- Key choice: `transactionId` is the primary key of the loan, and a claim reuses the existing pending transaction id (`pendingClaim` branch, lines 562-569), so exactly one key per loan, no collision with `loan:<tx>:due-12h|due-1h|overdue` from the worker.
- Role: `borrower.role_name` is already selected by `findBorrower` (`ro.role_name`) and the return value already exposes it as `role` (line 608); the existing test fake returns `role_name: role` (circulation.service.test.ts `checkoutPool`). `roles.role_name` is seeded with `Librarian`, `Student`, `Faculty` and `System Administrator` [VERIFIED: 001_from_baseline.sql:32-36] while notices elsewhere use `users.user_role`; the fallback path in `rolePath` makes any mismatch safe (never a wrong-role link).
- The test at circulation.service.test.ts "faculty checkout ... commits" expects `state.notifications === 2` (user notice + admin notice); that stays true because the fake counts any `INTO notifications` and `INSERT INTO admin_notifications`.

### 6. Existing test harness (for real verify commands)
- API runner: `node --test "src/**/*.test.ts"` [VERIFIED: apps/api/package.json]; single file from the repo root works: `node --test apps/api/src/modules/clearance/clearance.service.test.ts` passed (2 tests, ~0.3 s) [VERIFIED: ran it]. Root scripts: `npm test`, `npm run typecheck`, `npm run coverage` [VERIFIED: package.json:15-17]; API only: `npm test -w @sti-library/api`.
- Style 1, **SQL-matching fake connection** (most common): `{ beginTransaction, commit, rollback, release, execute(sql) { if (sql.includes(...)) return [...]; throw new Error('Unexpected SQL') } }` and `database = { getConnection: async () => connection, execute: connection.execute.bind(connection) } as unknown as Pool` (circulation.service.test.ts `checkoutPool`, the return test; printing.service.test.ts `serviceFixture` which also asserts `(sql.match(/\?/g)).length === values.length` per statement). Every new statement needs a fake branch or the test throws `Unexpected SQL`.
- Style 2, **real SQL with PGlite**: `new PGlite()`, `pg.exec('CREATE TABLE ...')`, then a pool shaped `{ execute, query, getConnection }` using `toPgPlaceholders(sql)` and `write ? [{affectedRows, rows}, result] : [rows, result]` (reservation-settings.test.ts lines 5-40; job-runner/pglite-pool.test.helper.ts). Use this for the printing switch and for notice dedupe/`ON CONFLICT`.
- Style 3, supertest + stub service for routes (circulation.api.integration.test.ts); not needed here because no routes or response shapes change.
- There are **no existing tests** for `setServiceStatus`, `applyOverride`/`revokeOverride`, `flagUnreturnedInLibrary`, desk `checkout`/`returnCopy` (only `desk-circulation.validation.test.ts`). `scripts/verify-phase5-circulation.ts` is an opt-in script that creates a schema in the real database; **do not run it** (project rule: no live DB); it can be extended with assertions for Ethan to run later.
- Desk `checkout` is impractical to fake end to end (`validateAttendanceCredential` parses a signed QR payload). For R4 extract the post-insert notice into a one-call exported function (or call `insertUserNotice` with a small local builder) and test the builder plus a captured-`execute` fake; for R1 desk coverage a fake of `returnCopy` is feasible (about 15 SQL branches) and is what proves E3 (one notice, either route).

### 7. Migration
**None needed.** Evidence: all columns exist; no CHECK on `trigger_type`/`priority`/`source_type`; `UNIQUE (user_id, dedupe_key)` exists as `uq_notification_user_dedupe`; `deleted_at` was added later by `005_main_product_gapfill.sql:33`; latest migration is `043_reservation_settings.sql` (tracker `.cursor/agent-protocol.md`) [VERIFIED: 001_from_baseline.sql:661-683; `ls database/supabase` ends at 043]. No existing migration constrains these values (grep of `database/supabase/0*.sql` for notifications CHECK/priority found only the index on `trigger_type`). If the planner finds one is needed, it must be additive with the next number per the tracker; nothing here requires it.

### 8. See Validation Architecture below.

## Common Pitfalls

### Pitfall 1: wrong condition text on the PUT return route
**What goes wrong:** A Worn copy returned via `PUT /borrowing/:id/return` says "Condition recorded: Worn".
**Why:** `returnBook` only sees `pc.condition_status` (prior state), not an assessment.
**How to avoid:** `returnBook(..., { condition })`, desk passes `assessment.condition`, PUT passes nothing.
**Warning signs:** test with a Worn fixture on the non-desk path producing condition text.

### Pitfall 2: notice written for a fine that was never saved
**What goes wrong:** "Late fine" appears for a zero-grace return or for a non-overdue return.
**How to avoid:** read `fine_amount` from `fines` only inside the overdue branch; require `> 0` (P3, E1).

### Pitfall 3: printing key collides across cycles
**What goes wrong:** pause, resume, pause: third event silently dropped by `ON CONFLICT`.
**How to avoid:** per-change `randomUUID()` in the key (not a timestamp, not just `paused`).

### Pitfall 4: `compute` on a connection with `Promise.all`
**What goes wrong:** pg deprecation warning today, breakage on pg 9; also interleaved result ordering in fakes.
**How to avoid:** sequential awaits when the executor is a connection.

### Pitfall 5: dense one-line code
`circulation.service.ts:648`, `desk-circulation.service.ts:119,122-127` are single huge lines. Edit with exact-substring `Edit` replacements; split the line only where you insert code. Do not reformat the rest (keeps the diff reviewable).

### Pitfall 6: the same-state save reaching the notice loop
`paused -> paused` must still upsert (new reason saved) but skip notices. Test both the reason update and the zero-notice outcome.

### Pitfall 7: leaking the override reason
Tests must scan every `execute` argument of the grant/revoke transaction **except** the `clearance_overrides` INSERT/UPDATE itself, and the notice row, for the typed reason string (P1). Use a distinctive reason like `ZZ-secret-reason-ZZ`.

## Code Examples

### returnBook notice block (shape only)
```typescript
// inside the existing overdue branch, after the fines upsert (circulation.service.ts:641-646)
const [fineRows] = await connection.execute<RowDataPacket[]>('SELECT fine_amount FROM fines WHERE transaction_id=? LIMIT 1', [transactionId])
fineAmount = Number(fineRows[0]?.fine_amount ?? 0)
// ...later, before commit:
const parts = [`${loan.title} was returned on ${manilaTime(returnedAt)}.`]
if (fineAmount > 0) parts.push(`Late fine: ₱${fineAmount.toFixed(2)}.`)
if (options.condition && options.condition !== 'Good') parts.push(`Condition recorded: ${options.condition}.`)
await insertUserNotice(connection, { userId: Number(loan.user_id), title: 'Book returned', body: parts.join(' '),
  triggerType: 'Return', sourceType: 'Borrow Transaction', sourceId: transactionId,
  actionPath: rolePath(loan.user_role, 'borrowing'), priority: 'Normal', dedupeKey: `loan:${transactionId}:returned` })
```

### setServiceStatus transaction (shape only)
```typescript
const connection = await pool.getConnection()
try {
  await connection.beginTransaction()
  const [before] = await connection.execute<RowDataPacket[]>('SELECT accepting_requests FROM printing_service_settings WHERE settings_id=1 FOR UPDATE')
  const previous = before[0] ? Number(before[0].accepting_requests) : 1
  await connection.execute(/* existing upsert */, [...])
  if (previous !== (input.acceptingRequests ? 1 : 0)) {
    const [users] = await connection.execute<RowDataPacket[]>(`SELECT DISTINCT pr.user_id,u.user_role FROM print_requests pr JOIN users u ON u.user_id=pr.user_id WHERE pr.job_status NOT IN ('Completed','Cancelled')`)
    const event = randomUUID()
    for (const u of users) await insertUserNotice(connection, { /* paused|resumed notice */ })
  }
  await connection.commit()
} catch (e) { await connection.rollback(); throw e } finally { connection.release() }
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Ad-hoc inline INSERT per module | Same, but helper recommended now | 8 new call sites justify it |
| Client rewrites `/student/` to `/faculty/` | API stores the role-correct path (SPEC E10) | Client rewrite remains a no-op for already-correct paths [VERIFIED: notification-display.ts:19-27] |

**Deprecated/outdated:** the Faculty print links at `printing.service.ts:100` point at a missing `/faculty/printing` route; deferred (CONTEXT), do not touch.

## Runtime State Inventory

Not a rename/refactor/migration phase. Omitted. (No stored data, service config, OS state or secrets change; no existing notice rows are backfilled.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `trigger_type` values `Return`, `Clearance`, `In-Library Use` and `source_type` values `Clearance Override`, `In-Library Use`, `Printing Service` are fine (discretion; nothing in web/API filters on them) | Notice catalogue | Cosmetic only (bell icon); confirm at plan review |
| A2 | Staff/Librarian recipients of R4/R5 (and take-home R1/R8) open `/staff/notifications` or `/librarian/notifications` instead of a `my-books` page | Findings 3, 5 | Wrong landing page for those roles; CONTEXT already allows the fallback for Staff, Librarian is an extension |
| A3 | A previously `Waived`/`Voided`/`Paid` fine that the return upsert re-writes still gets "Late fine" text (SPEC says "a fine row above ₱0 was saved for that return") | Finding 1 | Rare wording oddity; the upsert keeps the old payment status but overwrites the amount |
| A4 | PGlite behaves like Supabase for `FOR UPDATE`, `ON CONFLICT` and the notice INSERT | Validation | Row-lock concurrency is not actually exercised by single-connection PGlite; rely on the SQL assertion plus reasoning, and Ethan-run check on a safe database later |
| A5 | `users.user_role` and `roles.role_name` agree for Student/Faculty | Finding 5 | Fallback path is safe, so impact is only a wrong-but-valid link |

## Open Questions

1. **R4 end-to-end coverage**
   - Known: desk `checkout` needs a signed attendance QR, so a unit fake is large.
   - Unclear: whether to accept helper-level coverage for R4 plus the opt-in `verify-phase5-circulation.ts` assertion.
   - Recommendation: extract a small `notifyInLibraryUseStarted(q, ...)` and test it with a captured-`execute` fake; add one assertion to the opt-in script for Ethan to run later.
2. **Should an expired-but-unrevoked override notify on revoke?** The UPDATE matches it (`revoked_at IS NULL`), the user's status then does not actually change. Recommend: still notify (current status text is true), do not add logic.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | tests | yes | v24.22.0 | - |
| `@electric-sql/pglite`, `pg`, `supertest` | tests | yes | in `node_modules` | - |
| Live Supabase | nothing in this phase | not used | - | Project rule: never touch it; all verification is fake or PGlite |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict`, PGlite 0.3.x for real SQL, supertest 7.x (not needed) |
| Config file | none; `apps/api/package.json` `"test": "node --test \"src/**/*.test.ts\" \"src/**/*.test.js\""` |
| Quick run command | `node --test apps/api/src/modules/<module>/<file>.test.ts` (from repo root) |
| Full suite command | `npm test -w @sti-library/api` and `npm run typecheck -w @sti-library/api` |

### Phase Requirements -> Test Map
Suggested new files (keep existing large test files untouched except fixtures that must learn a new SQL branch):

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTIF-09 | helper inserts with `ON CONFLICT`, second identical key adds no row; `rolePath` matrix; `manilaTime`; failing insert propagates | unit + PGlite | `node --test apps/api/src/modules/notifications/user-notices.test.ts` | Wave 0 |
| NOTIF-01 | return via `returnBook`: on-time (no fine text), late (stored `₱20.00`), ₱0 fine row (none), Damaged ("Condition recorded: Damaged"), Worn via PUT path (no condition text), Good (none); one notice; key `loan:<tx>:returned`; failing notice insert -> rollback, no commit | fake connection | `node --test apps/api/src/modules/circulation/return-notice.test.ts` | Wave 0 |
| NOTIF-01 (E3) | desk `returnCopy` take-home produces exactly one `loan:<tx>:returned` insert, replayed `requestId` adds none | fake connection | `node --test apps/api/src/modules/circulation/desk-return-notice.test.ts` | Wave 0 |
| NOTIF-08 | checkout writes source_type/source_id/action_path/dedupe_key; Faculty `/faculty/my-books`, Student `/student/my-books` | fake connection (extend `checkoutPool`) | `node --test apps/api/src/modules/circulation/circulation.service.test.ts` | exists, extend |
| NOTIF-04 | start notice: book and research item, title + Manila hand-back text, role path, key `in-library-use:<use>:started` | fake `execute` capture | `node --test apps/api/src/modules/circulation/in-library-notices.test.ts` | Wave 0 |
| NOTIF-05 | sweep: one notice per moved row; second sweep none; handed-back use none; body has no fine/penalty words (P4 regex) | fake `execute` (rows) or PGlite | `node --test apps/api/src/modules/circulation/in-library-notices.test.ts` | Wave 0 |
| NOTIF-02/03 | grant/revoke: one notice with new status; revoke text has "Contact the library for details"; typed reason in no notice param (P1); revoking twice -> 404 and zero notices; failing notice insert -> rollback; non-Student/Faculty user -> 404 and rollback | fake connection | `node --test apps/api/src/modules/clearance/clearance-override-notices.test.ts` | Wave 0 |
| NOTIF-06/07 | PGlite: two users with open requests plus one with only Completed -> pause makes exactly 2; reason text included/absent; resume notifies same set; paused->paused makes none but saves the new reason; no open requests -> saved, zero notices; pause/resume/pause -> distinct rows; SQL contains `FOR UPDATE` | PGlite | `node --test apps/api/src/modules/printing/printing-service-notices.test.ts` | Wave 0 |
| NOTIF-09 (E11) | forced notice failure leaves action unsaved in each of the 4 transactional sites | fake / PGlite (covered per site above) | same files | Wave 0 |
| P2 | no notice body contains another user's name or the actor's name (use distinctive names in fixtures) | assertion in every file above | same | Wave 0 |

### Sampling Rate
- **Per task commit:** the one new/changed test file for that task (`node --test <file>`), plus `node --test apps/api/src/modules/circulation/circulation.service.test.ts` whenever `returnBook`/`confirmCheckout` change.
- **Per wave merge:** `npm test -w @sti-library/api` and `npm run typecheck -w @sti-library/api`.
- **Phase gate:** full `npm test` + `npm run typecheck` green before `/gsd-verify-work`; then `security-reviewer` (and no `database-reviewer`, since there is no migration; concurrent SQL is the `FOR UPDATE` in printing, so add it if the planner wants a second opinion on that lock).

### Wave 0 Gaps
- [ ] `apps/api/src/modules/notifications/user-notices.ts` and `.test.ts`
- [ ] `circulation/return-notice.test.ts`, `desk-return-notice.test.ts`, `in-library-notices.test.ts`
- [ ] `clearance/clearance-override-notices.test.ts`
- [ ] `printing/printing-service-notices.test.ts` (PGlite schema: `users`, `print_requests(user_id, job_status)`, `printing_service_settings`, `notifications` with `UNIQUE (user_id, dedupe_key)`)
- [ ] Extend `checkoutPool` in `circulation.service.test.ts` for R8 assertions

Limitation to state in the plan: PGlite and fakes run a single connection, so the row-lock behavior under two truly concurrent saves is verified by the SQL text assertion and reasoning, not by a race test.

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json` (only `workflow.use_worktrees` is set), so it applies.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | existing JWT middleware |
| V3 Session Management | no | - |
| V4 Access Control | yes (unchanged, must not weaken) | existing `requireStaff` (clearance), admin printing router, desk `Librarian`/`Staff` guard; new notices go only to the affected `user_id` |
| V5 Input Validation | yes | Existing `validateOverride`/`validateRevocation`/`parseServiceStatus`; all new SQL parameterized with `?`; reason text only into a TEXT body via parameter |
| V6 Cryptography | no | `randomUUID` for an event id is not a security token |
| V8 Data Protection | yes | P1/P2: never put the override reason, other users' names or the acting librarian in a notice; print reason is already public (D-04) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via the printing reason or override reason | Tampering | parameterized `?` values only; never string-concatenate into SQL |
| Information disclosure through notice text (revocation reason, fine for another user) | Information disclosure | build bodies only from the row's own `user_id` data; tests assert P1/P2 |
| Stored markup in the reason shown in the web notice | Tampering | existing web renders notice text as React text; do not add `dangerouslySetInnerHTML` (not changed here) |
| Notice spam via repeated saves | Denial of service | transition check (same-state save sends nothing) + dedupe keys |
| Cross-user notice (wrong `user_id`) | Information disclosure | take `user_id` from the locked loan/override/print-request row, never from request input |

## Project Constraints (from CLAUDE.md / AGENTS.md)
- Branch: one per change from `main`; never commit to `main`; never push, merge, deploy or run a migration/live DB command without Ethan's go-ahead. (This run does not commit.)
- No destructive file commands (no `git worktree`, `git clean`, `git stash -u`, `git reset --hard`, `git checkout -- .`, `rm -r`, junctions/symlinks); pass long commit messages with `git commit -F`.
- Tests first: failing test, see it fail, smallest code that passes. API tests `node --test` next to the code; supertest for routes.
- Postgres only; parameterized `pg`; multi-record changes in a transaction; one migration per schema change (none here).
- This repo owns schema `public`; never touch `sti_ilms_rea` or role `sti_ilms_rea_app`.
- Reviews before PR: one combined `security-reviewer`; `database-reviewer` only for migrations/concurrent SQL.
- Lean sessions: one feature per session, at most 3 review agents.
- Hook asks before `db:supabase`, `db:backfill:*`, `auth:create-user`, `tools/ai/smoke-*`, `migrate-*`, `audit-*`, `vercel`. Do not run `scripts/verify-phase5-circulation.ts` (it creates a schema in the real DB).
- Global style: immutable updates, functions under 50 lines where practical (the new helper and notice blocks are small; do not enlarge the existing one-liners), no `console.log`, no hardcoded secrets, 80% coverage target on new code.

## Sources

### Primary (HIGH confidence, read this session)
- `apps/api/src/modules/circulation/circulation.service.ts` (480-650: checkout, `returnBook`)
- `apps/api/src/modules/circulation/desk-circulation.service.ts` (full file)
- `apps/api/src/modules/clearance/clearance.service.ts` (full), `clearance.validation.ts:10-20`
- `apps/api/src/modules/printing/printing.service.ts` (60-145), `printing.validation.ts:48-58`, `printing.routes.ts`, `printing.repository.ts:26-28`
- `apps/api/src/config/pg-pool.js`, `db.d.ts`; `node_modules/pg/lib/client.js:36`
- `database/supabase/001_from_baseline.sql:511-524, 661-683`, `023_*.sql` (`in_library_uses`), `024_*.sql`
- `apps/api/src/modules/notifications/notification.worker.ts`, `notification.repository.ts`; `apps/web/src/App.tsx` routes; `notification-display.ts`
- Tests: `circulation.service.test.ts`, `printing.service.test.ts`, `clearance.service.test.ts`, `reservation-settings.test.ts`, `job-runner/pglite-pool.test.helper.ts`
- Ran: Node `toLocaleString('en-PH', ...)` output; PGlite `FOR UPDATE` + upsert; `node --test` single-file command

### Secondary / Tertiary
- None. No web research was needed; this phase is entirely internal code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new packages, all verified in the repo
- Architecture: HIGH, every call site read
- Pitfalls: HIGH for code-derived ones; MEDIUM for concurrency behavior (single-connection test limitation, A4)

**Research date:** 2026-11-19
**Valid until:** 2026-12-19 (internal code; re-check if `desk-circulation.service.ts`, `clearance.service.ts` or `printing.service.ts` change before planning)
