# Student roster registration and sign-in plan

| Field | Value |
| --- | --- |
| Date created | 2026-11-09 |
| Date last updated | 2026-11-09 |
| Status | `built` |
| Scope | Original Revision Phase 2 enrollment, semester controls, Student account verification and Semester Archive. |

## Why

Let enrolled students register using their Student ID and prove access to the school mailbox assigned to them by the registrar. Treat a successfully uploaded registrar CSV or Excel workbook as enrollment evidence for the selected semester. Preserve existing accounts, past approval records and transaction history.

The current system already sends email codes during registration and Student/Faculty sign-in. The [original enrollment work record](../revision-phase2-local-implementation.md) describes draft roster parsing and private API routes. Migration `031_semester_enrollment.sql` supersedes the unapplied 028 draft and reuses these foundations. This is separate from the deferred October 17 Dewey phase.

## Confirmed inputs and proposed rules

- The supplied roster was confirmed as the complete SY 2026–2027 first-semester list. A matching Student ID in a successfully uploaded roster is sufficient evidence of enrollment for that semester. The Admin selects the term and indicates whether the file is complete or partial at upload. There is no separate roster approval or manual enrollment verification step.
- Use the Student ID as text, including any leading zeroes, and the exact **Campus Email Address** from the uploaded row. Do not infer an email from an ID or let the applicant redirect the code to a different address.
- A student matched to the active roster is already enrolled for library eligibility. If they need a new account, the school email code proves that the mailbox belongs to them. After they enter the code and set a password, activate the account automatically without Librarian approval. Uploading itself sends no codes and does not generate accounts or passwords.
- Preserve the existing password plus email code sign-in. A correct password triggers the code automatically to the account's verified school email. An enrolled student without an account uses Register first.
- A missing enrollment match blocks new Student registration and, once borrowing checks are enabled, new requests and checkouts. An unmatched roster row alone does not deactivate an existing account during the semester.
- When a semester ends, automatically deactivate active Student accounts linked to that semester and revoke their sessions. Keep their records in a dedicated **Semester Archive**. Faculty, Staff and Admin/Librarian accounts remain active according to their existing status.
- A returning student whose account was deactivated at semester end can restore the same account by signing in with their password and school email code. The next active roster must match their Student ID and linked school email. An unrelated restriction continues to block restoration.
- Keep Faculty and personnel outside the Student roster rule. Do not change their existing approval or sign-in methods.
- Only the Admin/Librarian can start or manually end a semester. The semester ends automatically on its configured schedule. Official dates are not yet confirmed; the Admin must supply them before starting the semester.

## How

### 1. Add a Student enrollment section under User Management

**Users > Student enrollment > Choose semester > Upload roster.**

1. Let the Admin choose the academic year and semester, enter the source date and select complete or partial roster. Accept **CSV (.csv)** or **Excel (.xlsx)** through the same upload control. The Admin can upload the Excel file directly without converting it.
2. Automatically validate Student ID, name, program, level and Campus Email Address. Show how many students were imported and identify rows with errors. Reject an unsafe import without replacing the current roster. A listed student with a valid ID and no usable school email still counts as enrolled; new registration needs a corrected school address before a code can be sent.
3. Apply a successful upload immediately to the selected semester. Match existing accounts by Student ID and show them as enrolled without another Admin action. For a draft semester, the roster becomes usable for registration when the Admin starts the semester. A partial list must not imply that omitted students are not enrolled. Prevent duplicate or stale imports from replacing current evidence.
4. Store each imported version privately with uploader, source date and upload time. Restrict access to the Admin/Librarian. Keep actual rosters, email addresses and test identifiers out of source control, general logs and public responses.

Likely files: `apps/web/src/features/users/AdminUsersPage.tsx`, `apps/web/src/App.tsx`, `apps/api/src/modules/enrollment/enrollment-parser.ts`, `enrollment.service.ts`, `enrollment.routes.ts` and `apps/api/src/app.js`. Review the existing draft migration against the current Postgres ledger before any schema work; do not run it from this plan.

### 2. Let the Admin start and end the semester

**Users > Student enrollment > Semesters.**

| Status | Action available to Admin/Librarian |
| --- | --- |
| **Draft** | Use **+ Add Semester** to prepare the next term. Set the scheduled end date and earliest manual end, then successfully upload the complete roster before selecting **Start Semester**. |
| **Active** | The schedule is read-only. **End Semester** stays disabled until the earliest manual end time. After it unlocks, show how many Student accounts will deactivate before confirming. |
| **Ended** | Open **Semester Archive** to view the term, roster and saved records. There is no routine restart or delete action. Start the next term as a separate semester. |

