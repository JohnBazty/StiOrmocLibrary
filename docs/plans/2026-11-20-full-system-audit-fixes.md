# Full-System Audit Remediation Plan (All Verified Findings)

- **Date created:** 2026-11-20
- **Date last updated:** 2026-11-20
- **Status:** `built`
- **Branch:** `fix/system-audit-remediation` (branched from `feat/violation-categories-maintenance` at `dc773a1`)
- **Migration:** `077_enrollment_roster_source_kind.sql` (written during Phase 5, **not applied** to live Supabase until owner approval; latest applied `076_violation_fine_limit_setting.sql`, next unused `078`)

## Why

A full read-only audit of all 728 source files across `apps/api/src`, `apps/web/src`, `api/index.mjs`, `database/supabase/*.sql`, and `vercel.json` identified 7 Critical, 22 High, and 45+ Medium/Low verified runtime defects that pass `npm run typecheck` cleanly but affect production security, financial accuracy, Manila timezone behavior, Vercel connection-pool stability, and user workflows.

## Preserved Intentional Decisions

- `apps/api/src/modules/catalog/catalog-enhancements.service.ts:224` (`accessions: string[] = []`) stays untouched because commit `6be59da` intentionally moved catalog imports to auto-generated accessions.
- All existing applied Supabase migration files (`001`–`075`) remain byte-identical per `docs/plans/2026-11-20-hosted-system-main-merge.md`. New schema changes land in `076_enrollment_roster_source_kind.sql`.

## How (6 Phases)

1. **Phase 1 — Security, RBAC, Auth, Session & Routing Boundaries**
   - Guard legacy `/api/attendance` (`CRIT-04`) and legacy `POST /api/reservations` (`CRIT-05`).
   - Block Admin-to-Librarian privilege escalation and resurrection of retired/archived Librarian accounts (`CRIT-06`).
   - Fix legacy `/api/circulation` & `/api/users` session actor resolution (`CRIT-07`).
   - Fix `requireLibraryOpenForUserTransactions` to read `response.locals.authenticatedUser?.role` and guard catalog reservations (`HIGH-01`).
   - Permit `Admin` on `GET /api/v1/admin/reports/audit-logs` and show load errors in `AdminAuditLogsPage` (`HIGH-08`).
   - Fix `GET /admin/dashboard` redirect loop/500, sub-router 404 boundaries, shadowed `/api/v1/admin/dashboard`, and `normalizeVercelRequest` (`HIGH-19`, `HIGH-20`, `MED-16`).
   - Harden `login/resend` expiry, `requireLogoutAuth` cookie clearing, `verifyCsrfToken` non-string guard, Microsoft Graph `try/catch`, and `Object.hasOwn` MIME allowlists.
2. **Phase 2 — Lost-Book Clearance, Confirmed-Lost Lifecycle, Fine Ledger & Circulation Core**
   - Fix `clearanceService.decideLost` 5-placeholder / 4-parameter SQL crash (`CRIT-01`).
   - Exclude `lost_confirmed_at IS NOT NULL` across circulation, reservation, catalog, inventory, and stocktake active-loan checks (`CRIT-02`).
   - Protect fine upserts against null `due_at`, `charge.amount <= 0`, and overwriting `Paid`/`Waived`/`Voided`/`Partially Paid` statuses (`HIGH-05`).
   - Exclude waived/awaiting-quotation lost-book reports from renewal blockers and allow dismissing linked Damage cases (`HIGH-06`).
   - Preserve `requestId` in `validateBorrowCart`, fix `returnBook` `lifecycle_status` & null-copy join, unify `refreshClearance` with `clearance_overrides` & `in_library_uses` (`HIGH-10`, `HIGH-11`, `HIGH-16`).
   - Fix scheduled borrowing eligibility/cap/status, `cancelRequest` copy release & lock order, `chargeBookPrice` rejected-report reuse & `repaired_available` allocation, desk `'Worn'` -> `'Fair'` mapping, `preflightCheckout` alignment, policy renewal flags / calendar date validation, `manualCheckIn` date filter, and `longOverdue` elapsed-day check.
