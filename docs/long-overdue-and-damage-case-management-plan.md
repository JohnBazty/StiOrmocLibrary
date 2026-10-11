# Long-overdue and damage case management plan

## Why

Staff can see overdue loans and damaged inventory, but cannot assign, investigate, and resolve either as a tracked case. The borrowing policy already stores a long-overdue threshold, yet no service uses it. Damage discovered at return has no case record tying the inspection, borrower, copy, and decision together. This plan adds that operational trail while preserving the existing loan, fine, loss, inventory, and clearance ledgers.

- **Date created:** 2026-10-10
- **Date last updated:** 2026-10-10
- **Status:** `inprogress`
- **Decisions:** D1–D3 approved by Ethan on 2026-10-10

## Objective and boundaries

- Give Admin staff a worklist and detail view for long-overdue loans and damage reported against a borrowed book copy.
- Keep `borrow_transactions` authoritative for loan state, `physical_copies` and `inventory_audit_events` for condition/availability, `fines` for overdue money, and `lost_book_reports` for confirmed loss. A case coordinates these records; it does not replace them.
- Preserve current Student/Faculty borrowing and return behavior until the new workflow is explicitly enabled. Research/thesis is view-only and outside this circulation feature.
- Do not create an automatic damage charge, call damage “lost,” or waive an overdue fine as a side effect of a case decision. The source documents specify overdue penalties and damaged inventory tracking, but no damage-price or borrower-liability rule.

## Recommended decisions (approve to unlock build)

These replace the open questions from the first draft. Approve as written, or edit one line before implementation starts.

| # | Topic | Recommended default for this release |
| --- | --- | --- |
| D1 | **Long-overdue clock** | Count completed campus **operating days** after the loan’s `due_at` in Asia/Manila, excluding configured closures, using the fine calendar (`loadFineContext` / `operatingDay`). Threshold comes only from the loan’s attached `borrowing_policy_version_id`. A newly published threshold does **not** apply retroactively. `NULL` threshold (including Legacy) means no long-overdue case. |
| D2 | **Case authority** | **Admin only** for create, assign, contact, inspect, resolve, and reopen. Matches current API roles (`STAFF_ROLES = ['Admin']`; no Library Staff role in code). Future restricted staff actions require an explicit later plan. |
| D3 | **Damage liability** | **Out of scope.** Manage condition, investigation, and disposition only. No damage fine, balance, or clearance block from an open damage case. Confirmed loss continues to use `lost_book_reports` only. |

**T1 dependency (not a blocker for code):** Durable job-runner (T1 in `docs/system-fixes-and-features-plan.md`) is still `planned`. Implement the long-overdue scan inside `escalateOverdueTransactions` so the same entry point works for the existing in-process worker **and** T1 later. Production schedule reliability waits on T1; local/dev and any manual/admin trigger of the scan remain usable now.

## Current implementation and assumptions

Verified 2026-10-10 against the tree:

- Migrations: MySQL latest `046` → next **`047`**; Supabase latest `016` → next **`017`**. Re-check folders at build time.
- No `circulation_cases` / `circulation_case_events` tables.
- `borrowing_policy_versions.long_overdue_after_days` is nullable; Legacy seed is `NULL`. Policy UI draft default 14 is not a published rule.
- Overdue path: `escalateOverdueTransactions` in `apps/api/src/modules/circulation/circulation-overdue.service.ts`, driven by `startCirculationOverdueWorker` (`setInterval` 60s from `apps/api/src/server.ts`). Not durable on Vercel.
- Return path: `circulationService.returnBook` finalizes overdue fines and advances reservations; it does **not** change `condition_status` or write `inventory_audit_events`.
- Damaged condition currently preserves availability; checkout of Available damaged copies needs Admin override (`COPY_DAMAGED` / `circulation_override_events`).
- Admin worklist: `AdminCirculationMonitor` at `/admin/circulation` — client-side Pending/Active/Overdue lanes only; no case filters or detail page.
- Borrower history: `BorrowingHistory` shows lost-report status; no case fields.
- Closest UI detail pattern: `AdminClearancePage` master list + overlay.

