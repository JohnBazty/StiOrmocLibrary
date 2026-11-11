# Revision Phase 1 quality assurance — 2026-10-16

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` (QA round completed; P1-01 and P1-02 repaired; manual acceptance limits remain) |

## Why

The owner requested Phase 1 testing after the combined Librarian/Admin account was established. Check current behavior against the approved revision requirements and the 2026-10-12 account consolidation.

## How

Run focused authentication, permissions, account ownership and recovery tests; exercise the real configured Postgres connection using disposable records and a captured email sender; inspect public/personnel login, redirects, recovery and error states in the visible local browser. Use existing account identities only for read-only authorization checks. Never change existing passwords or deliver test emails to real inboxes.

Product migrations remain Postgres 026 / next 027 and MySQL reference 048 / next 049. No migration, push or deployment is part of this QA run.

## Implementation tracking

- [x] Read approved Phase 1 requirements and account consolidation amendment.
- [x] Run focused API and web tests.
- [x] Run real database recovery and role-boundary checks; remove disposable records.
- [x] Exercise browser login, recovery, redirects and errors.
- [x] Record defects, fixes to testing tools and limitations.

## Findings

## Continued acceptance checklist

- [x] Exercise new registration approval/rejection and profile-picture decisions with disposable records.
- [x] Verify profile ownership, account deactivation/archive history, cookie CSRF and controlled idle expiry.
- [x] Check signed-in navigation for Librarian, Staff, Student and Faculty in the visible browser.
- [x] Check a narrow viewport and dark-theme authentication errors; record device-testing limitations.
- [x] Remove this round's temporary accounts, requests, uploads, history, sessions and credential file.

### Continued QA — P1-02 repaired after discovery

**Repair update:** P1-02 was resolved locally on 2026-10-16 at the owner's request. Successful logout now transactionally revokes the current account/user versions and related cookie sessions, while preserving a newer concurrent login. Copied-token replay returns 401 immediately. Both logout routes and mixed cookie/bearer credentials passed isolated and running-server Postgres acceptance. See [repair evidence](revision-phase1-logout-repair-20261016.md). The following paragraph records the original discovery, before repair.

**P1-02 — originally open, now resolved: logout did not revoke the current bearer access token.** With a disposable Faculty account, `/api/v1/auth/me` returned 200 before logout. A CSRF-protected `POST /api/auth/logout` with that bearer token returned 303. Replaying the same token against `/api/v1/auth/me` still returned 200. Expected: 401 immediately after successful logout. The issued token lifetime was 900 seconds; someone already possessing a copy could continue using it for its remaining lifetime. This did not allow access without a valid token.

At discovery, the web client cleared its stored token on logout and the server destroyed its cookie session, but the controller did not revoke the bearer token's account authentication version. Original reproduction evidence: `output/phase1-logout-results.json` and `output/phase1-logout-check.log` (no tokens/passwords logged). Product repair followed in a separate owner-authorized step.

Completed follow-up: conditional authenticated-version revocation, newer-login safeguard, regression tests, immediate replay denial, fresh login, cookie logout, missing CSRF denial and delayed-logout behavior. **63 selected authentication/consolidation tests passed** (including 29 focused tests), API typecheck passed, and six live acceptance groups passed in both the isolated app and restarted local server. All disposable fixtures were removed. These test scopes overlap earlier runs and must not be added together as a distinct-test total.

### Continued acceptance results

| Check | Outcome / evidence |
| --- | --- |
| Real registration workflow | Student and Faculty verification, pending-approval login denial and Librarian approval passed. Student rejection passed. Staff decisions were denied; repeated decisions were denied; completed/rejected requests no longer retained a password hash. Registration rows and verification codes were seeded only for this disposable workflow; real verification/review handlers created the linked accounts. No real email was sent. |
| Profile ownership | Owner edit passed; school-email change was rejected; Librarian profile editing had no API route; read-only details included the profile-change event. |
| Photo workflow | Invalid image signature and oversized upload rejected. Actual private storage upload, Librarian approve/reject, Staff denial, repeated-decision denial and owner-visible result passed. |
| Deactivation/archive | Deactivation blocked login and the existing token; the account appeared in the inactive directory; its profile events and two photo records remained readable. Reactivation was performed only on the disposable Student for browser testing. |
| Cookie session | Missing CSRF login/logout denied; valid cookie login and account lookup passed. Moving only the fixture session's last-activity timestamp back 31 minutes caused `SESSION_EXPIRED` and removed its session row. This is a controlled expiry check, not a real-time 30-minute wait. |
| Signed-in browser | Normal form login succeeded for temporary Librarian, Staff, Student and Faculty identities. Librarian menus included library and account management; Staff menus remained limited; Student/Faculty showed self-service menus. Direct `/librarian/users` access redirected Staff, Student and Faculty to their own dashboards. Librarian Approvals loaded account registrations and profile-picture sections without an audit-reason input. Student identity showed the updated name, School ID and approved photo in the DOM. |
| Narrow/dark appearance | Personnel login error had a red background, white text and an icon in the narrow dark-theme view. Screenshot: `output/phase1-mobile-dark-login.png`. The viewport tool did not produce the requested 390-pixel width reliably (observed DOM width about 478, screenshot 470); exact device/breakpoint acceptance remains pending. Light theme was restored and the viewport override reset. |
| Evidence and cleanup | Eight acceptance groups passed in `output/phase1-acceptance-api.log` / `output/phase1-acceptance-results.json`. `apps/api/scripts/verify-phase1-acceptance.js` supports default cleanup, `--keep-for-browser` and `--cleanup`. Cleanup removed the run's account/user/request rows, private uploads, related history/sessions/clearance rows and ignored temporary credential file; zero account/user/request rows remained for the unique marker. Log: `output/phase1-acceptance-cleanup.log`. The QA browser tab was closed. |

The continuation used temporary identities only. Existing campus accounts, passwords and library records were not edited by these acceptance checks. The earlier P1-01 repair is a separate, documented change.

### Prior findings

**Repair update:** P1-01 was resolved on 2026-10-16 after the owner requested fixes. Both retained account/profile roles now agree on Librarian, and the real account's library dashboard, Maintenance data and other administration APIs pass. Passwords/history are preserved and older sessions revoked. The original discovery below describes the pre-repair state. See [repair evidence](revision-phase1-role-repair-20261016.md).

- **P1-01 — originally blocking, now resolved:** `ADMIN-PORTAL-001` (account/user 5) at discovery had `accounts.role='Admin'` while its linked `users.user_role='Librarian'` and `users.role_id=2`. Both records are Active; the separate `LIB-TEST-001` remains Archived. There is zero active Librarian in `accounts`. This conflicts with the approved combined login. A short-lived test token using the real stored account role/version passes `/api/v1/auth/me` (200) but receives `JWT_ROLE_FORBIDDEN` (403) from `/api/v1/admin/dashboard` and `/api/v1/admin/maintenance`. The School ID login service also derives its redirect from `accounts.role`, so the recorded role selects `/admin/dashboard`, which has limited account administration. The cause of the role drift is not established by this run; no runtime startup role update was found in the inspected code. Existing account roles/passwords were not repaired or changed during QA. Required follow-up: investigate the writer, restore the previously approved canonical role transactionally with preservation/session-revocation safeguards, then repeat real-account access checks.
- **Test-tool correction, completed:** the earlier integration gate depended on active campus identities of every personnel role, including a separate Admin. Replaced that dependency with uniquely named disposable linked Librarian, Staff and legacy Admin fixtures. Each fixture has a random test password, verifies personnel login/landing and wrong-portal rejection, exercises real API authorization, and is removed in `finally`. Real account consistency is reported separately above; passing fixture checks do not certify the retained campus login. Test identifiers are uppercase to match the application's canonical School ID format.

## Results

| Check | Outcome / evidence |
| --- | --- |
| Authentication, registration, recovery, session versions and account ownership | **63 API tests passed**, zero failures. Tests cover stored-role detection, invalid credentials, deactivated accounts, session replacement, code/token expiry/reuse, failed delivery, unchanged-password rejection and ownership restrictions. Log: `output/phase1-qa-20261016-api.log`. |
| Authentication interfaces and account card | **20 web tests passed** across five files. Includes role-free login, personnel screen, retained registration fields, recovery stages, browsing links and auth response handling. Log: `output/phase1-qa-20261016-web.log`. |
| Real configured Postgres integration | Passed after the test-tool correction. Disposable Student recovery uses real bcrypt/transactions, persisted resend attempts and a simulated clock for the 15-minute lock. Old password/token fails, new password/token succeeds. Librarian account/review APIs allow access; Staff read/mutation access is denied and Printing Queue remains allowed. Notification paths point to the Librarian workspace; recovery RLS is on with no browser-role grants. Log: `output/phase1-qa-20261016-integration-isolated.log`. |
| HTTP throttle and anonymous API access | Separate app instance: ninth login request returns 429 `TOO_MANY_LOGIN_ATTEMPTS`; anonymous Users API returns 401. This does not consume the running server's login throttle. Log: `output/phase1-qa-20261016-http.log`. |
| Visible public login | Empty inputs show required-field messages; nonexistent test credentials produce the generic red/white invalid-login alert. Login has no role chooser or personnel-login link. |
| Visible recovery | Unknown test identifier produces the neutral response; incorrect six-digit code shows the red/white expired/incorrect/used alert. Screenshot: `output/phase1-qa-recovery-error.png`. |
| Visible registration/navigation | Sign Up opens registration with account-type selection, school email and academic fields; contact number stays absent. No registration was submitted. |
| Direct URLs | Anonymous `/librarian/users` redirects to `/staff`; anonymous `/student/dashboard` redirects to `/login`; `/admin/login` redirects to `/staff`. |
| Actual combined campus login | **Originally failed; repaired and rechecked.** Stored account/profile roles now agree; real-account dashboard and Maintenance data APIs return 200. Pre-repair token returns 401. No real password was needed for the database/API checks. |
| Cleanup | Confirmed zero remaining `REV1-%` account/user fixtures after integration runs. Recovery rows cascade with their disposable account. |

## Acceptance limits

**Current result:** P1-01 and P1-02 are resolved locally. The prior role repair's selected suite had **65 API tests passed**, and **20 interface tests passed** earlier. Continued QA added eight successful live acceptance groups and signed-in browser checks. The subsequent logout repair passed its selected 63-test suite, typecheck and live acceptance on the restarted API. Test scopes overlap; live groups are not additional unit tests. No confirmed defect remains open from these two findings; Phase 1 release acceptance still requires the manual checks below.

Real Outlook delivery and a user-completed password reset remain inbox acceptance steps; test senders captured codes without emailing anyone. Signed-in browser checks used disposable accounts, not real users' credentials. New registration/photo approval mutations passed through real API/database/storage paths; their full button-by-button browser flows and confirmation-dialog keyboard behavior remain unverified. Narrow dark-theme errors were checked; a broader physical-device matrix, exact 390-pixel breakpoint checks and a real 30-minute idle wait remain pending. The controlled timestamp test verifies cookie idle expiry; it does not establish a 30-minute idle policy for the bearer-token client, whose current token lifetime is 15 minutes.

## Change log

- 2026-10-16: Started owner-requested Phase 1 QA. Existing web/API servers were stopped and are being started for visible browser checks. Reviewed the recovery fixture before execution: it captures outgoing codes instead of sending mail and removes its test records afterward.
- 2026-10-16: Completed 83 focused automated tests, the real database recovery/permission gate, isolated HTTP checks and visible public-page/direct-URL checks. Recorded a live combined-account role mismatch as blocking; corrected the outdated integration fixture dependency and removed all disposable records. Product code/schema and existing account roles/passwords were unchanged; no push or deployment.
- 2026-10-16: At the owner's request, repaired P1-01 with a private snapshot, retained credentials/history, session revocation and management event. Passed 65 focused API regression tests, typecheck, real workspace checks and the Postgres recovery gate. Added a preflight to catch active account/profile role mismatches before creating QA fixtures. See [repair work record](revision-phase1-role-repair-20261016.md).
- 2026-10-16: Continued owner-requested QA with a reusable acceptance fixture script, eight successful live workflow groups, four signed-in browser roles, direct-URL restrictions and narrow dark-theme error inspection. Reproduced P1-02 bearer-token replay after logout and left it open for repair. Removed only this run's disposable records/uploads and temporary credential file, restored browser appearance, and closed the QA tab. No product code, migration, push or deployment in this continuation.
- 2026-10-16: At the owner's request, fixed P1-02 using transactional conditional version revocation, bearer precedence and consistent login/logout lock order. Passed focused/broader regression, typecheck and real Postgres acceptance against both an isolated app and restarted local API; removed test fixtures. Updated schema behavior documentation without a schema migration. Manual acceptance limits remain.
