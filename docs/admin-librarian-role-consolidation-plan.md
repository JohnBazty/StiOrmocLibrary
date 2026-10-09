# Admin and Librarian Role Consolidation Plan

## Why

The system currently represents `Admin`, `System Administrator`, and `Librarian` as overlapping staff identities. This creates inconsistent access: most administrative APIs accept both Admin and Librarian, some high-control features accept only Admin, the legacy session flow uses System Administrator, and the React application gives Librarian a separate but incomplete workspace.

The approved direction is one administrative identity: the **Admin is the Librarian**. `Admin` will be the only stored and issued administrative authorization role. “Librarian” remains the staff member's real-world job title and may appear in explanatory interface text, but it will no longer be a separate permission value, login destination, or dashboard.

- Date created: 2026-10-09
- Date last updated: 2026-10-09
- Status: `planned`

Allowed status values: `planned` -> `inprogress` -> `built`.

## Objective

Deliver one Admin/Librarian experience in which:

- a librarian signs in through the existing staff sign-in page;
- the authenticated role is always `Admin`;
- the librarian receives the complete existing Admin workspace and all library-management permissions;
- no new account, token, filter, or route uses `Librarian` as an authorization value;
- existing Librarian accounts are converted without changing their credentials, status, profile, or historical ownership records; and
- Student and Faculty permissions remain unchanged.

## Decisions and assumptions

1. **Canonical authorization value:** `Admin`.
2. **Human meaning:** an Admin account is the Librarian/Super Admin described by the product documents.
3. **Canonical workspace:** `/admin/*`, reached through `/staff`; `/admin/login` remains a redirect to `/staff`.
4. **Legacy values:** `Librarian` and `System Administrator` are migration aliases only. They must not be issued after consolidation.
5. **Permission result:** former Librarian accounts receive the complete Admin permission set, including announcements, floor-plan editing, category reassignment, settings, reporting, and other currently Admin-only operations. This access expansion is intentional.
6. **Out of scope:** introducing the separate restricted Library Staff/Student Assistant role, changing Student or Faculty rules, redesigning the Admin interface, or changing library business policies.
7. **Historical integrity:** operational history continues to point to the same `account_id` and `user_id`. Only current identity-role fields are normalized; transaction, audit, payment, attendance, inventory, and circulation history is not rewritten.

## Source-of-truth reconciliation

The preserved Final Draft describes the Librarian as the Super Admin with full configuration and policy access. The Administrative System Flow begins with one Admin login and one Admin dashboard containing the complete library operation. Those requirements support one operational Librarian/Admin identity.

The same Final Draft separately names a System Administrator as a technical stakeholder. This plan intentionally supersedes that separation for application authorization because the current explicit requirement is that the Admin be the Librarian. The implementation must record this approved variance in `docs/source-of-truth.md`, `agent.md`, and `docs/schema-context.md` without modifying the preserved PDF files.

## Current implementation gaps

- MySQL `users.user_role` and `accounts.role` allow both `Admin` and `Librarian`.
- The normalized `roles` table seeds `System Administrator` and `Librarian`, while application JWTs translate System Administrator to `Admin`.
- Supabase/Postgres stores the same role values as unrestricted text.
- JWT and session authentication accept different staff role names and route them differently.
- Most administrative route guards accept Admin or Librarian, but several sensitive actions accept only Admin.
- The React role type, token decoder, protected routes, filters, and floor-plan links retain a Librarian branch.
- `/librarian/dashboard` is a separate incomplete page rather than the complete administrative workspace.
- User and attendance reporting can display Admin and Librarian as separate groups.
- Account creation and setup documentation still instruct developers to create a System Administrator.

## How

### Phase 1 - Establish compatibility at the authentication boundary

Update the existing authentication code so every staff identity has one effective role before authorization is checked.

