# User notification gaps

Branch: `feat/notification-gaps` · Date: 2026-11-19 · Migration: none · Spec and plans: [../.planning/phases/02-user-notification-gaps/](../.planning/phases/02-user-notification-gaps/02-SPEC.md)

Branched from `docs/notification-gaps-spec` (spec, context and plans), which is 3 commits ahead of `main`.

> **Status: not tested by hand yet.** Automated tests pass, but the two manual checks below have not been run, and nothing has been tried in a browser or against a real database. Treat this as a draft until they pass.

## Problems

| Event | What happened |
| --- | --- |
| Return recorded | The borrower got no notice that the book was checked in, or that a late fine was saved. |
| Clearance override granted or revoked | The student or faculty member was not told their clearance status changed. |
| In-library use started or flagged overdue | Only the librarian got an alert. The borrower was never asked to hand the copy back. |
| Printing paused or resumed | Users with an open print request were not told the service stopped or came back. |
| Borrow confirmed | The notice had no source, link or dedupe key, unlike every other notice. |

## Fix

**Shared helper** (`apps/api/src/modules/notifications/user-notices.ts`): `insertUserNotice` writes one `notifications` row on the caller's transaction with `ON CONFLICT (user_id, dedupe_key) DO NOTHING`. `rolePath` builds the role's link (`/student/...`, `/faculty/...`, `/staff/...`); unknown roles get no link. `manilaTime` formats times in Asia/Manila.

**Notices** (each written in the same transaction as its action; a failed notice rolls the action back, per spec R9):

| Notice | Where | Who | Dedupe key |
| --- | --- | --- | --- |
| Book returned | `returnBook` (desk and circulation returns share it) | Borrower | `loan:<id>:returned` |
| Borrow confirmed | checkout in `circulation.service.ts` | Borrower | `loan:<id>:borrowed` |
| Clearance updated | `applyOverride` / `revokeOverride` in `clearance.service.ts` | Student or faculty | `clearance-override:<id>:granted` / `:revoked` |
| In-library use started | `startInLibraryUse` in `desk-circulation.service.ts` | Borrower | `in-library-use:<id>:started` |
| Please return the book to the desk | overdue sweep `flagUnreturnedInLibrary` | Borrower | `in-library-use:<id>:overdue` |
| Printing paused / Printing resumed | `setServiceStatus` in `printing.service.ts` | Every user with an open print request | `print-service:<uuid>:<state>` |

Details:
- **Book returned** names the title and time, the saved late fine (left out when Paid, Waived, Voided or 0.00), and the recorded condition when the desk recorded one other than Good.
- **Clearance updated** states the new status only. The override reason, the librarian's name and the user's name never reach the notice. A revoke recomputes the status inside the transaction and adds "Contact the library for details."
- **Overdue sweep** only notifies uses it actually moves to Review, so a second sweep sends nothing. If a use has no matching title, the notice says "The item you used" instead of stopping the sweep.
- **Printing** reads the setting `FOR UPDATE` and notifies only when the accepting flag really changes. Saving the same state twice sends nothing.
- `clearance.compute` now takes an optional connection; on a transaction it runs its reads one at a time instead of in parallel.

## Verification

- API: 552 of 552 tests pass. Web: 373 of 373 tests pass. Typecheck and build are clean.
- The return, printing and overdue sweep notices run on real Postgres in tests (PGlite). Clearance and in-library start use a faked connection.
- Phase-goal check: 37 of 38 must-haves verified, no gaps (`02-VERIFICATION.md`).
- Review: one combined security review found nothing critical or high. The medium finding (one in-library use with no title made every overdue sweep fail) is fixed with a test. The three low findings needed no change.

## Not tested yet

Saved in [`02-UAT.md`](../.planning/phases/02-user-notification-gaps/02-UAT.md); run them with `/gsd-verify-work 2`.

1. **Concurrent printing saves.** On a real (non-production) Postgres, with a user holding an open print request, two librarians save the same "paused" state at the same moment. Expected: one "Printing paused" notice per user, not two. The tests only check that the lock query runs first; they cannot race two saves.
2. **Overdue wording.** Read the overdue notice and confirm it threatens no fine, penalty, suspension or block.

Also not checked: the notices in the web app's notification list, and any run against the live database.

## Known limits

- Deferred (see `02-SPEC.md`): account status, semester end and invoice notices.
- Printing notices are written one by one while the settings row is locked; fine at current queue sizes.
