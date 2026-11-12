# Public catalog welcome and borrowing access

| Field | Value |
| --- | --- |
| Date created | 2026-10-11 |
| Date last updated | 2026-10-11 |
| Status | `built` locally |

## Why

The owner supplied a landing-page reference and requested free browsing before login. Login or registration is needed when a visitor decides to borrow a book.

## How

- Login includes an outlined **Back to browsing** button with a left arrow, linking directly to `/#catalog`. Public catalog navigation scrolls to the requested section after React mounts, including returns from login.
- Add a responsive white navigation header with Home, Browse, Categories, Sign In and Sign Up, plus a blue/yellow academic-hub welcome section and search. Use a decorative bookshelf illustration rather than presenting the supplied screenshot as a real library photograph.
- Keep public title search, filters, detail information, copy status/condition and permitted digital downloads accessible without authentication. Display real categories without invented popularity or collection totals.
- Render the existing saved title cover on each card and in details without cropping. Show a placeholder for missing or failed images. Route only existing bundled historical cover files through Vite's public assets; keep other API requests proxied as before. New Supabase cover URLs remain supported.
- Match the compact reference with five desktop columns and two mobile columns, portrait covers, concise title/author text, heading-side search and a dotted background. Advanced collection/category/program/course/type filters expand on demand. Availability indicators show Available, Unavailable or Library viewing from live records. Green/orange indicators follow the supplied design; no unimplemented waitlist state is inferred. The heading reflects the selected collection.
- Label the physical-book action Borrow book. Anonymous visitors go to login with the selected title ID; login/registration links preserve only a validated positive title ID. Registration still requires school-email verification and Librarian approval before borrowing becomes available.
- Approved Student/Faculty borrowing continues through the existing authenticated request workflow. This action creates a request, not a completed physical checkout. Personnel restrictions and existing API checks are retained.
- Keep personnel login at the unlisted `/staff` URL. Work locally; no database/schema changes, push or deployment.

## Implementation tracking

- [x] Build public welcome layout and real category/search navigation.
- [x] Preserve selected book across login and registration.
- [x] Verify public browsing, borrowing redirects, mobile layout and build.
- [x] Show saved covers on catalog cards and title details, with a fallback for missing or unreadable images.
- [x] Verify cover delivery and rendering locally.
- [x] Match the compact catalog reference and verify desktop/mobile layout, search, collection filtering and cover-click details.

## Verification

- Ten focused web tests passed across public catalog access, authentication-page links and safe login/registration continuation. Web build and API/web type checks passed. The existing bundle-size advisory remains.
- Local browser: hero search for 1984 returns the existing title; anonymous details show the copy condition/location; Borrow this book opens `/login?catalogTitleId=25`; Register retains that selection at `/register?catalogTitleId=25`, and its return link retains it too. No registration or borrowing was submitted during verification.
- Responsive viewport at 390px showed no horizontal overflow; restored the default viewport and retained the user's dark-mode setting. Local landing page remains available at `/`.
- No database writes/schema migrations, account changes, push or deployment. Supabase next migration remains 022; historical MySQL next remains 048.
- Cover addition: eleven focused web tests passed, including cover rendering on both surfaces and fallback/recovery after a failed image. API/web type checks and web build passed. Anonymous listing/detail returned 200; all 14 saved cover URLs returned 200 with image content types across 19 catalog entries. Browser verified loaded covers on cards and in 1984 details. Restarted the local API; Vite reloaded its configuration. Existing bundle-size advisory remains.
- Compact redesign: five relevant existing tests passed; API/web type checks and web build passed. Browser verified five desktop columns, two columns at 390px with no horizontal overflow, heading-side search, collection filter and cover-click details with the existing anonymous borrowing login URL. Captured light-theme proof, then restored the user's dark theme and default viewport. No database/API changes or deployment.

## Change log

- **2026-10-11:** Owner requested a clear button to return from login to browsing. Replaced the plain catalog link with an outlined button and direct catalog-section navigation. Six existing authentication-page tests and web typecheck passed; local browser confirmed navigation to `/#catalog`. No database change, push or deployment.
- **2026-10-11:** Owner supplied a compact catalog reference. Restyled the catalog with five desktop columns, flush portrait covers, short title/author text, availability dots, dotted background and heading-side search. Moved advanced filters into a collapsible control; real details and borrowing links retained. Green/orange availability indicators follow the owner's supplied reference, overriding the older palette restriction for these indicators. Verification in progress.
- **2026-10-11:** Completed compact-catalog functional and responsive verification; restored theme/viewport and marked built locally.

- **2026-10-11:** Owner requested book covers. Exposed the existing title cover field in public listing/detail responses and added full-cover previews and a missing-image placeholder; verification in progress. No schema change.
- **2026-10-11:** Fixed local historical-cover proxy routing; all saved covers delivered successfully and browser card/detail rendering verified. Marked built locally.

- **2026-10-11:** Owner requested the referenced public-first borrowing experience. Built welcome/header/category navigation and fixed registration continuation; verification in progress.
- **2026-10-11:** Completed focused tests/build, anonymous browser-flow and mobile layout verification. Marked built locally. The bookshelf background is an illustration; an actual campus library photograph can replace it when supplied.