## How — ready-to-build specification

### Phase 0 — Docs and gates (before code)

1. Ethan approves D1–D3 (or records substitutions in the change log).
2. Set this plan status to `inprogress` when the first migration lands.
3. Do not start T1 in this plan; only keep the overdue/case scan on the shared entry point.

### Phase 1 — Schema (MySQL `047` / Supabase `017`)

**Files to add**

- `database/migrations/20261010_047_circulation_cases.sql` (date prefix = authoring day)
- `database/supabase/017_circulation_cases.sql`

**Tables**

`circulation_cases`

| Column | Type / notes |
| --- | --- |
| `case_id` | PK, auto-increment / identity |
| `case_type` | `Long Overdue` \| `Damage` |
| `transaction_id` | FK → `borrow_transactions` **RESTRICT** |
| `physical_copy_id` | FK → `physical_copies` **RESTRICT** |
| `borrower_user_id` | FK → users/accounts as used elsewhere **RESTRICT** |
| `status` | `Open` \| `Assigned` \| `Under Investigation` \| `Resolved` \| `Dismissed` \| `Reopened` |
| `assigned_to_user_id` | nullable FK Admin account |
| `summary` | short text |
| `opened_at` / `updated_at` / `resolved_at` | timestamps; `resolved_at` null until terminal |
| `opened_by_user_id` / `resolved_by_user_id` | nullable FKs |
| `policy_version_id` | nullable; snapshot for Long Overdue |
| `threshold_days_snapshot` | nullable INT; value used when opened |
| `threshold_reached_at` | nullable; when scan decided threshold met |
| `baseline_condition_status` | nullable; copy condition at case open (damage context) |
| `observed_condition_status` | nullable; staff-reported condition at intake |
| `lost_book_report_id` | nullable FK → `lost_book_reports` **RESTRICT** |
| Unique | `(transaction_id, case_type)` — idempotent open |

`circulation_case_events`

| Column | Type / notes |
| --- | --- |
| `event_id` | PK |
| `case_id` | FK → `circulation_cases` **RESTRICT** |
| `event_type` | `Opened` \| `Assigned` \| `Contact Attempted` \| `Note Added` \| `Inspection Recorded` \| `Disposition Recorded` \| `Linked Lost Report` \| `Resolved` \| `Dismissed` \| `Reopened` |
| `actor_user_id` | nullable (system open may be null or system actor) |
| `from_status` / `to_status` | nullable status strings |
| `reason` / `notes` | reason required for resolve/dismiss/reopen/disposition |
| `created_at` | append-only; no updates |

**Indexes:** `(case_type, status, opened_at)`, `(borrower_user_id)`, `(physical_copy_id)`, `(assigned_to_user_id)`, `(case_id, created_at)` on events.

**Enum extensions**

- `admin_notifications.event_type`: add `long_overdue_case_opened`, `damage_case_opened` (and optionally `circulation_case_resolved` if needed for staff inbox).
- User `notifications.trigger_type`: add a case-safe value only if borrower milestones need a distinct type; otherwise reuse an existing type with a distinct `dedupe_key` (`case:{case_id}:opened`, `case:{case_id}:resolved`). Prefer extending the enum only when the UI filter requires it — decide at implementation by matching lost-book pattern.

**Docs/tracker after migration**

- Update `.cursor/agent-protocol.md` migration table → MySQL next `048`, Supabase next `018`.
- Update `docs/schema-context.md` with both tables and rules.
- Extend `apps/api/src/core/schema-readiness.ts` for new tables/columns and notification enum values.

### Phase 2 — Case domain service

**New files (circulation module)**

- `apps/api/src/modules/circulation/circulation-case.types.ts`
- `apps/api/src/modules/circulation/circulation-case.validation.ts`
- `apps/api/src/modules/circulation/circulation-case.repository.ts`
- `apps/api/src/modules/circulation/circulation-case.service.ts`
- `apps/api/src/modules/circulation/circulation-case.service.test.ts`

**Service responsibilities**

