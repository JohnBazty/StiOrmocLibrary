# Student and Faculty dashboard hero

Date created: 2026-11-14
Date last updated: 2026-11-14
Status: built

## Why

Match the friend-ui reference hero for both signed-in user roles, integrate the permanent QR and clearance requirements into it, and move live occupancy into Library information. Keep the updated application's data and operational rules.

## How

The shared UserDashboardPage uses the existing reference-library-hero.webp asset and reference hero presentation: photo overlay, catalog/research links, compact QR and clearance tiles. The “Your library, made smarter” pill and separate QR banner are removed from these dashboards. Clearance labels, deadlines and role-specific destinations are retained. Occupancy moves into the Hours and schedule card with its live counts and an accessible progress indicator; zero capacity cannot produce a non-finite percentage.

DashboardQrPass keeps its standalone presentation as the default for existing consumers/tests. Its dashboard hero variant reuses the current permanent-pass image endpoint and URL cleanup, with loading/error guidance. Clicking the tile opens a native dialog with the full-size white-backed QR and the existing pass-download operation. The browser provides modal focus handling and Escape dismissal. Dialogs use the established charcoal dark-mode surfaces. No older reference API, event data or business logic was copied.

## Implementation tracking

- [x] Both Student and Faculty hero layouts, QR and clearance presentation.
- [x] Occupancy in Library information; existing statistics and controls retained.
- [x] Tests for both role destinations, occupancy placement, QR lifecycle and download errors.
- [x] Frontend suite: 325 tests passed; API suite: 506 tests passed; root type checks and production build passed.
- [x] Student browser inspection at desktop and 390px: light/dark hero, full-size QR, Escape return focus, mobile overflow and occupancy placement.
- [ ] Authenticated Faculty browser inspection: not performed; shared layout and Faculty destinations covered by component fixtures.

The production build retains the pre-existing large-bundle warning. No API, database, enrollment settings, authentication rules, original-comparison or friend-ui files were changed by this UI task. No commit, push, merge or deployment was performed.

## Change log

- 2026-11-14: Applied the reference layout to both roles after the user confirmed shared scope. Used native dialog behavior rather than copying the reference's custom modal logic. Kept the current five-second dashboard refresh and existing QR endpoint.
