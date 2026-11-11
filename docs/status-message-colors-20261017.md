# Success and error message colors

- **Why:** A successfully added shelf appeared red because its confirmation used the error-alert role. The owner requires red only for errors and permits green for success.
- **Date created:** 2026-10-17
- **Date last updated:** 2026-10-17
- **Status:** built

## How

Category management now separates successful confirmations (`role="status"`, `data-tone="success"`) from errors (`role="alert"`, `data-tone="error"`). Confirmations use green `#166534` with white text and a check icon. Errors keep red `#b42318`, white text and an error icon. Dismissal remains available.

The shared stylesheet defines explicit success styling in both themes and excludes success notices from the red error selector. Loading and informational status messages are not recolored automatically. The same mixed error/success role was found and fixed in floor-plan publishing. Other audited alert-role banners represent failures or validation requirements.

The owner's color clarification is recorded in `agent.md`. The later direction withdraws the blue/yellow/white-only palette entirely: additional colors are permitted when they improve clarity, accessibility and consistency. Brand colors remain available; red stays reserved for errors, green for successful outcomes, amber for warnings and blue for information. Pair colors with text/icons and maintain WCAG AA contrast in both themes. This direction governs future interface work and does not itself request a system-wide redesign. No database or API changes are required.

## Implementation tracking

- [x] Correct category shelf/create/edit/delete/reassignment banner semantics.
- [x] Correct floor-plan publishing success semantics.
- [x] Shared green success and red error styles; preserve informational colors.
- [x] Record the owner-approved color rules.
- [x] Verify success/failure/dismissal behavior and production build.

## Verification

All 11 focused category/editor/floor-plan tests passed. They cover successful shelf creation, dismissal, a following failed attempt and floor-plan publish success/failure roles and tones. The frontend production build passed; the existing main-bundle size warning remains. Verification used mocked APIs; no real shelves, images or records were created or changed.

## Change log

- 2026-10-17: Started targeted repair after the owner identified a red shelf-creation confirmation. Applied Postgres remains 027; draft 028 is unapplied; MySQL reference 048 / next 049 unchanged.
- 2026-10-17: Completed shared status styles, both mixed-message fixes, 11 focused tests and the frontend production build.
- 2026-10-17: Owner withdrew the blue/yellow/white-only restriction and authorized any colors necessary for good UI/UX. Updated the standing design rules while preserving the explicit red-for-errors rule. This follow-up changes documentation only; the existing interface was not recolored.
