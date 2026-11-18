# Late student enrollment implementation plan

| Field | Value |
| --- | --- |
| Date created | 2026-11-18 |
| Date last updated | 2026-11-18 |
| Status | `inprogress` |
| Entry point | Library users → Student enrollment → Add late students |

## Why

When the registrar confirms a student after the first school roster has been uploaded, the Librarian needs to add that student to the active semester without preparing a replacement list. The same screen should handle a single student and a registrar list of several late students.

Student enrollment already supports CSV and Excel uploads. The current form starts with **Complete school roster**, which replaces the effective list. **Partial update** updates only the IDs in the file, including students already on the list. Give late enrollment a dedicated action that can only add new entries.

## How the Librarian uses it

1. Open **Library users → Student enrollment**. Select the active semester by default when opening this page. Keep explicit semester choices while the user works. Show **Add late students** on the active semester with its school year, term and end date visible.
2. Choose **Enter one student** or **Upload a list**. For one student, enter their official Student ID, first and last names, program or strand, year or grade level, and Ormoc school email if available. Use the date the registrar confirmed enrollment. For several students, choose the registrar CSV or Excel file and enter the list's source date. Reuse automatic column recognition, the filename and size display, and the readable preview with row numbers.
3. Select **Review additions**. Show the selected semester, how many will be added, how many are already on the roster, and any rows needing correction. Explain what the student can do after saving. If the file lacks a semester column, the visible semester and the Librarian's confirmation establish the intended term. If it provides a different term, show where to fix it. Let the Librarian edit the form or replace the selected file from this step.
4. Select **Add to semester roster**. Show what was actually added and refresh **Roster students**. Keep the form or file available when saving fails. After success, show the outcome and offer **Add another student**. Identify which students still need an Ormoc school email in the review and result.

| What the review finds | What happens |
| --- | --- |
| New Student ID with a valid Ormoc school email | Add the student. A first-time student uses **Activate account** and verifies the registrar-listed school email before setting a password. |
| New Student ID with no usable Ormoc school email | Show **School email needed for account setup**. Registrar evidence still establishes enrollment by Student ID. First-time activation and semester restoration need a verified matching Ormoc address. |
| Same Student ID and same normalized roster details | Show **Already on this semester roster** and skip the row. When every row matches, show that result without saving another batch. |
| Same Student ID with different roster details, duplicate Student IDs in the file, conflicting identity, or school email assigned to another person | Show the affected rows and block the save until corrected. Use the existing authorized roster or account correction workflow for changes to an existing record. |
| Existing active Student account with confirmed identity | Apply enrollment to the existing account and link it to the semester. Regular sign-in and borrowing checks still apply. |
| Existing Student account deactivated by a previous semester | The student signs in with the existing password and verifies the matching school email. The current restoration rules decide whether to restore that account and its history. |
| Account archived or restricted for another reason | The existing restriction continues to govern access. Follow the current account review process if an authorized change is needed. |
| Term still in preparation or already ended | For a draft term, use its ordinary roster upload before starting it. For an ended term, show its records in **Semester Archive**. |

Roster enrollment, account access and library clearance remain separate decisions. A save records registrar-confirmed enrollment. It sends no codes, creates no accounts, and does not change account status, clearance, fines, loans, or history. Borrowing still requires the existing account and borrowing checks.

## Proposed policy for approval

- Accept registrar-confirmed additions through the active library semester's existing cutoff. Use the server clock and the existing Philippine-time schedule. A valid manual end also closes the action. This plan proposes no separate late enrollment window.
- Use the existing **Admin/Librarian** account-management permission for review and save. A librarian can record registrar confirmation for one student without generating a spreadsheet. Store the source date and actor, and ask for the confirmation at save. Avoid collecting evidence attachments or free-text notes.
- Keep the registrar's next **Complete school roster** authoritative under the current rules. On the active semester's complete upload, call out if it would omit previously added late students and require explicit confirmation before replacing the effective list. Show which Student IDs would be omitted in the private review. If the registrar later confirms an omitted student's enrollment again, allow a new late addition against the current roster.

## Implementation tracking

### 1. Data contract and validation

- [x] Add failing validation and Postgres integration tests. Represent one form submission and one imported list as additions to the existing semester roster. Reuse the same normalization, lengths, school email rules and term checks from `apps/api/src/modules/enrollment/enrollment-parser.ts`. Keep IDs as text, preserve leading zeroes, and validate both routes on the server.
- [x] Add a typed `source_kind` field to `enrollment_roster_imports` with values for regular roster upload, late form and late file. Default existing and old-client writes to regular upload. Store manual entries with a fixed internal label in the existing required filename field and display them as **Entered by the library**. Reuse the existing uploader, date and timestamp fields. Keep the enrollment tables private and their row-level security in place.
- [x] Create the migration only during implementation. The last recorded applied migration is `040_library_hours_8am_5pm.sql`, `039` is reserved, and `041` is the next available number at planning time. Confirm the number then and update the migration tracker and schema context in the same change. Preserve the applied `031_semester_enrollment.sql` and existing rows.

### 2. Review and save in the enrollment API

