# New revisions Phase 3: Policies, accounts, payments and printing

- **Date created:** 2026-11-20
- **Date last updated:** 2026-11-20
- **Status:** planned
- **Source:** Ethan's `new-revisions.docx` (2026-11-20). Other phases: `2026-11-20-revisions-phase-1-fixes-and-cleanups.md` `2026-11-20-revisions-phase-2-catalog-circulation-maintenance.md`
- **Migrations:** next unused number is **078** (see `.cursor/agent-protocol.md`); numbers are assigned when each slice is built.

## Why

Ethan's `new-revisions.docx` lists about 45 changes from user testing: bugs ("does not work"), wording and UI cleanups, and new maintenance screens. I mapped every item to its code. They group into three phases, ordered by risk:
1. Fixes and cleanups with no schema change, to ship first.
2. Catalog and circulation features that need migrations.
3. Policies, accounts, payments and printing, the largest group.

**Decisions already made:**
- Payments: make the hosted practice mode (Xendit test keys) work end to end. No real money.
- Faculty get no overdue fines and no violation fines. Warnings are still recorded.
- Registration rejects an ID that isn't on the roster, with a clear message and a tight per-IP rate limit.
- An imported copy with no shelf is stored as **Unassigned** (shelf is nullable) and shows up in shelf suggestions.

**Rules for every phase (CLAUDE.md and agent-protocol):**
- **Plan doc:** each phase gets a plan doc in `docs/plans/2026-11-2x-revisions-phase-N.md` with the standard shape and status `planned`.
- **Branches:** one `fix/` or `feat/` branch per slice listed below.
- **Build flow:** tests first, then `library-builder` → `plan-verifier` → `security-reviewer`. Add `database-reviewer` when a slice has a migration.
- **UI work:** use the `sti-vaadin-design-system` and `sti-ux-qa-critic` skills.
- **Migrations:** start at **078**, one file per schema change under `database/supabase/`, and update the tracker in `.cursor/agent-protocol.md`.
- **Go-ahead:** no push, merge, deploy or live migration without Ethan's go-ahead.

## How

**3a. Time fields in policies (`feat/policy-time-windows`)**
- Migration: `fine_policy_versions` gets the hours during which the hourly fine runs. `borrowing_policy_versions` gets the times borrowing and returning are allowed.
- Enforce them in `fine-calculator.ts`, `desk-circulation.policy.ts` and the return flow.
- Add the fields to `AdminFinePoliciesPage.tsx` and `AdminBorrowingPoliciesPage.tsx:235`.

**3b. Separate Faculty and Student policies (`feat/faculty-student-policies`)**
- Migration: faculty renewal and waitlist columns (or a role-keyed table) next to the existing `student_*` and `faculty_*` loan-limit columns.
- Screens: separate Student and Faculty tabs for waitlist, renewal and the active-loan limit (`LibraryCirculationSetupPanel.tsx`, `AdminBorrowingPoliciesPage`). The faculty loan limit defaults to unlimited.
- Fines: faculty are exempt from overdue fines (`circulation.service.ts:821,849`, `circulation-overdue.service.ts:40`) and violation fines (`conduct.service.ts:53`). Warnings are still recorded.
- Update `renewal.service.ts` to use the role's values.

**3c. Registration, roster and activation (`feat/roster-activation`)**
- **Roster check:** `roster-registration.service.ts` `begin` rejects an ID not on the active roster, or one with no email, with a clear 422 error and a strict per-IP rate limit. Show the error in `RosterRegistrationForm.tsx` and add validation for each input.
- **Faculty roster:** reuse the existing faculty import (`/admin/faculty-enrollment`). Fill the gaps: department columns in the parser and late enrollment for faculty.
- **QR Roster:** `StudentQrRosterPage.tsx` gets a Student / Faculty switch using `facultyEnrollmentApi`. Rename the label to "QR Roster" in `admin-navigation.ts:20`, `PortalLayout.tsx:114` and `AdminAccountDashboardPage.tsx:117`.
- **Activation emails:**
  - A new "Send activation emails" action on the roster mails every imported row without an account, through `school-email.sender.ts` (Microsoft Graph or Outlook).
  - Record each row's send result. Stop hiding send errors in `begin`.
  - Fix the `GMAIL_USER` / `GMAIL_SENDER_EMAIL` mismatch in `env.js:125`.
  - Ethan must confirm the `MS_GRAPH_*` variables and the Mail.Send consent on Vercel.