3. **Phase 3 — Manila Timezone Consistency, Vercel `max: 1` Pool Self-Deadlocks & Transaction Safety**
   - Fix `renewal.repository.ts` & `renewal.service.ts` Manila `TIMESTAMP WITHOUT TIME ZONE` reads/writes (`CRIT-03`).
   - Fix Manila vs. UTC SQL comparisons/casts in `circulation.service.ts`, `desk-request-context.ts`, `desk-circulation.service.ts`, `borrowing-schedule.service.ts`, `clearance.service.ts`, `dashboard.repository.ts`, and `audit-logs.service.ts` (`HIGH-07`).
   - Fix all Vercel `DB_CONNECTION_LIMIT=1` self-deadlocks (`violation-categories.service.ts`, `circulation.service.ts`, `fines.service.ts`, `printing.service.ts`, `renewal.service.ts`/`renewal.repository.ts`), add `.execute` to `desk-circulation.service.ts`'s `transactionPool`, and default Vercel pool limit safely (`HIGH-03`, `HIGH-12`).
   - Fix `pg-pool.js` rollback disconnect masking & client destruction, move remote HTTPS calls out of open DB transactions (`web-push.ts`, `import-automation.service.ts`), and serialize `floor-plan-image.service.ts` swaps (`HIGH-21`, `MED-10`, `MED-18`).
4. **Phase 4 — Payments, Printing & Notification Delivery Completeness**
   - Require full payment on `Printing` bills and compute `balance_before`/`balance_after` in `payments.settlement.ts` (`HIGH-02`).
   - Fall back to Postgres `online_payment_attempts` in `payment-assurance.integration.ts` when `localPaymentPreview` is disabled (`HIGH-18`).
   - Emit staff/user notifications in `printing-phase-one.service.ts` & `printing-deferred.service.ts`; update `price_per_page` on conflict in `paper-sizes.service.ts` (`MED-07`, `MED-08`).
   - Fix Faculty `/faculty/*` notification paths, `urgent-cases.ts` recipient loop, `MulterError` 422 handling in `app.js`, and print submission rate limiting (`MED-09`, `LOW`).
5. **Phase 5 — Users, Ownership Transfer, Enrollment, Catalog SQLSTATEs & Migration `076`**
   - Add idempotent migration `076_enrollment_roster_source_kind.sql`, update `schema-readiness.ts`, and wrap `apply-supabase-file.js` in transactions without silent checksum overwrite (`HIGH-04`, `MED-21`).
   - Decouple ownership transfer 24h invitations from session-rotating `accounts.auth_version` (`HIGH-13`).
   - Fix semester-deactivated account reactivation, `facultyEnrollmentService.qrRoster` & `start()` Student roster guard, `latestImportedSemester()`, ExcelJS hyperlink email parsing, and orphan `users`/unlinked `accounts` conflict detection (`HIGH-14`, `HIGH-15`, `MED-19`, `MED-20`).
   - Add Postgres SQLSTATE checks (`23505`, `42703`, `42P01`) in catalog repositories, validate `invoice.service.ts` serials when `approved === false`, and remove broken/unused dead helpers.
6. **Phase 6 — Web Frontend Fixes & End-to-End Verification**
   - Route online `Other` service charge receipts to `/service-charges/receipts/:id/pdf` in `payments-api.ts` (`HIGH-09`).
   - Keep `error` toast tone in `StocktakePage.tsx:saveDetected` (`MED-13`).
   - Add CSV formula-injection neutralization in `CatalogManagementPage.tsx` & `AdminAuditLogsPage.tsx` and fetch all filtered pages in `exportCatalogHoldingsFile()`.

## Implementation Tracking

- [x] Branch `fix/system-audit-remediation` created and plan saved (`inprogress` -> `built`)
- [x] Phase 1: Security, RBAC, Auth, Session & Routing fixes + tests (`f4a63a9`)
- [x] Phase 2: Clearance, Confirmed-Lost lifecycle, Fine ledger & Circulation fixes + tests (`873af9d`)
- [x] Phase 3: Manila timezone, Vercel pool self-deadlocks & transaction safety + tests (`873af9d`)
- [x] Phase 4: Payments, Printing & Notification delivery fixes + tests (`c7c27ab`)
- [x] Phase 5: Users, Ownership Transfer, Enrollment, Catalog SQLSTATEs & Migration `077` + tests (`d233e3d`)
- [x] Phase 6: Web frontend fixes + tests
- [x] Full `npm test`, `npm run typecheck`, `npm run build`, and combined security + database review

## Change Log

| Date | Change |
| --- | --- |
| 2026-11-20 | Plan approved by Ethan; branch `fix/system-audit-remediation` created from `feat/violation-categories-maintenance` (`dc773a1`); status set to `inprogress`. |
| 2026-11-20 | Completed all 6 phases with tests-first workflow; wrote `database/supabase/077_enrollment_roster_source_kind.sql` (since `076_violation_fine_limit_setting.sql` is already applied on `feat/violation-categories-maintenance`); status updated to `built`. |
