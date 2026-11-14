# Attendance scan with user confirmation

Why: the entrance operator scans the QR, but the visitor chooses their purpose and confirms on their own signed-in account.
Date created: 2026-11-15
Date last updated: 2026-11-15
Status: built

## Approved flow

Admin opens Scan attendance. A camera, USB scanner or pasted QR verifies the visitor
and creates a short-lived request. It records no visit yet. The matching signed-in
user sees a prompt on any portal page, selects Library Visit, Study, Research, Borrow
books, Printing or Photocopy, then confirms entry. A later scan captures the current
open visit and sends Confirm exit instead. Entry and exit cannot toggle accidentally
when a request is retried or another device changes the visit.

## Implementation

- API-only pending scan table, owner/actor checks, expiry, one pending request per
  visitor, stable request keys and explicit confirmation/cancellation.
- Store no raw QR payload or QR secret. Bind the scan proof to its validated
  credential fingerprint; recheck credential/account status at confirmation.
- Reuse the existing transactional attendance recorder, hours/events, capacity,
  cooldown, scan receipts, notifications and Manila timestamps.
- Admin waits for user confirmation. User prompt preserves selected purpose across
  polling/tab changes, prevents double confirmation and refreshes related views.
- Native accessible responsive dialogs; no new frontend dependencies.

## Tracking

- [x] API service, migration and security/transaction tests.
- [x] Scanner handoff and owner prompt with UI regression tests.
- [x] Tests, coverage, typecheck, build and local synchronization.

Migration 045 adds the private request table and was applied individually after
the owner's explicit approval. Latest applied is 045; next unused number 046.
The local app uses this shared school database. The owner subsequently approved
Vercel deployment, completed below. GitHub publication is not part of this step.

## Change log

- 2026-11-15: owner clarified that Admin scans and the matching user confirms on their own account, rather than using an open kiosk.
- 2026-11-15: 723 API and 467 web tests passed (1,190 total), plus typecheck/build. Coverage completed: API line coverage 75.20%; web lines 68.8%, statements 61.32%; project-wide coverage remains below 80%. Added actual Postgres tests for owner isolation, no pre-confirmation visit, duplicate/retry aliases, purpose, cancellation/expiry, closed hours/capacity, revoked credential/scanner authority and stale exit identity. Migration security tests confirm anon/authenticated are refused and the owner reads. Browser check in Brave used the real components and real disposable PGlite service: purpose selection, user confirmation, success and occupancy 0→1 worked at narrow window width. No school attendance was changed. Follow-up layout polish keeps the dialog heading visible and resets scroll on successful confirmation. Revalidate those affected UI checks before final synchronization.
- 2026-11-15: synchronized the scoped source patch into `StiOrmocLibrary-main-sync`, preserving existing unrelated edits. Three locally divergent tracker documents were appended with the new draft status instead of being overwritten. Local typecheck and six new backend checks passed. Final layout/error-retention changes passed typecheck and affected web checks (15 checks across owner/scanner/attendance/portal views); confirmation errors survive polling and purpose selection is retained. Implementation is complete; activation against the shared database awaits explicit migration-045 approval. No live migration, GitHub push or Vercel deployment was performed in this feature task. The browser test used a separate disposable database, not school attendance.

## Activation and review

1. Review `045_attendance_user_confirmation.sql` and its owner/browser-role test.
2. Obtain approval to apply it to the shared school database used by localhost.
3. Apply only that file using the existing migration runner, with target, table owner,
   RLS/grants, checksum and existing-row preservation verification.
4. In two signed-in accounts, Admin scans the visitor QR. Confirm that the visitor
   chooses purpose, then confirms entry; a later scan asks Confirm exit. Do not
   submit a real visit as an automated QA shortcut.
5. GitHub publication and Vercel deployment require the owner's instruction.

## Approved database activation — 2026-11-15

Owner approved applying migration 045 to the existing database. The connected
project matched the app configuration and the known 044 ledger checksum. API role
owns all referenced tables. The existing single-file runner applied only 045 in
one transaction, including its migration ledger entry. SHA-256:
`d862f7b1cb81b66dccfe665b57d0f84396319516dec40ef0ad5420ce83cbf6d3`.

Verified new table ownership, RLS and denied anon/authenticated table privileges.
Before/after row counts and complete-row fingerprints match for accounts, users,
attendance logs and QR credentials. No attendance request or visit was submitted.
Read-only service check returns enabled=true with no pending request. Local API
health and web login return 200; unauthenticated pending requests return 401.
Local integration server is running at http://localhost:5173. No GitHub push or
Vercel deployment was performed. Real two-account/physical QR acceptance remains
for the owner; entry/exit behavior passed disposable SQL and UI checks above.

## Approved Vercel deployment — 2026-11-15 (Asia/Manila)

Owner requested hosting after seeing the earlier scanner on Vercel. Deployed an
archive of committed source `67e1079` only; private environment files, local
payment history, uploads and ignored outputs were excluded. Production build
passed. Candidate health, public catalog, login and attendance page returned 200;
unauthenticated owner/scanner attendance and payment APIs returned 401. Verified
the deployed entry bundle contains the user confirmation API and Confirm exit UI.

Promoted `dpl_B8bEQwgDAvexwAVrZ2pLxHvy8RJK` to
https://sti-ormoc-smart-library.vercel.app and checked the project production
target, public health/catalog/login, protected APIs and exact new bundle again.
Previous deployment `dpl_3wcXiyojseQ8RAgFyxyED3zXJBpe` remains available for rollback.
No database migration, account/visit write or GitHub push was performed during
deployment. Physical two-account QR acceptance remains unverified on production;
no school visit was submitted as automated QA. Users should reload both signed-in
tabs to replace the old scanner and mount the new visitor prompt.