**3d. Printing and photocopy (`fix/printing-upload-payment-choice`)**
- **Upload:**
  - A migration creates the private `printing-documents` storage bucket.
  - Confirm `SUPABASE_SECRET_KEY` on Vercel, and check the runtime logs for `PRINT_*` errors.
  - Set `DOCX_RENDERER_URL` to a hosted Gotenberg so DOCX conversion fits the 60 s limit.
  - Show a clear message for files over 4 MB.
- **Photocopy payment choice:**
  - Add a payment-method column on `print_requests` and a "Pay cash at library / Pay online" choice in `PrintRequestForm.tsx`.
  - The choice routes to `PrintCounterPaymentDialog` or `PaymentAction`.

**3e. Payments in practice mode (`fix/hosted-payment-practice`)**
- Make the hosted practice mode work end to end on Vercel:
  - `HOSTED_PAYMENT_PREVIEW`, an `xnd_development_` key, the exact `WEB_ORIGIN`, the refund and payout flags, and GCash switched on in `gcash_payment_settings`.
  - Fix any code errors found while testing `LibraryFundsPage` and `PaymentAction`.
- Label the screens as practice mode.

**3f. Restricted staff account (`feat/restricted-staff-role`)**
- Add permissions so Staff can only use printing payments, attendance, and borrow & return (`core/library-permissions.ts`, `payments.routes.ts` limited to the Printing kind).
- Remove Book queue, Announcements and Library schedule from `staffNav` (`PortalLayout.tsx:119`) and from the staff routes (`App.tsx:182-193`).
- Create the test account with `POST /users/staff` (`registration.service.ts` `createStaffAccount`) only with Ethan's go-ahead, and record it in the seed docs. Its password is never written in chat.

## Verification

- `npm test`, `npm run typecheck` and `npm run build` from the repo root. Each slice has new failing-first tests next to the code: `node --test` with supertest for the API, Vitest for the web.
- Migrations are checked against a PGlite or local test database. They are applied to live Supabase only with Ethan's go-ahead, then verified read-only.
- Check each slice in the browser with `npm run dev:api:stable` and `npm run dev:web` (the root dev script is broken), signed in as Admin, Librarian, Staff, Student and Faculty as relevant, on desktop and mobile. Specific checks:
  - The borrower barcode scans with the webcam.
  - The ISBN lookup fills and clears the fields.
  - The reservation calendar stops at the semester end.
  - A notification time matches the borrow time.
  - A DOCX upload produces a page count.
- `plan-verifier` before each PR. Each phase's plan doc moves `planned` → `inprogress` → `built` with a change log entry.

## Implementation tracking

- [ ] 3a. Time fields in policies (`feat/policy-time-windows`)
- [ ] 3b. Separate Faculty and Student policies (`feat/faculty-student-policies`)
- [ ] 3c. Registration, roster and activation (`feat/roster-activation`)
- [ ] 3d. Printing and photocopy (`fix/printing-upload-payment-choice`)
- [ ] 3e. Payments in practice mode (`fix/hosted-payment-practice`)
- [ ] 3f. Restricted staff account (`feat/restricted-staff-role`)

## Change log

| Date | Change |
| --- | --- |
| 2026-11-20 | Plan drafted from `new-revisions.docx` and a code map of every item; Ethan approved the 3-phase split. Status `planned`. |