**Set before starting:**

- **Scheduled end date:** The semester stays active through the selected day in Philippine time. It ends automatically at midnight starting the following day.
- **Earliest manual end:** The earliest Philippine date and time when the Admin can use **End Semester**. It must be after the actual start and on or before the scheduled cutoff. Set it to the cutoff if the semester should never end early.

Before **Start Semester**, show both times for review and explain that they lock after start. During the protected period, show **Can be ended from [date and time]** next to the disabled button. The server must reject any early or unauthorized request, even if sent directly. Use the server's time for the cutoff so the scheduled end applies even if no one opens the page or a background job is unavailable. Keep one audit record per end, identifying whether it was manual or scheduled and the effective end time.

Allow only one active semester at a time. The previous semester must be ended before the next can start. Record who started each term, who manually ended it when applicable, and the effective times in Philippine time. Uploading a roster does not start the semester automatically.

### 3. Deactivate Student accounts and save the Semester Archive

**Users > Student Enrollment > Semester Archive > Select school year and semester.**

1. Link existing Student accounts to the term by matching their IDs to the active roster, and link new Student accounts when they activate. Keep that term association even if a later roster correction removes an entry, so closing the semester does not miss accounts that belonged to it.
2. At either the scheduled cutoff or a valid manual end, automatically deactivate every active Student account linked to that term. Record **Semester ended** as the reason and invalidate its sessions and outstanding sign-in codes. Accounts already deactivated for another reason keep that reason. Do not change Faculty, Staff or Admin/Librarian status.
3. Close new registrations and unfinished activations tied to the term. Ended Student accounts cannot sign in or start new requests and checkouts. Authorized library personnel can still process returns and settle fines against the same account records. Do not auto-return loans, clear balances, change due dates or delete history.
4. Give the Admin/Librarian a searchable, read-only archive grouped by semester. Show the roster, effective end time, affected students and account status at closure, with links to their existing loans, returns, fines and attendance history. Keep original Student IDs and records; the archive does not create duplicate accounts or transactions.
5. Apply the cutoff on the server so access stops on time. Plan scheduled processing for the saved deactivations and archive entries, plus a safe catch-up path if the job was unavailable. Retrying the same semester closure must not duplicate archive entries or deactivate anyone twice.
6. Restore the same account and history only after the returning student's password and email code pass. Match the roster and school email for the active semester and require evidence that semester closure caused deactivation. A new roster upload cannot restore access by itself.

### 4. Base new Student registration on the uploaded roster

**Register > Enter Student ID > Verify school email > Set password > Account ready.**

1. Match the Student ID on the server to a row in the active semester's uploaded roster. The match confirms enrollment automatically. Check for an existing account or unfinished registration and prevent duplicates. If the record is missing, conflicting or has no usable school email, direct the student to the library or registrar. Do not offer a free-text email override or reveal someone else's details.
2. Send a six-digit code automatically to the roster email when an eligible student submits registration. Give the same public response for unlisted and listed IDs to keep enrollment private. Keep the registration challenge bound to the student ID, selected term, roster row and destination.
3. After successful verification, allow the student to set a password. In the same operation that creates the account, recheck the active semester, enrolled roster row, verified email and existing account status. Create one active Student account and show **Account ready**. Do not put it in the Librarian approval queue. If the semester or matched identity changed while registration was in progress, require fresh verification.
4. Keep password and verification data private. Reuse current expiry, resend limits, wrong-code limits and one-use verification. Show a retry message if delivery fails, without treating the email as verified.
5. Keep legacy pending requests and their history. A student with a previously pending request can finish through the new flow after fresh verification against the active roster. Never activate accounts in bulk during import or use a roster match to bypass an existing deactivation or restriction.

Likely files: `apps/api/src/modules/enrollment/enrollment-policy.ts`, `apps/api/src/modules/auth/registration.service.ts` and `apps/web/src/features/auth/RegistrationPage.tsx`. Reuse the existing email sender. Keep the approval screen for workflows that still require it. Use a registration challenge; the existing login challenge is for an account that already exists.

### 5. Reuse school email verification during sign-in

**Sign in > Student ID and password > Verify school email > Dashboard.**

1. Send a code only after the password passes. Use the verified address already tied to the account. For a roster-based registration, that address is the confirmed registrar address. Do not send to an email typed on the login form.
2. Flag a roster/account email mismatch in Librarian review. Never silently switch an existing account's email or send a login code to a newly imported address. Resolve identity corrections through the approved account review process.
3. An unfinished registration cannot sign in. A semester-deactivated account can sign in again only through the returning-student flow. A missing roster match alone does not deactivate an existing account during an active semester. Show borrowing eligibility separately when enrollment enforcement is enabled.

