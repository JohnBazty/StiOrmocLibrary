# Renewal Management - Technical Implementation Plan

## Why

Borrowers need one controlled operating-day extension on an active loan. Checkout already has due-date and fine machinery, but there is no renewal path that reuses policy, records decisions, or keeps due reminders correct after a due-date change.

## Plan metadata

- **Date created:** 2026-10-10
- **Date last updated:** 2026-10-10
- **Status:** `planned` (approved; wait for explicit build command)
- **Branch:** `feat/renewal-management`
- **Active database:** Supabase PostgreSQL
- **Migrations after dependency merge:** Supabase `017_loan_renewals.sql`; MySQL `YYYYMMDD_047_loan_renewals.sql`
- **Behavioral source:** [Complete Renewal Management Implementation Plan](complete-renewal-management-plan.md)
- **Roadmap release:** Release 2 in [Next Implementation Roadmap](next-implementation-roadmap.md)

## Dependency gate (do not skip)

Merge or rebase these onto `main` before coding renewal on this branch:

| Dependency | Branch | Why renewal needs it |
| --- | --- | --- |
| Versioned borrowing policies | `codex/configurable-borrowing-policies` | `max_renewals`, `renewal_extension_days`, material renewability, `borrowing_policy_version_id`, generalized operating due-date helper |
| Circulation preflight / override audit | `feat/circulation-preflight` (also folded into policies branch) | Shared blocker codes and override ledger patterns |
| Durable background jobs | Roadmap Release 0 | Reliable due-reminder and overdue processing against renewed deadlines |

**Baseline on current `main` / this branch tip:** no renewal columns, no renewal routes, due helpers are hard-coded one-day checkout only, reminder keys are `loan:<id>:due-12h` without renewal sequence, and `circulation_decision_events` does not exist anywhere yet.

If policies merge first and claim MySQL `046` / Supabase `016`, renewal uses **`047` / `017`**. Confirm numbers at build start.

## Locked product rules (do not reopen in code review)

- One approved renewal per loan (policy-seeded; not a hard-coded service constant).
- Request before `due_at`; extend from current due date by policy operating days; keep cutoff (currently 8:59 AM).
- Immediate API decision for borrower and staff-on-behalf; no approval queue; hard blockers not bypassable.
- Research/thesis view-only; waiting reservation and monetary/lost blockers apply.
- Fine check queries obligation rows directly — never `clearance_statuses.standing_status` alone.

## Current code map

| Area | Path | Change |
| --- | --- | --- |
| Due helper | `apps/api/src/modules/circulation/due-date.ts` | Extend (or adopt policies-branch `calculateOperatingDueDate`) to add N operating days from a start instant |
| Circulation service | `apps/api/src/modules/circulation/circulation.service.ts` | History/monitor payload fields; keep checkout/return ownership |
| Routes / controller | `circulation.routes.ts`, `circulation.controller.ts` | New renewal endpoints |
| Overdue worker | `circulation-overdue.service.ts` | Share loan-row lock semantics with renewal |
| Notifications | `apps/api/src/modules/notifications/notification.worker.ts` | Dedupe keys include `renewal_count` |
| Schema readiness | `apps/api/src/core/schema-readiness.ts` | New columns/tables |
| Borrower UI | `apps/web/src/features/circulation/BorrowingHistory.tsx` | Request renewal dialog |
| Staff UI | `AdminCirculationMonitor.tsx` | Renew on behalf + note |
| API client / types | `circulation-api.ts`, `types.ts` | Preflight + submit + history fields |

## How

### Schema (additive)

**Extend `borrow_transactions`**

- `initial_due_at` — backfill from current `due_at`
- `renewal_count` — default `0`
- Reuse `borrowing_policy_version_id` from policies migration when present (do not invent a second policy FK name)

**Add `loan_renewal_requests`**

Immutable row per Approved/Rejected attempt: request key, transaction id, renewal number, requester, decision source (`System` \| `Staff`), deciding staff, status, decision code/summary, previous/new due dates, policy version, timestamps. Unique on request key. Indexes: transaction/date, requester/date, status/date.

**Decision audit**

