# Circulation Preflight Check Plan

## Why

Desk checkout today throws hard errors only after submit. Staff need a preview that classifies blockers, confirmable warnings, and alerts before the loan is saved. Damaged copies require an authorized reason, and final checkout must recheck under locks so a second librarian cannot race the same copy.

- Date created: 2026-10-09
- Date last updated: 2026-10-09
- Status: `built`

Allowed status values: `planned` -> `inprogress` -> `built`.

## Objective

Deliver Admin-only checkout preflight for book checkout and pending-claim fulfillment only, without changing SmartLib’s borrowing tables, reservation lifecycle, due-date rules, fines/overdue checkout policy, or research/thesis handling.

## How

1. Shared evaluator and purpose JWT helpers live in `apps/api/src/modules/circulation/circulation-preflight.ts`.
2. `POST /api/v1/admin/borrowing/preflight` returns `ready`, `confirmation_required`, or `blocked` plus a short-lived token when not blocked.
3. Final `confirm-checkout` / `fulfill-claim` re-evaluate under locks; warnings require token + 10–500 character reason.
4. Confirmed warnings write `circulation_override_events` in the same transaction (MySQL `044`, Supabase `014`).
5. Admin desk runs preflight first, shows blockers, opens `CheckoutPreflightDialog` for Damaged warnings, then completes claim or walk-in checkout.

## Implementation tracking

- [x] Branch `feat/circulation-preflight` (not main)
- [x] Shared evaluator + token helpers
- [x] Admin preflight endpoint
- [x] Final checkout recheck + override audit
- [x] Migrations and schema readiness
- [x] Web desk preflight dialog
- [x] Tests, builds, docs status `built`

## Change log

| Date | Change |
| --- | --- |
| 2026-10-09 | Plan created from approved Circulation Preflight Check specification. Status `planned`. |
| 2026-10-09 | Implementation completed on `feat/circulation-preflight`. Status `built`. |