1. `openLongOverdueCase` / `openDamageCase` — lock loan (+ copy for damage), insert-or-select by unique key, append `Opened` event, return existing case on retry.
2. `listCases` / `getCaseDetail` — worklist filters: type, status, age, borrower, title/barcode, assignee; detail joins loan, fine, copy, recent events, optional lost report, checkout override events.
3. `assignCase`, `addContactAttempt`, `addNote`, `recordInspection`, `recordDisposition`, `resolveCase`, `dismissCase`, `reopenCase` — validate transitions server-side; require reason for resolve/dismiss/reopen/disposition; append events; never mutate fine amounts.
4. Disposition rules for Damage (after return completed in same or prior flow):
   - `repaired_available` → condition/availability restored via inventory helpers + audit; must pass existing conflict checks.
   - `damaged_held` → remain `Damaged` / `Unavailable`.
   - `missing_lost` → if loan still active, call/link existing lost-book confirm path; if already returned, inventory Lost/Unavailable + audit, **no** replacement charge.
5. Linking lost report sets `lost_book_report_id` and appends `Linked Lost Report`; resolve as handed to loss workflow without inventing a second charge.

**Operating-day helper**

- Add `countOperatingDaysAfter(dueAt, now, calendar)` next to fine calendar usage (prefer extracting from `fine-calculator.ts` or a small shared helper under `circulation/` or `fines/`).
- Case opens when completed operating days ≥ `threshold_days_snapshot` from the loan’s policy version.

### Phase 3 — Long-overdue scan

**Change:** `apps/api/src/modules/circulation/circulation-overdue.service.ts`

1. Keep existing Borrowed→Overdue + fine + clearance + `overdue_detected` alert.
2. After (or within the same transaction batch strategy that stays correct under retries), select active loans whose policy has non-null `long_overdue_after_days`, no existing Long Overdue case, not returned, `lost_confirmed_at IS NULL`.
3. **Batch hygiene:** exclude loans that already have a Long Overdue case from the candidate set so old cased loans do not consume the LIMIT batch.
4. For each qualifier: compute operating days; if met, `openLongOverdueCase` with snapshots; insert Admin alert `long_overdue_case_opened` (dedupe strategy: unique on `(event_type, borrow_transaction_id)` if adding a unique index is acceptable, else “insert only when case insert is new”).
5. Borrower notification with `dedupe_key = case:{case_id}:opened` only after case commit.
6. Extend `circulation-overdue.service.test.ts` for null threshold, calendar boundary, idempotent retries, returned/lost skip, batch exclusion.

Worker file stays the thin timer; T1 will call the same `escalateOverdueTransactions` later.

### Phase 4 — Damage intake on return

**API change to return path**

- Prefer a dedicated endpoint rather than overloading plain return:
  - `POST /api/v1/admin/borrowing/:transactionId/report-damage`
  - Body: `observedCondition`, `description`, optional notes.
- Flow in **one DB transaction**:
  1. Lock loan (`Borrowed`/`Overdue`) and copy `FOR UPDATE`.
  2. Snapshot baseline condition; capture any `circulation_override_events` for context (read).
  3. Open/reuse `Damage` case + `Opened` / inspection event.
  4. Complete return via shared internal return helper extracted from `returnBook` with flag `holdCopyForDamageCase: true`:
     - finalize fine as today when status is Overdue;
     - **do not** assign this copy to the waiting reservation; advance queue only if another eligible Available copy exists (otherwise leave waiter Waiting / do not mark Ready on this damaged copy);
     - set copy `Damaged` + `Unavailable` (and material availability consistent with inventory rules);
     - `recordInventoryAudit` for condition and availability changes with `action_reason`.
  5. Commit. On any failure, rollback case + return + inventory.

Also allow `POST /api/v1/admin/circulation/cases` with type Damage against an **active** loan (borrower/staff report) — opens case only; does **not** mark returned or change availability.

**Refactor note:** extract shared return core from `circulation.service.ts` `returnBook` so normal return and damage-return share fine/reservation logic without duplicating SQL.

### Phase 5 — HTTP API

