# Fair fine rates and library hours: session record

- **Why:** Ethan approved the fair fine rates plan (`docs/fair-fine-rates.md`, step 1 of the fine enforcement order in `docs/roadmap.md` section 4) and confirmed the library hours.
- **Date created:** 2026-11-18
- **Date last updated:** 2026-11-18
- **Status:** built; committed on `fix/fair-fine-rates`; `040` applied live

## Decisions (Ethan, 2026-11-18)

- Fair fine rates plan approved.
- Library hours: opens 08:00, closes 17:00 on open days. This replaces the 19:00 closing set by migration `022`.

## What changed

| File | Change |
| --- | --- |
| `apps/api/src/modules/fines/fine-calculator.ts` | On the due date, started hours count only until that day's `closes_at` (17:00 if none or malformed) and cost at most one day's rate. After the due date the fine is `max(library days × daily rate, due-date amount)`, so it never drops at midnight or shows PHP 0 on a closed day. A due date that reaches the daily rate is stored as 1 Daily unit, so units × rate = amount. `loadFineContext` now reads `closes_at`. |
| `apps/api/src/modules/fines/fine-calculator.test.ts` | 10 new tests: the plan's worked examples, return at closing, custom and missing closing times, malformed closing time, due after closing, cap last, basis reporting. |
| `apps/web/src/features/fines/AdminFinePoliciesPage.tsx` | One sentence on the Fine rules page explaining the due-date rule. |
| `database/supabase/040_library_hours_8am_5pm.sql` | Sets open days to 08:00–17:00. Applied live 2026-11-18; Monday–Saturday now read 08:00–17:00, Sunday closed. |
| `docs/fair-fine-rates.md`, `docs/roadmap.md`, `.cursor/agent-protocol.md` | Plan marked built; roadmap step 1 built; migration tracker next unused number is `041`. |

## Verification

- `npm run typecheck` and `npm run build` pass.
- API: 488 tests pass. Web: 318 tests passed (run before the last calculator fix, which is API-only).
- `security-reviewer`: no CRITICAL or HIGH. Fixed: units × rate mismatch when the due date reaches the daily rate (MEDIUM); NaN from a malformed `closes_at` (LOW).
- Accepted: a loan due after closing has a PHP 0 fine on the due date. It blocks nothing, since clearance and borrowing filter on `fine_amount > 0`.
- Not checked: the change in the running app.

## Open items

- [x] Committed on `fix/fair-fine-rates` (from `feat/fines-maintenance`), Ethan's choice.
- [x] `040` applied live 2026-11-18 on Ethan's go-ahead and checked with a read-only query.
- [ ] Push or draft PR for John only after Ethan's go-ahead.
- [ ] Possible follow-up: `attendance-operations.service.ts` still falls back to 19:00 when a day has no `closes_at` (unused once `040` is applied).

## Change log

- 2026-11-18: Session record created; `040` applied live.
