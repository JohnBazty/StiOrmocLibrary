# Compact public mobile header

| Field | Value |
| --- | --- |
| Date created | 2026-10-11 |
| Date last updated | 2026-10-11 |
| Status | `built` |

## Why

The owner reported that the mobile public header spread the brand, account links and navigation awkwardly across three rows.

## How

Keep the brand, theme toggle and menu button in a single compact row below 1024 px. The menu expands in page flow with Home, Browse and Categories followed by Sign In/Sign Up (or My workspace). Use 44 px controls, accessible expanded state and Escape dismissal with focus return. Close on link selection and desktop resize. Desktop retains visible navigation and account links. Existing search and authentication behavior remains available.

## Implementation tracking

- [x] Build compact mobile/tablet header and disclosure menu.
- [x] Check mobile widths, navigation/account links and desktop layout.
- [x] Run regression tests and production build.

## Verification

- Live browser verified 320/390 px phones, 768 px tablet and 1440 px desktop with no horizontal page overflow. Closed phone header height is approximately 69 px.
- Expanded menu offers all five visitor links with 44 px touch targets. Escape closes it and restores button focus. Browse closes the menu and navigates to the catalog; Sign In opens the existing login popup.
- Six existing public catalog/auth-popup tests passed. Production build passed with the existing bundle-size advisory.
- Proof: `C:/Users/JOHN/AppData/Local/Temp/compact-mobile-header.png`. Restored viewport and closed the temporary browser tab. No API/database changes.

## Change log

- 2026-10-11: Started the owner-requested mobile header placement correction. Frontend only.
- 2026-10-11: Completed compact header, mobile disclosure navigation, functional/responsive verification and build.
