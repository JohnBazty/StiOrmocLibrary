# Remember this device implementation plan

| Field | Value |
| --- | --- |
| Date created | 2026-11-10 |
| Date last updated | 2026-11-10 |
| Status | `inprogress` |

## Why

The web portal currently signs users out after 10 minutes without activity. A Student or Faculty member using a personal phone or computer should be able to take a break or close their browser and return to the library without entering their password and school email code again during the remembered period.

## Proposed behavior

- Add an unchecked **Remember this device for 7 days** box to the Student and Faculty sign-in form. Include the note **Use this only on your personal phone or computer.** Use the same option in the catalog sign-in popup and on the full login page.
- Start the seven-day period only after the password and school email code have both been accepted. Remember the specific browser profile. Another browser, a private window, or cleared browser data requires the regular sign-in flow.
- Resume the portal automatically on return to the site or after a break, including when the tab was left open. If the user was following a link to a book or workspace page, continue there once access is confirmed.
- Require a full sign-in after seven days from the original verified sign-in. Activity and reopening the app do not extend that date. An ordinary sign-in without the box uses the current 10-minute inactivity rule.
- Keep the remember option limited to Student and Faculty accounts for the first release. Admin, Librarian and Staff retain their current credential checks and inactivity timeout. The one-device rule applies to all web account roles.
- Allow one active browser profile per account. A valid remembered sign-in counts even while the browser is closed or idle. Tabs using the same browser session count as one device.
- If a second device completes the usual sign-in checks while the first device still has access, show **This account is signed in on another device.** The user can cancel or explicitly choose **Switch to this device**. Switching ends the first device's active and remembered access before granting access to the second. If the first device has signed out or its access has expired, sign-in proceeds normally.
- **Sign out** ends access and forgets that browser immediately once the server confirms it. Password reset or change, account restrictions, and Student semester closure also end remembered access. Returning Students restore their account through the existing password and email-code flow.

## Refresh verification before Phase 1

- [x] Trace Refresh and Reload records controls on active routes and verify their clicks issue fresh requests. The `RefreshControls.test.tsx` sweep covers 35 page and panel combinations using simulated server failures. Separate tests exercise successful refreshes and pickup confirmation guards.
- [x] Refresh the notification schedule with the inbox, reload the catalog filter options, update the displayed attendance capacity and term list, and use the current Manila date for Staff Attendance. Manual refresh can report a connection failure while automatic polling stays paused offline.
- [x] Check that catalog filters survive refresh and that refreshing a pickup does not start a loan. The audit uses test responses in a local test environment.

## Phase 1. Add a secure way to remember the browser

- [x] Add a private, additive Postgres grant record with account, authentication version, fixed expiry and revocation state. Migration **032** extends the existing session rows and preserves the MySQL reference tree.
- [x] Bind the checkbox choice to the login challenge. Issue the grant transactionally after email verification for Student and Faculty accounts.
- [x] Issue an opaque first-party `HttpOnly` cookie with SameSite protection and HTTPS in production. Store only its hash. Require same-origin requests and a custom header for browser cookie operations. Rate limit those requests and send `no-store`. [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet)
- [x] Resume under the account lock after checking account version, linked profile, role, and Student semester eligibility. Cap access at the grant deadline and enforce it on protected requests.
- [x] Require a one-use confirmation after successful authentication when a different browser occupies the slot. Recheck the slot under lock and revoke the old session in the transaction that creates its replacement.
- [x] Reuse the authentication-version checks for password, status and semester changes. Sign out with the browser cookie even when the access token has expired. Clear only the session's own cookie.

## Phase 2. Add the sign-in and return experience

- [x] Show and submit the unchecked option on the Student and Faculty sign-in form with personal-device guidance.
- [x] Show the confirmation in both public and personnel sign-in. Cancel keeps the existing browser signed in.
- [x] Check for an eligible device before redirecting from a protected page. Keep the route, catalog selection and role restrictions.
- [x] Resume on return to a remembered browser. Resume through focus, visibility or user activity, and keep the grant through temporary disconnections. Background polling cannot keep the session active.
- [x] Show the expiration message and a separate connection failure state. Confirm device sign-out with the server.

## Phase 3. Verify and release

The feature is live on Vercel. Migration 032 was applied after disposable-schema testing and target verification. Vercel Production enables `LOGIN_DEVICES_ENABLED`. The application setting defaults to off elsewhere.

- [x] Pass the production build, type checks, 414 API tests and 329 web tests. The disposable Postgres run also covered Student and Faculty email-code sign-in, concurrent resume and switch, stale sign-out, invalid tokens, Staff inactivity, account deactivation, Student semester closure and returning-Student restoration.
- [x] Check the sign-in dialog on desktop and at a 390 px viewport using mock responses. Verify Cancel and explicit switch, then verify sign-out from a protected page.
- [ ] Test personal-device opt-in after verified Student and Faculty login. Leave the app idle for more than 10 minutes, return after device sleep, and reopen the browser. Verify the intended page opens and the seven-day deadline stays fixed.
- [ ] Check private browsing, cleared browser data, two real tabs and a physical phone and computer using the same account.
- [x] Verify the live sign-in page, enabled setting, catalog, schema health and anonymous and cross-site resume guards.
- [ ] Verify production-origin cookie issuance, switching across physical devices, and delivery of a real school email code with an approved test account.

## Change log

- **2026-11-10:** Drafted the plan with a proposed seven-day period, opt-in for Student and Faculty accounts, and the existing one-active-login policy. No application code, migration, or deployment was changed.
- **2026-11-10:** Clarified that one browser may use an account at a time. A second browser is blocked unless the user explicitly switches after verification, which ends access on the first browser before granting it on the second.
- **2026-11-10:** Completed the local refresh audit and recorded the repairs before starting remembered-device implementation.
- **2026-11-10:** Published the refresh fixes to Vercel (`dpl_1WZ2vy3yVTxZTZKXCwZycdC5vtPY`). Verified the live build on notifications, both attendance pages, and the library catalog, along with API health. The functional checks used local test responses.
- **2026-11-10:** Implemented single-device sign-in and remembered-browser recovery locally. The disposable Postgres verification used mock email and removed its schema. Browser verification used mock accounts and confirmed the default checkbox, switch prompt, Cancel, sign-out and the 390 px layout. Physical-device, real email and hosted-preview verification remain pending.
- **2026-11-10:** Promoted Vercel deployment `dpl_HdKxDuSyxfFWZkNSFguAEsvuA1fU` after staged checks. Confirmed the public alias, the unchecked seven-day option and the resume guards. The release preserved the prior production source and overlaid the device update.