1. Make `Admin`, `Student`, and `Faculty` the canonical application roles.
2. During the rollout window only, translate database/session/token values `Librarian` and `System Administrator` to the effective role `Admin`.
3. Issue new JWTs with `role: Admin` and return `/admin/dashboard` for every staff login.
4. Make the staff portal allow-list accept the effective Admin role only after normalization.
5. Replace Admin/Librarian route and service allow-lists with Admin-only checks.
6. Preserve the current Student/Faculty portal split and rejection behavior.

Primary change points:

- `apps/api/src/modules/auth/auth.constants.js`
- `apps/api/src/modules/auth/auth.middleware.js`
- `apps/api/src/modules/auth/authController.js`
- `apps/api/src/modules/auth/account-auth.validation.ts`
- `apps/api/src/modules/auth/jwt-auth.service.ts`
- `apps/api/src/modules/auth/jwt-auth.middleware.ts`
- `apps/api/src/modules/auth/jwt-auth.routes.ts`
- `apps/api/src/app.js`
- the catalog, circulation, reservations, attendance, dashboard, fines, clearance, and notification role checks that currently mention Librarian

Compatibility must be narrow: only already authenticated legacy values are translated. Public registration and client-supplied role data must never be allowed to request Admin access.

### Phase 2 - Normalize MySQL identity data

Use the next available MySQL migration after the current pending `20261009_041_password_reset_otp.sql`. If no other migration lands first, use:

`database/migrations/20261009_042_consolidate_librarian_into_admin.sql`

The migration will:

1. Insert or update one normalized `roles.role_name = 'Admin'` row with a Librarian/Super Admin description.
2. Update every legacy System Administrator and Librarian `users.role_id` to the Admin role row.
3. Update `users.user_role = 'Admin'` wherever it is currently `Librarian`.
4. Update `accounts.role = 'Admin'` wherever it is currently `Librarian`.
5. Verify that no `users` or `accounts` row retains a legacy staff role.
6. Narrow the MySQL enums to `Admin`, `Student`, and `Faculty` only.
7. Remove the unreferenced `System Administrator` and `Librarian` rows from `roles` after the foreign-key update succeeds.
8. Leave account status, passwords, IDs, profiles, timestamps, and operational foreign keys unchanged.

The migration must perform the data updates before narrowing enum values. It must abort on any unexpected role value instead of silently converting it.

Also update `database/mysql56-schema.sql` so a new database starts with the consolidated role contract. Do not edit any already-applied migration.

### Phase 3 - Apply the same contract to Supabase/Postgres

Add the next Supabase migration, expected to be:

`database/supabase/010_consolidate_librarian_into_admin.sql`

It will perform the same role-row and identity backfill as MySQL. Because the current Postgres columns are text, add explicit check constraints so `users.user_role` and `accounts.role` accept only `Admin`, `Student`, or `Faculty` after existing data is validated.

Update the Postgres baseline or gap-fill source used for fresh environments so a clean deployment does not recreate Librarian or System Administrator as separate roles. Keep the MySQL tree usable as the documented rollback reference.

### Phase 4 - Collapse the frontend into the Admin workspace

1. Remove `Librarian` from the frontend `AuthRole` type and valid-token role set.
2. Route all normalized staff identities to `/admin/dashboard`.
3. Remove the separate Librarian protected route and incomplete Librarian dashboard usage.
4. Keep temporary redirects from `/librarian/dashboard` to `/admin/dashboard` and `/librarian/floor-plan` to `/admin/floor-plan` for saved bookmarks.
5. Remove Librarian branches from catalog and floor-plan link generation.
6. Remove Librarian from attendance and active-user role filters and combine staff counts under `Admin`.
7. Change interface wording such as “Admin and librarians” to one clear label such as “Admin (Librarian)”.
8. Keep one staff sign-in page. Its copy should make clear that it is the restricted Librarian/Admin entrance, without adding a role selector.

Primary change points:

