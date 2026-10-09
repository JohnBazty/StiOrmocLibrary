# Security and UX audit findings

Catalog from the 2026-10 security/UX pass. Isolation is enforced in the Express API (JWT `accountId` → linked `user_id`), not per-user Postgres RLS.

## A. User data isolation

| Severity | Status | Finding | File | Fix |
|---|---|---|---|---|
| Critical | Fixed | Legacy `/api/attendance` remounted staff APIs with only `requireAuth` | `apps/api/src/app.js`, `modules/index.ts` | Staff `requireRoles` on `/api/attendance` + service `requireStaff` |
| High | Fixed | Legacy `/api/dashboard/admin` had no role guard | `dashboard.routes.ts`, `dashboard.controller.ts` | Staff guard on mount + controller role check |
| High | Fixed | PostgREST lockdown migration missing on this branch | `database/supabase/` | Added `008_rls_service_role_lockdown.sql` |
| OK | — | Notifications / printing / fines receipts / circulation cancel / reservations ownership | respective modules | Keep pattern |

## B. Environment / secrets

| Severity | Status | Finding | Notes |
|---|---|---|---|
| OK | — | `.env` / `.env.local` gitignored | Root `.gitignore` |
| OK | — | Secrets only in `apps/api/src/config/env.js` | No `VITE_` secrets except `VITE_INVENTORY_MOCK_AUTH` (dev flag) |
| OK | — | No hardcoded live API keys in source | Test passwords only |

## C. Loading / errors / validation

| Severity | Status | Finding | File |
|---|---|---|---|
| High | Fixed | Silent receipts failure | `StudentFinesPage.tsx` |
| Medium | Fixed | Clearance / fines / announcements missing load busy UI | student clearance, fines, admin announcements |
| Medium | Fixed | Generic API errors; no network vs server split | `apps/web/src/lib/api-error.ts` + fines/clearance/notification APIs |
| Medium | Fixed | Registration missing `maxLength` | `RegistrationPage.tsx` |
| Medium | Fixed | Announcement form already had maxLength; refresh disabled while loading | `AdminAnnouncementsPage.tsx` |
| Medium | Fixed | Optimistic mark-read / mark-all-read | `NotificationCenterPage.tsx` |
| Medium | Fixed | Catalog create forms missing maxLength | `AddMultipleCopiesModal.tsx`, `AddResearchModal.tsx` |
| Medium | Fixed | Admin fine payment/infraction client validation | `AdminFinesPage.tsx` |

### Form before / after (summary)

- **Registration / Login:** required only → required + `maxLength` aligned with API (names 100, school ID 50, password 72, contact 30).
- **Admin fines:** HTML required only → numeric amount checks, school ID required, details ≥10 chars, maxLength on notes/location/details, busy button labels.
- **Catalog book/thesis:** free-length inputs → title/author 255, ISBN 20, abstract 5000, year 4, etc.
- **Announcements:** already had maxLength; added trim validation + loading state.

## RLS architecture

Do not use `auth.uid()` policies: app auth is custom JWT. Defense in depth: API ownership + RLS enabled with `service_role` policies + revoke `anon`/`authenticated` on public schema.
