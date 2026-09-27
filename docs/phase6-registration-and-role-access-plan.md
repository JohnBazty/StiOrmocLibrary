# Phase 6 — Registration, verification, and role access

- **Date created:** 2026-09-27
- **Date last updated:** 2026-09-28
- **Status:** `inprogress`
- **Parent roadmap:** [System fixes and features plan](system-fixes-and-features-plan.md)

## Why

The current registration screen creates only Student accounts, while the library also needs Faculty, Librarian, and Staff accounts. New accounts need a real verified school email, and each role needs its own usable, enforced workspace. The existing Admin and Librarian permissions overlap, so changing the menu alone would leave access inconsistent. This phase defines the complete account and permission transition before implementation.

## Current system and source checks

- Before Phase 6, registration said “Student Registration,” required contact number, program/strand, and year/grade, and created an active Student account with a generated placeholder email. Login offered Student, Faculty, and Librarian; Staff was missing. The old Admin route had wider operational access than requested here.
- The preserved product draft describes Student/Faculty users, a restricted Library Staff role, a Librarian with library-wide authority, and a separate technical System Administrator. The current JWT label `Admin` maps to System Administrator. `agent.md` permits anonymous Student/Faculty registration and requires an authenticated System Administrator for Librarian creation. Phase 6 honors that protection by treating public Librarian and Staff selections as **applications**, with no privileged account activation until Admin reviews them. The user's requested narrower Admin workspace takes precedence over the older broader Admin menu; protected account provisioning remains in its Users workflow.
- The [official STI College Ormoc campus page](https://sti.edu/campuses/ormoc) currently lists BS Information Technology, BS Tourism Management, BS Hospitality Management, Academic SHS choices STEM/ABM/HUMSS/General Academic, and TechPro choices IT in Mobile App and Web Development, Computer and Communications Technology, Tourism Operations, and Culinary Arts. Digital Arts and Restaurant and Cafe Operations appear in the user's requested list but are not listed on the Ormoc page. The school must confirm local availability and the effective term before these become selectable. The claim that STI has removed all ABM/HUMSS/STEM strands conflicts with the current Ormoc listing; do not remove existing options or records on that claim alone.
- Active database work is Supabase Postgres. Existing accounts, school IDs, loans, payments, attendance, and audit history must survive the role transition. MySQL is an inactive rollback reference. At planning time the next local Postgres file is `015` and the next MySQL reference number is `047`; recheck immediately before writing migrations.

## How

### 1. Account Registration form and identity rules

Rename the heading, side panel, and login link to **Account Registration** / **Create your library account** / **Register an account**. Add a clearly labeled role selector with Student, Faculty, Librarian, and Staff, matching the login choices. Keep First Name, Last Name, School ID, Password, and Confirm Password; preserve the current password policy and confirmation checks. The API, not the browser, validates all fields and the selected role.

| Selected role | Identity fields shown | Academic fields | Result after submitting |
| --- | --- | --- | --- |
| Student | School ID and required school email for verification | Program/Strand and Year/Grade shown for students; required only where the school policy says they apply | Pending email verification, then eligible for normal student activation |
| Faculty | School ID and required school email | Optional | Pending email verification and any school roster check required by policy |
| Librarian | School ID and required school email | Optional | Pending email verification **and** authorized role approval; no Librarian access before approval |
| Staff | School ID and required school email | Optional | Pending email verification **and** authorized role approval; no Staff access before approval |

School email is required for every **new** role because every new account must receive a verification code. Do not collect or edit Contact Number in registration or Admin Users. Preserve any historical values in existing accounts until a separate data-retention decision. Keep school ID and school email unique after normalization, and never allow the client to choose Admin/System Administrator.

Use a configurable, school-approved domain allowlist, initially proposed as `@ormoc.sti.edu.ph`. Confirm whether `@sti.edu` is also legitimate for Ormoc before enabling it. Verify domain and actual mailbox ownership; merely matching a suffix or typing another person's address is insufficient. Provide a clear duplicate-account/recovery path without revealing whether a school ID or email exists to unauthenticated users.

### 2. Academic program choices

Use full display names for the three requested college programs:

- Bachelor of Science in Information Technology
- Bachelor of Science in Tourism Management
- Bachelor of Science in Hospitality Management

For Grade 11 and 12, show an **Academic** group with STEM, ABM, and HUMSS, and a **TechPro** group with IT in Mobile App and Web Development, Computer and Communications Technology, Tourism Operations, and Culinary Arts. Confirm whether General Academic should also appear for Ormoc because it is on the official campus listing. Keep Digital Arts and Restaurant and Cafe Operations in the configurable catalog as pending Ormoc confirmation; do not show them as active Ormoc selections until approved. Do not present the old generic “TVL” value as a new TechPro specialization, but preserve existing saved TVL and other legacy values in profiles and reports. Give each offering an effective term/status so future school changes do not rewrite historical enrollment.

For Faculty, Librarian, and Staff, Program/Strand and Year/Grade are optional and may be left blank. The form must not label those roles “Student” or force a grade selection.

### 3. Outlook email verification and role approval

1. Registration stores a pending request with a safely hashed password and no active privileged session. A school-approved server-side sender sends a one-time numeric code to the supplied school Outlook inbox. Sending to Outlook does not require the user's Outlook password.
2. A separate code-entry screen explains the destination, expiration, and resend wait. Codes are short-lived, single-use, stored hashed, rate-limited by account/IP, and never logged or returned to the browser. Failed delivery leaves a recoverable pending state; resend invalidates or supersedes older codes.
3. Successful code entry marks the email verified. It does **not** establish that the person is a Librarian or Staff. Those applications enter a restricted Admin review queue with identity/roster evidence, approve/reject reason, actor, and timestamp. The authenticated Admin/System Administrator must approve Librarian creation; only authorized reviewers can grant or change privileged roles. Rejection must not create a working privileged account.
4. Student activation follows the approved self-registration policy. Faculty access follows the school-approved roster/approval policy. The Admin/System Administrator role is provisioned only through a controlled existing-account process, never from the public form.
5. Login blocks unverified, pending-approval, deactivated, or archived accounts with an understandable status message. On role/status change, invalidate or recheck existing sessions/JWTs so former privileges cannot persist.

The production sender needs a school-approved Microsoft 365 integration or a verified sending domain from a transactional email provider. With a verified sending domain, the recipient is always the School Email entered by the current registrant; it is not fixed to the developer's address. For a local, single-recipient trial, Resend's `onboarding@resend.dev` sender may target only the account owner's configured school Outlook address; the API rejects other recipients and production use of this test sender. Keep sender credentials, tokens, and verification secrets only in API-side configuration, not in Vite/browser variables, logs, or the repository.

A personal Gmail sender is also available for a local multi-recipient prototype. Configure `GMAIL_SENDER_EMAIL` and a Google app password in the private API environment; the API sends each code to the School Email entered for that registration. The normal Gmail password is never used. Gmail sending on a deployed API requires `GMAIL_ALLOW_PRODUCTION=true` and the same private hosted environment values. This is an explicit pilot setting, not a reliability guarantee: Google may block automated server logins or limit sending. Use a school-approved Microsoft 365 sender or a verified sending domain for dependable wider use. Supabase migration `015` was applied on 2026-09-28, so registration can now store and verify requests locally.

### 4. Role-specific workspaces and enforcement

The screen navigation, route guards, API authorization, and row-level data access must all use the same action-level permission matrix. A hidden menu item is not an access control. Existing links and API calls must return a clear forbidden response when the role lacks permission. Preserve read-only access to one's own records where appropriate without granting operational actions.

| Role | Workspace / allowed modules | Deliberate exclusions |
| --- | --- | --- |
| Admin (System Administrator) | Dedicated Admin dashboard with active-user and student-clearance summaries; Users, Clearance, User Archive, and profile-picture approval notifications/worklist; protected Librarian/Staff provisioning inside Users | No catalog, circulation, reservations, fines, invoices, inventory, floor plan, printing, attendance operations, announcements publishing, or broad reports through the Admin role |
| Librarian | Current administrative dashboard; Books & Research, Book Archive, Categories, Borrow & Return, Reservations, Fines, Invoices, Inventory, Floor Plan, Printing Queue, Print Supplies, Attendance, Clearance, Announcements | No Users, User Archive, or profile-picture approval by default; no unlisted Reports/Settings until explicitly assigned |
| Staff | Dedicated Staff dashboard showing only permitted queue/attendance/announcement data; Borrow & Return, Reservations, Printing Queue, Attendance, Announcements | No catalog mutation, archiving, categories, finance management, inventory, user management, clearance override, settings, or reports |
| Student | Existing self-service portal and personal records | No operational or account-administration routes |
| Faculty | Student-style self-service portal and personal records, with the existing faculty borrowing policy | No operational or account-administration routes |

“Access” still needs action-level rules. In particular, Staff can work reservation and printing queues but cannot change money, override fines, or publish announcements unless the school separately authorizes those actions. Start with Staff read-only announcements and narrowly defined queue transitions. Librarian owns normal announcement publishing and library operations; Admin owns account and avatar approvals. Before removing current Admin operational rights, map every existing API endpoint and its actual actor, especially finance, clearance, reservation, and settings actions, to a replacement owner so no needed workflow becomes orphaned.

The **Admin dashboard** is separate from the Librarian's operational dashboard. Show (1) the total number of **Active** user accounts across roles, (2) **Cleared active students**, and (3) **Not-cleared active students**, using the same authoritative account-status and clearance calculations as the Users and Clearance pages. Label the population and last-updated time so the counts are understandable; avoid counting archived/deactivated students in either clearance card. If an active student's clearance has not yet been computed, show that as a separate pending/unknown count rather than silently treating the student as cleared or not cleared. Each card opens a filtered Admin-authorized Users or Clearance list; the dashboard does not expose Librarian operations. Refresh should recompute the cards and show a visible loading/error state instead of stale numbers without explanation.

### 5. Profile-picture approval

Phase 5 may let a user upload an avatar, but the newly uploaded image remains private and pending. Create an Admin worklist and in-app notification showing a safe preview, requester, submission time, and Approve/Reject controls. Admin approval atomically switches the published avatar; rejection keeps the prior approved image and tells the user why. Validate file type/size, scan or otherwise safely process uploads, audit each decision, and prevent direct access to pending images by other users. Apply the same review rule to Student, Faculty, Librarian, and Staff profile pictures once those profiles support uploads.

### 6. Data transition and release checks

- Add role, pending-email, pending-approval, code-delivery, and approval-audit support through backward-safe Supabase Postgres migrations. Preserve existing operational foreign keys and histories. Do not assign a privileged role just because a legacy row or request says so.
- Existing accounts with generated placeholder emails continue signing in under their current state during a managed transition. Prompt them to add and verify a real school email; deduplicate/resolve conflicts without overwriting another person's address or silently deactivating people. Existing Admin/Librarian sessions and API permissions need a staged cutover rather than an abrupt menu-only switch.
- Test every role against the **menu, direct URL, and API** for both allowed and forbidden actions. Cover duplicate identity, expired/wrong/replayed code, resend throttling, failed Outlook delivery, role application before and after approval, deactivation and token revocation, avatar approval/rejection, and legacy account sign-in. Confirm Student/Faculty borrowing behavior still follows the existing rules.
- Local checks use the Supabase Postgres test environment and include API/web suites, production builds, and actual registration/email flows with disposable accounts. A release later requires reviewed Supabase migrations, server-side email configuration, web/API deployment together, live-site acceptance for every role, and log monitoring. **This document only plans the work; do not push or deploy without the user's later instruction.**

## Decisions needed before implementation

1. School confirmation of valid Ormoc email domains, Microsoft 365 sending method, and whether incoming students already have a working mailbox before registration.
2. Ormoc registrar confirmation of the active Grade 11/12 offering list and effective term, including General Academic, Digital Arts, and Restaurant and Cafe Operations. Existing choices remain readable regardless.
3. Named institutional authority and roster/invitation evidence for Librarian and Staff approval; whether Faculty also requires manual review.
4. Exact Staff actions within Reservations, Printing Queue, Attendance, and Announcements; ownership of any Settings, Reports, and finance actions omitted from the new role lists.
5. Migration timing for existing accounts that currently use placeholder emails and for current Admin/Librarian users who will move to the new permission model.

## Implementation tracking

- [x] Reviewed current registration/login, role and schema notes, preserved product role descriptions, and Ormoc's published program listing.
- [x] Added Phase 6 scope and cross-reference to the master roadmap; moved excluded Phase 3 R1 here.
- [ ] Confirm the production sender (school-controlled Microsoft 365 or a verified sending domain), approved recipient domains, faculty roster policy, and offering list.
- [x] Prepare additive Supabase schema and backend registration/verification/approval changes locally; apply reviewed migration `015` to the connected Supabase project.
- [x] Build role-specific forms, navigation, dashboards, and avatar-review UI locally.
- [x] Add a local single-recipient Resend test sender for the account owner's Outlook inbox; actual delivery awaits a private API key and the pending Supabase migrations.
- [x] Add a personal Gmail app-password sender for local tests with different school Outlook recipients; deployed pilot use requires an explicit opt-in and private hosted credentials. Gmail accepted one non-OTP setup email, and the owner confirmed its arrival in school Outlook.
- [x] Test pending registration and one-time-code verification against migrated Supabase Postgres using a disposable Staff request and captured test code; remove the request afterward.
- [ ] Test a full browser registration with a real unused school mailbox, plus avatar upload/approval and all role permissions; release only when instructed.

Local code checks on 2026-09-27: 247 API tests, 81 web tests, both TypeScript checks, and both production builds passed. The running local web server returned HTTP 200 for `/register`. The local API health endpoint reported `migration_required` because Supabase tables from unapplied migrations `012`–`015` are absent. An actual Outlook code delivery, Supabase-backed registration, and avatar upload/approval still require the school-approved Microsoft 365 sender and reviewed migration rollout. No shared-database migration, GitHub push, or Vercel deployment was performed.

Local verification on 2026-09-28: migrations `012`–`015` applied to the connected Supabase project after a private snapshot. API health is healthy; 252 API tests, 81 web tests, and both API/web typechecks passed. A disposable Staff request used the real Postgres registration and verification path, reached PendingApproval without creating an account, and was removed. Gmail SMTP accepted a separate non-OTP test to the owner's Outlook address, and the owner confirmed inbox arrival. A full browser registration with an unused real school mailbox remains unconfirmed. No GitHub push or Vercel deployment.

## Change log

- **2026-09-28:** The owner confirmed the Gmail setup email arrived in the school Outlook inbox. This verifies local Gmail-to-Outlook delivery for that recipient; registration OTP delivery and verification through the browser still need an unused school account.
- **2026-09-28:** Applied Supabase `012`–`015` to unblock local Phase 2/6 testing after preserving affected rows in a private snapshot. Verified schema health, all 252 API tests, 81 web tests, API/web typechecks, and a disposable real-Postgres Staff registration/code transition; removed the test row. Actual inbox arrival, browser OTP journey, avatar review, and complete role acceptance remain pending. No push or deployment.
- **2026-09-27:** Configured a personal Gmail sender in the ignored local API environment and sent one non-OTP setup email to the owner's school Outlook address. Gmail SMTP accepted it; inbox delivery awaits recipient confirmation. The Gmail app password was not printed or committed. Local API health still reports missing Supabase Phase 6 tables, so registration and OTP verification remain untested end to end. No push or deployment.
- **2026-09-27:** Added Gmail app-password sending for a local multi-recipient OTP trial, with explicit production opt-in for a possible deployed pilot. Delivery remains unverified until private credentials are configured and Supabase migration `015` is applied. Gmail can be blocked or throttled, so an approved institutional or verified-domain sender remains the production target. No push or deployment.

- **2026-09-27:** Clarified that verified-domain production mail sends each registration code to the current registrant's School Email. The single-recipient Resend sender remains a local trial only and must be replaced before testing multiple accounts.
- **2026-09-27:** Added an optional local Resend sender for testing six-digit registration codes with one explicitly configured school Outlook recipient. The test sender is rejected in production and cannot send to other registrants; Microsoft Graph remains available for institution-approved production mail. No credentials, migrations, push, or deployment were changed.
- **2026-09-27:** Began local implementation. Public registration now collects a school email and requested role; one-time code verification precedes account creation. Librarian and Staff requests require Admin approval. Staff access is limited to circulation, reservations, printing queue, attendance, and read-only announcements. The Admin has a separate account dashboard, Users, User Archive, Clearance, and account/photo approvals; the Librarian retains the operational modules. Private avatar submissions wait for Admin review. Additive Supabase `015` and MySQL reference `047` are prepared but unapplied; Microsoft 365 sender approval/configuration and Supabase end-to-end testing are pending. No push or deployment.
- **2026-09-27:** Added a dedicated Admin dashboard to Phase 6 with active-user total, cleared and not-cleared active-student counts, a separate pending/unknown state, filtered drill-down links, and a visible refresh state. Kept the Librarian dashboard and the Admin role boundary distinct. Planning only; no application, database, push, or deployment change.
- **2026-09-27:** Created the Phase 6 plan from the requested role-aware registration, school Outlook code verification, program choices, restricted Admin/Librarian/Staff workspaces, and profile-picture review. Recorded the conflict between public Librarian selection and protected role creation as an approval workflow. Marked Digital Arts and Restaurant and Cafe Operations pending Ormoc confirmation. Planning only; no application, database, push, or deployment change.