Likely files to check: `apps/api/src/modules/auth/login-security.service.ts`, `apps/web/src/features/auth/LoginPage.tsx` and the enrollment review screen. Reuse the existing sign-in flow unless an integration gap is demonstrated.

### 6. Verify before activation

- [ ] Upload equivalent CSV and Excel test rosters with leading-zero IDs. Both must identify the same students and mark matching accounts enrolled immediately without approval. Check missing emails, duplicate identities, a partial list and a wrong term. Confirm no accounts or mail are created by import.
- [ ] Confirm only the Admin/Librarian can start or end a semester. Reject a second active semester, a start without a successfully uploaded complete roster and a restart of an ended semester. Record who confirmed each action.
- [ ] Reject an earliest manual end after the scheduled cutoff or on/before the actual start. After start, prevent date edits and block early manual end in both the screen and the API.
- [ ] Check the moment before and at the manual unlock time, and the scheduled midnight cutoff. Confirm automatic end works without a background job and produces only one audit record.
- [ ] End test semesters manually and by schedule. Verify that only their active Student accounts deactivate, existing sessions stop working, and retries do not duplicate entries in **Semester Archive**.
- [ ] Open an ended semester's archive. Confirm it shows the correct students, roster, end time and record links. Verify that authorized staff can still process a return or fine payment and that the original loan and deadline stay intact.
- [ ] Register an enrolled test student. The code goes only to the roster address; verification plus setting a password activates one account without a Librarian approval task.
- [ ] Check invalid or unlisted IDs, missing/conflicting emails, duplicate submissions and roster changes before activation. Keep private roster details out of public responses. Confirm that a roster match cannot reactivate a blocked account.
- [ ] Test correct/incorrect passwords, code expiry, retries, resend limits and duplicate verification. Confirm no access before successful verification and no code sent after an incorrect password.
- [ ] During an active semester, confirm unresolved enrollment by itself does not block sign-in; it blocks new borrowing when that policy is enabled. Verify that semester closure deactivates the accounts linked to that term.
- [ ] Verify that Faculty, Staff and Librarian access still works. Verify actual code delivery to an approved test school inbox before enabling Student registration enforcement on Vercel.
- [ ] Check that a successful upload becomes usable when its semester starts. To correct the active roster, upload a newer corrected complete file or partial update. Previous versions stay private for audit.

## Rollout

Apply only reviewed migration `031_semester_enrollment.sql` to the intended Postgres environment. Then set `ENROLLMENT_ROSTER_ENABLED=true` for its API, verify delivery to an approved test mailbox, and verify the operational job runner. While the job is unavailable, the server enforces the scheduled cutoff and the next enrollment overview or job run saves the archive. The Admin supplies the official dates, uploads the roster and starts the first semester.

## Local verification

- API and web test suites, enrollment and signup screen tests, type checks and production build passed.
- The disposable Postgres test applied 031 in its own schema. It verified CSV and Excel imports, private table grants, permissions, cutoff enforcement, archive preservation, one-use registration and same-account restoration. It also verified that a prior restriction and a code bound to the wrong semester block restoration. The test removed its schema on exit.
- Email was captured by a test sender. Live school email delivery, the hosted scheduler and an in-person return or payment after closure remain rollout checks. No school roster, product database records or production deployment were changed.

## Change log

- **2026-11-09:** Planned roster-based Student registration and school email verification under User Management. No code, data import, migration, email or deployment changes were made.
- **2026-11-09:** Added Admin/Librarian controls for preparing, starting and ending semesters, with one active term at a time and read-only history for ended terms.
- **2026-11-09:** Added the scheduled end date, the earliest manual end time, and the rule that both settings lock once the semester starts.
- **2026-11-09:** Removed individual approval for Student registrations verified against the active approved roster. Students activate their accounts after proving access to the roster email and setting a password.
- **2026-11-09:** Removed separate roster review and approval. A successful registrar CSV upload establishes enrollment by Student ID for the selected semester. Email codes verify mailbox access only.
- **2026-11-09:** Confirmed that both CSV (.csv) and Excel (.xlsx) use the same roster upload and enrollment rules.
- **2026-11-09:** Added automatic deactivation and session revocation for active Student accounts when their semester ends, plus a dedicated Semester Archive that preserves account and transaction history.
- **2026-11-09:** Owner confirmed same-account restoration after password and school email verification for returning students. Implemented roster signup, semester controls and the archive behind an opt-in setting. Migration 031 is prepared for review. The live roster and deployment are pending.