- `apps/web/src/App.tsx`
- `apps/web/src/features/auth/auth-storage.ts`
- `apps/web/src/features/auth/auth-api.ts`
- `apps/web/src/features/auth/AdminLoginPage.tsx`
- `apps/web/src/features/auth/ProtectedRoute.tsx`
- `apps/web/src/features/auth/RoleDashboardPage.tsx`
- `apps/web/src/features/attendance/AdminAttendancePage.tsx`
- `apps/web/src/features/users/AdminUsersPage.tsx`
- `apps/web/src/features/floor-plan/FloorPlanPage.tsx`
- `apps/web/src/features/floor-plan/ViewLocationButton.tsx`

### Phase 5 - Remove role drift from operational modules

Search the production API and web application for every exact `Librarian`, `System Administrator`, and `/librarian` reference. Classify each occurrence before changing it:

- authorization value or route: replace with canonical Admin behavior;
- compatibility boundary: retain temporarily with an explicit removal note;
- human job-title text: keep only when it describes the real librarian rather than a permission role;
- historical migration: do not edit;
- test fixture: update or retain only when it verifies legacy compatibility.

Update staff summaries, role filters, error messages, mock identities, account-creation validation, and setup commands so they cannot reintroduce Librarian as a separate role.

### Phase 6 - Documentation and operational guidance

Update:

- `README.MD` account creation and login instructions;
- `docs/authentication-setup.md` and `docs/jwt-role-authentication.md`;
- `docs/api-reference.md` where roles or destinations are listed;
- `docs/schema-context.md` with the new three-value role contract and migration references;
- `docs/source-of-truth.md` and `agent.md` with the approved variance that Admin represents the Librarian/Super Admin;
- `.cursor/agent-protocol.md` with the actual latest and next MySQL migration numbers when migration 042 is added; and
- this plan's status, checklist, and change log throughout implementation.

The preserved source PDFs remain unchanged.

## Deployment sequence

1. Back up the active database and record counts for Admin, Librarian, and System Administrator identities in both `users` and `accounts`.
2. Deploy the compatibility-capable authentication/API code so old staff values normalize to Admin.
3. Apply the MySQL or Supabase migration appropriate to the active database.
4. Deploy the consolidated frontend and final Admin-only authorization checks.
5. Confirm that every converted staff account can sign in through `/staff` and reaches `/admin/dashboard`.
6. Keep legacy token/session normalization for at least the maximum existing authentication lifetime: 15 minutes for JWTs and 30 minutes of session inactivity, plus deployment clock skew.
7. Remove the temporary role alias only in a later verified release. Bookmark redirects may remain longer because they do not weaken authorization.

Do not deploy a database migration that removes legacy role values before compatible application code is available; the existing session login path otherwise rejects `Admin` as a normalized `roles` table name.

## Verification plan

### Database verification

- Run the MySQL migration against a disposable copy containing Admin, System Administrator, Librarian, Student, and Faculty fixtures.
- Run the Postgres migration against a disposable Supabase-compatible schema with the same fixtures.
- Confirm every former Librarian and System Administrator keeps the same account ID, user ID, password hash, account status, and profile data but now has role Admin.
- Confirm no current identity row or active role seed contains Librarian or System Administrator.
- Confirm inserting Librarian into `users.user_role` or `accounts.role` is rejected after migration.
- Confirm operational foreign-key counts and representative audit records are unchanged.
- Confirm fresh MySQL and Postgres schema setup creates only Admin, Student, and Faculty authorization values.

### API verification

- Admin staff login succeeds and returns an Admin token with `/admin/dashboard`.
- A migrated Librarian credential succeeds without a password reset and returns the same Admin result.
- A legacy signed Librarian token is normalized during the compatibility window, while an invalid or unsigned role remains rejected.
- Admin can access every existing library-management area, including the operations previously restricted to Admin only.
- Student and Faculty receive `403` responses from all administrative endpoints.
- Public registration still creates Student only and cannot accept a requested staff role.
- Staff role filters and summaries return a single Admin group.

### Frontend verification

