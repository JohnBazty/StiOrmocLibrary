# Keep the page still during login

Why: opening the account dialog and moving to the login code step must not jump or scroll the catalog behind it.

Date created: 2026-11-13

Date last updated: 2026-11-13

Status: built

## How

The account layout remounts the public catalog with a saved/default `#catalog` anchor. After the catalog request finishes, its normal anchor-scroll effect runs behind the dialog. The login inputs also use native automatic focus before the modal is opened, followed by another ordinary focus call in the layout. These are separate sources of unwanted scrolling.

Browsing, login and registration now share one route layout, preserving the existing catalog DOM, draft searches and scroll position when opening the dialog. Suppress catalog anchor navigation only while it is an inert account-dialog background. Keep normal catalog anchor links and search navigation. Freeze the document at its current position, compensate for its scrollbar, and restore its original inline styles and scroll position on dismissal. Open and focus the modal before paint with explicit `preventScroll`, including when the lazy login form arrives, and avoid native input autofocus in popup login/OTP stages. Keep keyboard focus and native focus trapping. Preserve registration and selected-book continuation.

## Implementation tracking

- [x] Regression tests for deferred catalog load and popup focus
- [x] Scoped modal/background repair
- [x] Persistent catalog routing, document position lock and restoration
- [x] Regression coverage for retained draft search, scroll restoration and Strict Mode
- [x] Tests, typecheck and build
- [ ] Browser visual reproduction when the browser connection permits it

## Verification

The deferred-catalog and popup-focus regressions both failed before the repair. All 11 targeted catalog/login/OTP tests pass afterward, including continued normal anchor navigation, selected-book continuation, form switching and pending-login dismissal protection. Added an OTP focus regression: the code input receives keyboard focus with `preventScroll` and no native popup autofocus. Device-switch headings also retain accessible focus without moving the page.

All 564 API tests and 378 web tests pass (942 total). Typecheck and production build pass. The OTP assertion waits for its focus effect rather than racing DOM insertion under full-suite load. The local login route returns HTTP 200, and the running Vite server serves the updated source. Browser verification was attempted through the supported tool, including its session reset, but the chat currently reports local browser access unavailable. Desktop/physical-phone visual behavior is not claimed verified; no browser-policy workaround was attempted. The existing payment checkout QA remains a separate unfinished check.

Follow-up repair: all 564 API tests and 380 web tests pass (944 total), including the two new persistent-layout/position regressions. Typecheck and production build pass. The running localhost server returns HTTP 200 for both updated route/layout modules and serves the persistent catalog and document-position lock. These checks verify implementation and regressions; actual browser visual confirmation remains outstanding because the supported browser connection is unavailable. Evidence logs are ignored local files under `output/demo-wallet-qa/login-opening-*`.

## Change log

- 2026-11-13: Owner reported unwanted page scrolling during login. Local-only repair; no push, hosting, database change or migration.
- 2026-11-13: Disabled anchor scrolling for the account dialog's background only; moved modal opening/focus before paint; prevented scroll during login-code and device-switch focus. Added regression evidence and retained normal catalog behavior.
- 2026-11-13: Owner confirmed the opening jump persisted on localhost. The first repair was incomplete: the public root and login still used separate route branches and recreated the catalog. Reopened work; moved browsing and account routes under the same persistent layout, froze the document at its current position while the dialog is open, and restore prior styles/scroll when it closes. Added preservation and Strict Mode regressions. This supersedes the earlier completion claim; visual verification remains unavailable.
- 2026-11-13: Follow-up implementation completed; 944 tests, typecheck and build pass. Confirmed localhost serves the updated modules. Kept browser visual verification explicitly unchecked; no push or deployment.
