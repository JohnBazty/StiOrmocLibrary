# Portal sign-out confirmation, sidebar collapse and staff login wording

- **Why:** Prevent accidental sign-out, free desktop space using the reference UI's collapsible sidebar, and clarify the staff login page.
- **Date created:** 2026-11-15
- **Date last updated:** 2026-11-15
- **Status:** built

## How

The owner confirmed that sign-out confirmation and desktop sidebar collapse apply to all five portals: Student, Faculty, Staff, Librarian and Admin.

### Sign out

The account menu opens a native modal dialog titled “Sign out” with “Are you sure you want to sign out?”, Cancel and Sign out. No logout request occurs until confirmation. Cancel receives initial focus; Cancel and Escape preserve the session and restore focus to the account button. Native modal behavior prevents background interaction, and document scrolling is locked while open. Confirmed logout retains the existing API and login destination. While pending, both buttons are disabled and Escape is ignored. Failures remain in the dialog with a retry button instead of silently redirecting.

### Sidebar

Adapted only the desktop collapse behavior from `StiOrmocLibrary-friend-ui`, preserving this branch's navigation, account menu, logo, permissions and colors. At the existing 1024px desktop breakpoint, the sidebar toggles between 256px and an 88px icon rail and changes the content offset accordingly. Links retain accessible names and hover titles. Collapse resets on page reload, matching the reference. Phones retain the existing full-width slide-out menu, background inertness, scroll lock and Escape/focus behavior. Reduced-motion preferences disable the new layout transitions.

### Staff login

Changed “Restricted access” to “Librarian & Staff access” and “ILMS Administration” to “Library Staff Portal”. Removed only the staff login's Show password checkbox; the labeled eye button still toggles password visibility. Student and Faculty login controls are unchanged. The pending Personnel ID wording and reference favicon changes remain intact; see [their record](personnel-login-and-favicon.md).

## Implementation tracking

- [x] Inspect both checkouts and confirm all-portal scope with the owner.
- [x] Add regression expectations and observe failures before implementation.
- [x] Add accessible sign-out confirmation and preserve logout errors/retry.
- [x] Port desktop sidebar collapse without replacing existing navigation.
- [x] Update staff login wording and retain the eye-only password control.
- [x] Check desktop/phone behavior and light/dark modal appearance in a browser.
- [x] Run tests, typecheck and build.
- [x] Finish coverage verification and final review.

## Verification

- Focused authentication, account-menu and portal-layout checks: 30 passed. Full root test run: 548 API and 382 web tests passed. Root typecheck passed after correcting unsupported test-query options caught by TypeScript.
- API tests use WEB_ORIGIN=http://localhost:5173 only for the test process, as required by an existing expectation. Private settings are unchanged.
- Browser preview imported the real PortalLayout and stylesheet with synthetic identity and fetch responses. All five roles displayed confirmation and supported desktop collapse. No live account was logged out and no database requests were made.
- Desktop inspection confirmed 256px expanded and 88px collapsed sidebar/content offsets, with no document overflow. Phone navigation remained 256px wide, and labels remained visible after prior desktop collapse. Escape restored focus to the navigation opener.
- Native dialog inspection confirmed modal state, initial Cancel focus, Escape cancellation and focus restoration. The mobile dark dialog fit within a 390px viewport and used an opaque dark background. Confirming the synthetic logout reached the existing login destination. Regression tests cover cancellation, confirmation, pending request protection, failed requests and retry.
- Actual staff login at port 5174 showed both new labels, no Show password checkbox, and working Show/Hide password eye buttons. Browser theme and viewport were restored after checks.
- Root production build passed with the existing bundle-size advisory. Root `npm run coverage` passed: all 548 API and 382 web tests passed under coverage. Whole-web coverage reports 61.81% statements, 58.13% branches, 54.46% functions and 68.51% lines; no thresholds were changed. Final diff review and `git diff --check` passed. The temporary preview was removed.

## Change log

| Date | Change |
| --- | --- |
| 2026-11-15 | Owner confirmed all-portal controls. Implemented UI and regression tests; browser validation, tests, typecheck, production build, coverage and final review completed. Changes remain local and uncommitted. |