- `/staff` signs the librarian into the complete Admin workspace.
- All Admin navigation destinations load and the browser back/forward flow remains valid.
- Legacy Librarian bookmarks redirect to the corresponding Admin page.
- No visible role selector or separate Librarian dashboard remains.
- Student and Faculty routes continue to render and remain isolated from Admin pages.
- Attendance, users, floor plan, catalog, reservations, fines, clearance, printing, announcements, reports, and logout are checked manually in the browser.

### Automated verification

Run and require successful results from:

```powershell
npm test
npm run typecheck
npm run build
```

Add focused tests for authentication normalization, Admin-only route guards, former-Librarian migration behavior, legacy route redirects, role filters, and negative Student/Faculty access.

## Acceptance criteria

- `Admin` is the only administrative value issued by authentication or stored in current identity rows.
- Existing Librarian credentials still work and lead to `/admin/dashboard`.
- Former Librarian accounts have the full Admin feature set.
- No production route guard depends on `Librarian` or `System Administrator` as a separate permission role.
- No separate Librarian dashboard or role selection is visible.
- Student and Faculty access is unchanged.
- MySQL and Supabase/Postgres schemas enforce the same role contract.
- Historical operational records remain intact and attributable to the same people.
- All focused tests, the full test suite, type checking, build, migration checks, and browser smoke tests pass.
- Documentation and migration trackers describe the consolidated role accurately.

## Risks and mitigations

- **Intended privilege expansion:** former Librarian accounts gain features that were Admin-only. Mitigation: this is the approved outcome; verify the complete permission matrix explicitly.
- **Stale staff tokens or sessions:** old credentials may carry Librarian or System Administrator. Mitigation: normalize these only at trusted authentication boundaries for the bounded rollout window.
- **Deployment order mismatch:** old code may reject the new Admin role row. Mitigation: deploy compatibility code before migrating data.
- **Dual-database drift:** MySQL and Postgres may accept different values. Mitigation: ship and test paired migrations and update both fresh-schema paths.
- **Report changes:** historical dashboards may show Admin instead of Librarian after identity normalization. Mitigation: document that these reports resolve the person's current role; do not rewrite immutable operational events.
- **Unrelated in-progress work:** the current worktree contains other authentication and Supabase changes. Mitigation: implement this plan with contained diffs and rebase the planned migration numbers if another migration lands first.

## Rollback plan

If the deployment fails before the old role rows and enum values are removed, revert application routing and use the database backup only if identity data was already changed.

After the enums/check constraints are narrowed, rollback requires an explicit reverse migration that first restores legacy allowed values and role seed rows, then restores backed-up role assignments. Do not infer which Admin accounts were formerly Librarian unless the pre-deployment mapping was exported securely. Prefer fixing forward because operational records continue to reference stable account and user IDs.

## Implementation tracking

- [x] Product documents and administrative flow reviewed.
- [x] Current authentication, routes, role guards, frontend branches, and schema contract inventoried.
- [x] Canonical role and rollout strategy selected.
- [ ] Ethan approves implementation.
- [ ] Set status to `inprogress` and confirm final migration numbers.
- [ ] Add compatibility normalization and focused authentication tests.
- [ ] Add and test MySQL migration and baseline update.
- [ ] Add and test Supabase/Postgres migration and fresh-schema update.
- [ ] Consolidate API authorization checks.
- [ ] Consolidate frontend routes, role types, filters, and wording.
- [ ] Update setup, architecture, authentication, API, schema, and migration-tracker documentation.
- [ ] Run database, API, frontend, visual, full-suite, typecheck, and build verification.
- [ ] Remove bounded compatibility aliases in a later verified release.
- [ ] Set status to `built` and record final results.

## Change log

- 2026-10-09 - Created the plan with status `planned`. Selected `Admin` as the single authorization role representing the Librarian/Super Admin, documented backward-safe MySQL and Supabase migrations, one Admin workspace, compatibility handling, testing, rollout, and rollback. Branch `feat/admin-librarian-role-consolidation` created from `main` for this work.