- Prefer linking to `circulation_decision_events` if Release 1 adds it before renewal build.
- If that ledger is still absent at build time, persist blocker codes on the renewal request row and reuse `circulation_override_events` patterns only where staff notes apply — do not invent a second generic audit table named `loan_renewal_events`.

**Reminder keys**

Change due 12h/1h (and keep overdue distinct) to include renewal sequence, for example:

`loan:<transactionId>:renewal:<renewalCount>:due-12h`

### API

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/api/v1/borrowing/:transactionId/renewals/preflight` | Loan owner |
| `POST` | `/api/v1/borrowing/:transactionId/renewals` | Loan owner; body `requestKey` |
| `POST` | `/api/v1/admin/borrowing/:transactionId/renewals` | Admin/Librarian; body `requestKey` + staff note |

Extend history and admin monitor responses with: `initialDueAt`, `dueAt`, `renewalCount`, `maxRenewals`, `remainingRenewals`, last decision summary, `canRequestRenewal`.

Rejection messages must not reveal waiting borrowers’ identity.

### Service layout

Under `apps/api/src/modules/circulation/`:

```text
renewal.validation.ts
renewal.repository.ts
renewal.service.ts
renewal.service.test.ts
renewal.integration.test.ts   # when DB tests are available
```

Responsibilities:

1. Validate ids, request key, staff note.
2. Begin transaction; `FOR UPDATE` loan row; lock title reservation candidates; resolve effective policy.
3. Re-run all eligibility checks (stale preflight ignored).
4. Reject path: insert rejected renewal row (+ decision events); commit; return blockers.
5. Approve path: compute next operating due from locked `due_at`; insert approved row; update `due_at` and `renewal_count`; create approval notification; commit.
6. Idempotent retry on same `requestKey` returns original decision without mutating twice.
7. Compare approved renewal row count to `renewal_count`; fail safely on legacy mismatch.

### Web

- Show **Request renewal** only for Borrowed loans with remaining allowance.
- Confirmation dialog: current due, proposed due, usage, blockers from preflight.
- On submit, send stable client `requestKey`; refresh row in place.
- Staff: **Renew on behalf** with required note; same blockers; show System vs Staff last decision.

### Delivery slices

1. **Contract and migration** — blocker codes/messages; Supabase `017` + MySQL `047`; backfill; schema-readiness.
2. **Decision service** — operating-day extension; eligibility; idempotent approve/reject; reminder dedupe keys.
3. **API and auth** — borrower preflight/submit; staff route; history/monitor fields.
4. **Web** — borrower dialog; staff action; renewal display fields.
5. **Verification** — unit/integration/typecheck/build; hosted disposable acceptance; docs (`schema-context`, API reference, agent-protocol tracker, plan status → `built`).

## Test matrix (minimum)

- Eligible Student/Faculty approve for policy extension days; due-time boundary rejects.
- Overdue, returned, cancelled, pending, lost, archived, reservation, fine, lost-charge, max renewals, non-renewable material reject.
- Active loan alone does not block via clearance standing status.
- Calendar: Sunday, closed weekday, holiday, multi-day closure.
- Same `requestKey` idempotent; two keys race → at most one approval.
- Reservation race and overdue race respect loan lock.
- Owner-only borrower route; Student/Faculty cannot hit staff route; privacy-safe rejection text.
- UI: action visibility, dialog a11y, no double renew after retry.

## Completion criteria

Same as the behavioral plan: shared decision service, single due-date update on approve, rejected attempts recorded, blockers enforced, policy version + actor stored, renewal-aware reminders, tests/build/migration/hosted acceptance green, docs and trackers current.

## Implementation tracking

- [x] Behavioral plan approved by Ethan.
- [x] Dependency and file map assessed against `main` and policy/preflight branches.
- [x] Build-ready implementation plan drafted on `feat/renewal-management`.
- [ ] Dependencies merged (or this branch rebased onto them).
- [ ] Migration numbers confirmed (`017` / `047` expected).
- [ ] Status set to `inprogress` on explicit build command.
- [ ] Slices 1–5 completed.
- [ ] Status set to `built`.

## Change log

- **2026-10-10:** Implementation plan created from the approved Complete Renewal Management plan. Locked migrations to post-policy `017`/`047`, removed staff queue / `loan_renewal_events`, and mapped concrete files under the circulation module.
