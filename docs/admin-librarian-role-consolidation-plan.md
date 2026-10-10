# Admin and Librarian Role Consolidation Plan

## Why

The system currently represents `Admin`, `System Administrator`, and `Librarian` as overlapping staff identities. This creates inconsistent access: most administrative APIs accept both Admin and Librarian, some high-control features accept only Admin, the legacy session flow uses System Administrator, and the React application gives Librarian a separate but incomplete workspace.

The approved direction is one administrative identity: the **Admin is the Librarian**. `Admin` will be the only stored and issued administrative authorization role. “Librarian” remains the staff member's real-world job title and may appear in explanatory interface text, but it will no longer be a separate permission value, login destination, or dashboard.

- Date created: 2026-10-09
- Date last updated: 2026-10-09
- Status: `built`

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

## Confirmed migration numbers

| Database | File |
| --- | --- |
| MySQL | `database/migrations/20261009_043_consolidate_librarian_into_admin.sql` (next after `042`) |
| Supabase/Postgres | `database/supabase/013_consolidate_librarian_into_admin.sql` (next after `012`) |

## Implementation tracking

- [x] Product documents and administrative flow reviewed.
- [x] Current authentication, routes, role guards, frontend branches, and schema contract inventoried.
- [x] Canonical role and rollout strategy selected.
- [x] Ethan approves implementation.
- [x] Set status to `inprogress` and confirm final migration numbers.
- [x] Add compatibility normalization and focused authentication tests.
- [x] Add and test MySQL migration and baseline update.
- [x] Add and test Supabase/Postgres migration and fresh-schema update.
- [x] Consolidate API authorization checks.
- [x] Consolidate frontend routes, role types, filters, and wording.
- [x] Update setup, architecture, authentication, API, schema, and migration-tracker documentation.
- [x] Run database, API, frontend, visual, full-suite, typecheck, and build verification.
- [ ] Remove bounded compatibility aliases in a later verified release.
- [x] Set status to `built` and record final results.

## Change log

- 2026-10-09 - Created the plan with status `planned`. Selected `Admin` as the single authorization role representing the Librarian/Super Admin.
- 2026-10-09 - Status set to `inprogress`. Confirmed MySQL migration `043` and Supabase migration `013` after later `041`/`042`/`010`–`012` work landed. Branch `feat/admin-librarian-role-consolidation`.
- 2026-10-09 - Status set to `built`. Auth normalization, Admin-only API guards, frontend `/staff` workspace, MySQL `043` + Supabase `013`, docs, and verification completed. API tests 238/238 pass; typecheck passes. Bounded legacy token/session aliases retained for rollout. Pre-existing web test flakes in ResearchCatalog/BorrowingHistory unrelated to this change.
