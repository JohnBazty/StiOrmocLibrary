---
phase: "2"
slug: "user-notification-gaps"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-19"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` + `node:assert/strict`; PGlite 0.3.x for real SQL |
| **Config file** | none — `apps/api/package.json` `test` script |
| **Quick run command** | `node --test apps/api/src/modules/<module>/<file>.test.ts` (repo root) |
| **Full suite command** | `npm test -w @sti-library/api` and `npm run typecheck -w @sti-library/api` |
| **Estimated runtime** | ~60 seconds (full API suite) |

---

## Sampling Rate

- **After every task commit:** Run the task's test file with `node --test <file>`; also `node --test apps/api/src/modules/circulation/circulation.service.test.ts` when `returnBook` or checkout changes
- **After every plan wave:** Run `npm test -w @sti-library/api` and `npm run typecheck -w @sti-library/api`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Filled by the planner; one row per task. The desk return (E3) cases live in `return-notice.test.ts` with the PUT-route cases so both routes share one fake (no separate `desk-return-notice.test.ts`).

| Task | Wave | Requirement | Edges / Prohibitions | Test file | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|----------------------|-----------|-----------|-------------------|-------------|--------|
| 02-01 T1 (tracer) | 1 | NOTIF-01, NOTIF-09 | dedupe, E10 path rule | `notifications/user-notices.test.ts`, `circulation/return-notice.test.ts` | unit + PGlite + fake connection | `node --test apps/api/src/modules/notifications/user-notices.test.ts apps/api/src/modules/circulation/return-notice.test.ts apps/api/src/modules/circulation/circulation.service.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 02-01 T2 | 1 | NOTIF-01, NOTIF-09 | E1, E2, E3, E11, P2, P3, D-08 | `circulation/return-notice.test.ts` | fake connection | `node --test apps/api/src/modules/circulation/return-notice.test.ts apps/api/src/modules/circulation/circulation.service.test.ts apps/api/src/modules/circulation/desk-circulation.validation.test.ts` | from T1 | ⬜ pending |
| 02-02 T1 | 2 | NOTIF-02, NOTIF-09 | P1, P2 | `clearance/clearance-override-notices.test.ts` | fake connection | `node --test apps/api/src/modules/clearance/clearance-override-notices.test.ts apps/api/src/modules/clearance/clearance.service.test.ts apps/api/src/modules/clearance/clearance.validation.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 02-02 T2 | 2 | NOTIF-03, NOTIF-09 | E4, E11, P1, P2 | `clearance/clearance-override-notices.test.ts` | fake connection | `node --test apps/api/src/modules/clearance/clearance-override-notices.test.ts apps/api/src/modules/clearance/clearance.service.test.ts` | from T1 | ⬜ pending |
| 02-03 T1 | 2 | NOTIF-06, NOTIF-07, NOTIF-09 | P2 | `printing/printing-service-notices.test.ts` | PGlite | `node --test apps/api/src/modules/printing/printing-service-notices.test.ts apps/api/src/modules/printing/printing.service.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 02-03 T2 | 2 | NOTIF-06, NOTIF-07, NOTIF-09 | E7, E8 (+ backstop), E9, E11 | `printing/printing-service-notices.test.ts` | PGlite | `node --test apps/api/src/modules/printing/printing-service-notices.test.ts apps/api/src/modules/printing/printing.service.test.ts apps/api/src/modules/printing/printing.validation.test.ts` | from T1 | ⬜ pending |
| 02-04 T1 | 2 | NOTIF-04, NOTIF-09 | E5, E11 (call site), P2 | `circulation/in-library-notices.test.ts` | unit builder + `startInLibraryUse` call-site fake (book, research item, failing notice, null cutoff) | `node --test apps/api/src/modules/circulation/in-library-notices.test.ts apps/api/src/modules/circulation/desk-circulation.validation.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 02-04 T2 | 2 | NOTIF-05, NOTIF-09 | E6, E11, P2, P4 (regex backstop) | `circulation/in-library-notices.test.ts` | PGlite | `node --test apps/api/src/modules/circulation/in-library-notices.test.ts` | from T1 | ⬜ pending |
| 02-04 T3 | 2 | NOTIF-08, NOTIF-09 | E10, E11, P2 | `circulation/circulation.service.test.ts` | fake connection (extend `checkoutPool`) | `node --test apps/api/src/modules/circulation/circulation.service.test.ts apps/api/src/modules/circulation/return-notice.test.ts apps/api/src/modules/circulation/borrow-cart.service.test.ts` | ✅ extend | ⬜ pending |

The last task of each plan also runs `npm run typecheck -w @sti-library/api`; every wave ends with `npm test -w @sti-library/api`.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/modules/notifications/user-notices.ts`, `user-notices.test.ts` and `user-notices.test.helper.ts` (PGlite notifications table, shared by 02-03 and 02-04)
- [ ] `apps/api/src/modules/circulation/return-notice.test.ts` (both return routes), `in-library-notices.test.ts`
- [ ] `apps/api/src/modules/clearance/clearance-override-notices.test.ts`
- [ ] `apps/api/src/modules/printing/printing-service-notices.test.ts` (PGlite schema: `users`, `print_requests`, `printing_service_settings`, `notifications` with `UNIQUE (user_id, dedupe_key)`)
- [ ] Extend `checkoutPool` fixture in `circulation.service.test.ts` for R8

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two truly concurrent printing saves send one set of notices | NOTIF-06, NOTIF-07 (E8) | PGlite and fakes run one connection; no real race | Covered by asserting `FOR UPDATE` in the SQL and by review; optional manual check on a staging database with Ethan's go-ahead |
| R5 overdue notice wording does not threaten a penalty | NOTIF-05 (P4) | judgment-tier prohibition | Review the body text; regex test covers obvious words |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
