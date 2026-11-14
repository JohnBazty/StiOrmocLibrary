# Header account menu - 2026-11-14

Owner approved this change for all signed-in roles: move the sidebar account display to the top right, matching the reference account menu. Provide one existing Profile destination, theme switching, and Sign out. Do not copy the reference's three profile-section shortcuts. Library hours/closures remain deferred.

## Changes

- SidebarAccountCard was moved to AccountMenu. Its current profile/avatar loading, 60-second refresh, profile-update event handling, approved-photo behavior and initials fallback were preserved.
- The header avatar opens an account summary and Profile, Dark mode/Light mode, Sign out actions. Student, Faculty, Staff and Librarian link to their existing /profile page without section query parameters. Admin, which has no current profile route, receives theme and sign-out actions only.
- Removed the sidebar account card and profile shortcuts. Removed the separate header theme/sign-out buttons. Notifications and mobile navigation remain in place.
- Kept the current async sign-out behavior, failure message and retry. No confirmation dialog or authentication changes were introduced.
- Added keyboard opening, arrow/Home/End navigation, Escape focus restoration, outside dismissal and closing when focus leaves or the route changes. Dropdown stays inside a narrow viewport and uses existing reference colors.

## Verification

- 506 API and 322 frontend tests passed under coverage. Frontend statement coverage 59.30%. Type checks and production build passed; the existing bundle-size warning remains. Diff whitespace checks passed.
- Regression tests cover the approved-photo and initials fallbacks, profile refresh, one Profile link, role-specific route availability, theme switching, keyboard behavior, outside dismissal, notification flows, mobile navigation and sign-out failure/retry.
- Authenticated Librarian browser check: top-right menu, existing Profile page destination, light/dark switch, narrow layout (390px viewport, 382px document), actual sign-out to /login and reauthentication. No profile fields were saved.
- Other role menus were checked through component tests rather than separate authenticated browser sessions. Profile image storage remains unavailable in this local setup; the existing initials fallback works. No credentials were written to project files.
- No backend/database/environment/dependency/lockfile changes. No commit, push, merge or deployment. Working branch remains codex/public-home-reference.

Screenshot outside repo: %LOCALAPPDATA%/STILibraryLocal/header-account-menu-preview.jpg.