- [x] Extend `apps/api/src/modules/enrollment/enrollment.routes.ts` and `enrollment.service.ts` with authorized review and save actions under `/semesters/:id/late-enrollment`. Reuse the existing size limit, temporary file handling and private response controls. The dedicated action always writes `complete=false`. Reject any request that tries to change the roster type or term.
- [x] Compare submitted rows with `currentRosterSql` in `enrollment-policy.ts` and with existing account identities. In addition to effective roster checks, reject an ID assigned to a different account role or a school email tied to someone else's account. Flag a mismatch between a submitted school email and the account tied to the same ID for existing account review. Return useful per-row issues to the authorized actor. Keep roster details out of public responses and logs.
- [x] Use the existing enrollment lifecycle write lock and one transaction. Verify the selected semester is active and its cutoff has not passed after acquiring the lock. Revalidate the reviewed input and current roster before saving. Insert the batch, only the new students, and matching active Student memberships together. Use the existing membership logic so closure includes late enrollees and retains past history.
- [x] Save only the reviewed changes. If the input or roster changed since review, show the updated outcome and ask the Librarian to review again. A replay that adds no new rows returns **Already on this semester roster** with no new batch. Concurrent or conflicting submissions must never overwrite another entry. Include the applicable complete-roster version in the identity of a late addition so a valid reconfirmation after a newer complete roster can be saved.
- [x] Reject future source dates using Philippine time. Require late evidence dated on or after the effective complete roster's source date. Keep the regular upload's date ordering relative to previous regular uploads, so a newer one-student confirmation date cannot block a valid registrar replacement. Detect and recheck any late-student omissions before an active-term complete replacement is saved.
- [x] Keep `roster-registration.service.ts`, account sign-in and borrowing policy on their normal entry points. The existing roster lookup includes additions immediately after commit. Change those callers only if integration tests identify a gap.

### 3. Add the form, file review and result screen

- [x] In `apps/web/src/features/users/EnrollmentPage.tsx` add **Add late students** under the current semester controls. Use existing forms, buttons and review components, including `SelectedFilePreview`, `RosterPreviewTable` and the unsaved-changes guard. Keep the existing **Student enrollment** entry point in `AdminUsersPage.tsx`. Use the current STI component styles.
- [x] In `apps/web/src/features/users/enrollment-api.ts` add typed review and save calls and display source provenance in the existing latest roster summary. Make the full replacement warning part of the existing complete upload review.
- [x] Add Testing Library coverage in `apps/web/src/features/users/EnrollmentPage.test.tsx` for the active semester default, both entry modes, review, meaningful error text, successful roster refresh and keyboard operation. Verify busy controls prevent duplicate submits and focus goes to the error or result. Check narrow and wide screens and both themes in the running app.

### 4. Verify normal use before release

- [x] Extend `apps/api/scripts/verify-semester-enrollment.ts` using a disposable local or test Postgres database with synthetic data. Verify that one student and equivalent CSV and Excel lists preserve existing roster rows, mark only newcomers as additions, and produce accurate totals. Cover an all-duplicate retry, mixed new and duplicate rows, invalid or wrong-term files, school email collisions, stale review, unauthorized review and save, overlapping submissions, manual end and the scheduled cutoff with the background job unavailable. Verify failure leaves both roster and membership records intact.
- [x] Activate a first-time late student through the existing email-code flow using a test mail sender. Restore a returning student on the same account. Verify an unrelated deactivation or archive remains effective. Confirm a missing campus email still records enrollment without permitting first-time activation or restoration. Verify ordinary borrowing restrictions and clearance still apply. During term closure, confirm active late students appear in **Semester Archive** with their original account and transaction history.
- [x] Upload a complete roster with and without a previously added student. Verify the preview, required confirmation when someone would be omitted, the resulting effective roster, retained historical evidence and a registrar-confirmed addition after replacement. Confirm ordinary draft uploads and roster corrections still work.
- [x] Run `npm test`, `npm run typecheck`, `npm run build` and `npm run coverage`. Start the app with `npm run dev` for browser review. Record evidence in this plan and review the diff for security, correctness, React and migration behavior before any PR. Live migration and deployment require Ethan's separate approval.

## References

- [Final Draft](../source/Final-Draft.pdf#page=19), PDF pages 10, 19 and 22–23. It specifies a standalone system, verified user accounts, Librarian uploads and preserved account history.
- [Administrative System Flow](../source/Admin-System-Flow.pdf#page=1), User Management branch. It covers the staff-facing user directory, account state and clearance actions.
- [Built student roster plan](2026-11-09-student-roster-registration-and-login.md), [schema context](../schema-context.md#student-enrollment-and-semester-archive--applied-2026-11-09) and [migration tracker](../../.cursor/agent-protocol.md#current-tracker-update-whenever-a-migration-is-added) describe the current semester, roster and account behavior.

## Change log

- **2026-11-18** — Drafted an active-semester workflow for individual and batch late student additions, including registrar confirmation, review, account safeguards and implementation checks.

- **2026-11-18** — Ethan approved implementation. Building on feat/late-student-enrollment with API and UI work coordinated under the repository builder workflow.


## Verification evidence

- API suite passed 518 tests and web suite passed 388 tests in 91 files. Coverage completed successfully. Tests used ENROLLMENT_ROSTER_ENABLED=false for older enrollment-independent fixtures. Feature integration enabled enrollment explicitly.
- Type checks and production build passed. Vite retains its large-chunk advisory.
- The extended semester verification script passed against local in-memory PGlite with synthetic records and a captured email sender. It covered both input modes, CSV and Excel, conflicts, stale review, replay, replacement confirmation, account activation/restoration, cutoff, manual closure and archive history. Overlapping calls were serialized by PGlite. Native multi-connection lock contention remains unverified.
- The local browser rendered the active semester and late enrollment form using synthetic API responses. Full hosted authenticated interaction and narrow-screen/dark-theme visual checks remain pending.
- Combined security, correctness, React and database source review found no remaining actionable defects. The unavailable wiki vault prevented the session memory transaction.