**Mount under Admin circulation** (`circulation.routes.ts` / `createAdminCirculationRouter`), JWT + `requireJwtRoles('Admin')`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/admin/circulation/cases` | Filtered worklist |
| `GET` | `/api/v1/admin/circulation/cases/:caseId` | Detail + events + linked records |
| `POST` | `/api/v1/admin/circulation/cases` | Manual open (Damage on active loan; Long Overdue normally job-only — reject manual Long Overdue unless needed for ops override with reason) |
| `POST` | `/api/v1/admin/circulation/cases/:caseId/assign` | Assignment |
| `POST` | `/api/v1/admin/circulation/cases/:caseId/contact-attempts` | Dated contact |
| `POST` | `/api/v1/admin/circulation/cases/:caseId/notes` | Staff notes |
| `POST` | `/api/v1/admin/circulation/cases/:caseId/inspections` | Inspection |
| `POST` | `/api/v1/admin/circulation/cases/:caseId/dispositions` | Damage disposition |
| `POST` | `/api/v1/admin/circulation/cases/:caseId/resolve` | Resolve + reason |
| `POST` | `/api/v1/admin/circulation/cases/:caseId/dismiss` | Dismiss + reason (e.g. no new damage) |
| `POST` | `/api/v1/admin/circulation/cases/:caseId/reopen` | Reopen + reason |
| `POST` | `/api/v1/admin/borrowing/:transactionId/report-damage` | Damage-at-return |

**Borrower-safe read**

- Extend `GET /api/v1/borrowing/history` (or a nested field) with public case summary: `caseId`, `caseType`, `status`, `openedAt`, short instruction — **only** for the authenticated borrower. Never expose staff notes or other users’ cases.

**Validation:** Zod in `circulation-case.validation.ts`; type-specific transition matrix in the service.

### Phase 6 — Admin and borrower UI

**Admin**

- Extend `AdminCirculationMonitor` (or add sibling `AdminCirculationCases` under the same `/admin/circulation` area) with filters: Long overdue / Damage cases, status, assignee, age.
- Case detail overlay/page modeled on `AdminClearancePage`: loan link, fine link, inventory audit, lost report, event timeline, action forms with required reasons.
- On Process return: optional **Report damage** path → confirmation dialog (observed condition + description) → `report-damage` API.
- Wire `apps/web/src/features/circulation/circulation-api.ts` + `types.ts`.
- Tests: `AdminCirculationMonitor.test.tsx` (+ new case component tests if split).

**Borrower**

- `BorrowingHistory.tsx`: show factual case status + return/contact instruction when present.
- Test: `BorrowingHistory.test.tsx`.

**Visual rules:** STI blue / yellow / white only; status via text+icon, not color alone.

### Phase 7 — Authorization, notifications, regression

- All write routes Admin-only; Student/Faculty denied (integration tests).
- Case status must not bypass renewal blocks, capacity, fine accrual, clearance, archived-copy guards.
- Open damage case alone is not a monetary clearance block.
- Checkout/reservation paths must refuse assigning a copy held `Unavailable` for an open damage case.
- Admin alerts after commit; borrower notifications with stable dedupe keys; case usable if notify fails.

### Phase 8 — Verification before `built`

1. Unit/service tests listed under Acceptance / Tests.
2. API integration: permissions, duplicate case prevention, concurrent return/damage.
3. Web tests for worklist filters and Report damage.
4. Hosted Supabase: apply `017`, smoke scan + damage return on test data, rollback-safe where possible.
5. Confirm in-process worker opens cases locally; document that production schedule still waits on T1.
6. Update this plan status to `built`, bump dates, complete tracking checklist.

## Implementation sequence (build order)

| Step | Work | Primary files |
| --- | --- | --- |
| 1 | Approve D1–D3; set `inprogress` | this doc |
| 2 | Migrations 047/017 + schema-context + readiness + protocol tracker | `database/**`, `docs/schema-context.md`, `.cursor/agent-protocol.md`, `schema-readiness.ts` |
| 3 | Case types/validation/repository/service + unit tests | `circulation-case.*` |
| 4 | Operating-day threshold helper + overdue scan extension | `fine-calculator` / helper, `circulation-overdue.service.ts` |
| 5 | Extract return core; damage-at-return + inventory audit | `circulation.service.ts`, inventory repo helpers |
| 6 | Routes/controller/validation wiring | `circulation.routes.ts`, `circulation.controller.ts` |
| 7 | History field for borrower-safe case summary | `circulation.service.ts` history |
| 8 | Admin UI worklist/detail + Report damage | `AdminCirculationMonitor*`, `circulation-api.ts` |
| 9 | Borrower history display | `BorrowingHistory.tsx` |
| 10 | Full test pass + hosted smoke; mark `built` | tests + this doc |

## Acceptance criteria

- A loan reaches the published threshold on the correct operating day and produces exactly one long-overdue case and Admin alert, even after scan retries. Legacy loans with a null threshold produce none.
- Staff can track assignment/contact history and resolve or reopen with an auditable reason. A return or confirmed loss is reflected without erasing the loan, fine, or loss history.
- A damage-at-return report produces one case, a completed return, and an audited Unavailable damaged copy atomically. Failed returns leave all three unchanged. A previously damaged-at-checkout copy remains distinguishable from new damage via baseline + override context.
- An open damage case cannot accidentally republish the copy for checkout or claim; disposition through existing inventory guards can restore it when safe.
- Borrowers see only their own case status; unauthorized writes fail; duplicate actions cannot create duplicate cases, alerts, charges, or inventory events.
- Existing overdue calculation, fine settlement rules, clearance, reservations, lost-book reporting, and normal returns pass regression checks.
- Production durable schedule remains a T1 follow-up; the scan entry point is the same function T1 will call.

## Tests to add or extend

| Area | File |
| --- | --- |
| Scan / threshold / idempotency | `circulation-overdue.service.test.ts` |
| Return + damage atomicity / reservation hold | `circulation.service.test.ts` |
| Case transitions / permissions | `circulation-case.service.test.ts`, `circulation.api.integration.test.ts` |
| Operating days | `fine-calculator.test.ts` and/or new helper test |
| Loss link / no double charge | `clearance.service.test.ts` |
| Inventory hold / restore | `inventory.service.test.ts` |
| Schema readiness | readiness tests + `circulation.migration.test.ts` if pattern fits |
| Admin UI | `AdminCirculationMonitor.test.tsx` |
| Borrower UI | `BorrowingHistory.test.tsx` |
| Preflight baseline context | `circulation-preflight.test.ts` (damaged checkout still distinguishable) |

## Implementation tracking

- [x] Inspect product PDFs, repository rules, current schema, and related circulation/inventory/fines workflows.
- [x] Draft plan with dependencies, acceptance criteria, and unresolved business decisions.
- [x] Expand into ready-to-build phases with files, schema, APIs, and recommended decisions D1–D3.
- [x] Ethan approves D1–D3 (operating-day clock, Admin-only authority, no damage liability this release).
- [x] Implement migrations, service, API, and UI (core path landed on `feat/long-overdue-and-damage-case`).
- [x] API unit suite green (270 tests).
- [x] Applied hosted Supabase `017_circulation_cases.sql`; rollback-safe smoke passed (long-overdue idempotent open, damage case + Unavailable hold, no data leak).
- [x] Confirmed production minute-scan still waits on durable job-runner T1 (in-process worker is not durable on Vercel).
- [ ] Update status to `built` after app release / end-to-end desk UI verification on the deployed environment.

## Change log

| Date | Change |
| --- | --- |
| 2026-10-10 | Created the `planned` draft from the preserved product scope and current implementation; clarified reservation handoff and post-return loss handling. |
| 2026-10-10 | Expanded into a ready-to-build plan: recommended decisions D1–D3, Phases 0–8, concrete schema/API/UI/file map, T1 non-blocking note, and test matrix. Status remains `planned` until Ethan approves decisions. |
| 2026-10-10 | Ethan approved D1–D3; status set to `inprogress`; implementation started. |
| 2026-10-10 | Applied hosted `017_circulation_cases.sql`; rollback-safe smoke passed. Noted T1 still required for durable production scanning. Hosted next Supabase file is `019` (ledger already has renewals `017` and stocktake `018`). |
