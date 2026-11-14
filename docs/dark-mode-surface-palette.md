# App-wide dark surfaces - 2026-11-14

Owner requested dashboard-matching dark colors on every screen and approved applying the same elevated color to dialogs, dropdowns and form fields while retaining blue/yellow actions and status colors.

## Implementation

- Shared dark canvas token --sl-bg is #14151b; elevated/card token --sl-bg-elevated is #22232e.
- Updated remaining explicit dark navy backgrounds in shared UI components, catalog covers/inputs/import rows, circulation panels/dialogs, notifications, attendance QR panel, authentication and header/theme controls. Updated the dark browser theme-color metadata.
- Dark page wrappers use the canvas token; white cards and overlays use the elevated token. Focused fields and native select options now use charcoal as well.
- Public search remains white in light mode and now uses charcoal with light text in dark mode. The staff login page uses the same canvas/elevated pair.
- Brand imagery/tints, the reference sidebar, blue/yellow actions, error/success/warning colors and QR image contents were not recolored. No light-mode palette changes were made.

## Verification

- 506 API tests and 322 frontend tests passed. Type checks and final production build passed. Existing bundle-size warning remains. Diff whitespace checks passed; backend/database/environment/dependency/lockfile changes are absent.
- Browser audit visited all 20 Librarian navigation destinations. Every inspected page canvas measured RGB 20,21,27 (#14151b), every rendered shared card measured RGB 34,35,46 (#22232e), and none of the inspected visible neutral cards/fields used the old navy background values.
- Additional browser checks confirmed Profile panels and fields, the Add category dialog and fields, the public login popup, public search in both themes, and staff login canvas/fields. The category dialog was cancelled without saving.
- Other roles and every possible dialog/state were not separately authenticated or exhaustively opened; they use the updated shared variables/components. Current actions and API calls were preserved.
- Screenshot remains outside repo: %LOCALAPPDATA%/STILibraryLocal/dark-surfaces-preview.jpg.

No commit, push, merge or deployment. Library-hours work remains deferred.
