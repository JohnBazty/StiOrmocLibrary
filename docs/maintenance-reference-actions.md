# Maintenance actions and application brand blue — 2026-11-13

Owner approved both decisions before implementation: copy the filled View details / View codes button and three-dot menu arrangement from friend-ui; replace the older brand blue throughout the updated app.

## Changes

- Maintenance's Books & research action column now shows a filled View details (or View codes) button and a bordered three-dot trigger. The existing Change category, Supplier quotations and Archive callbacks are available in that menu. Research rows retain only their applicable actions; missing research codes disable View codes.
- The menu renders outside the scrolling table so it is not clipped. It supports keyboard opening, arrow navigation, Home/End, Escape with focus restoration, outside-click dismissal and closing on scroll/resize. Mobile triggers and primary view buttons have a minimum 44px touch target.
- Other uses of CatalogManagementPage retain their existing visible action arrangement.
- Replaced #003399, including opacity/alpha variants, escaped utility selectors and equivalent RGB values, with reference brand #0b5ea2 (RGB 11,94,162) throughout frontend source. Matching visual test expectations changed with the palette. Error, warning and success colors and existing dark background shades remain distinct.
- This batch does not port the remaining page layouts. It standardizes brand blue while preserving each screen's features and controls.

## Verification

- 506 API tests and 313 frontend tests passed under the coverage command; frontend statement coverage 58.48%.
- Type checks and the final production build passed. Existing large-bundle warning remains. Diff whitespace checks passed; backend, schema, environment, package and lockfile changes are absent.
- Browser inspected Maintenance with real local catalog data in light/dark mode. Verified menu placement over the table, keyboard opening, and existing category/archive dialogs; cancelled without saving.
- Narrow view: menu stayed within the viewport, no document horizontal overflow, trigger measured 44 by 44 CSS pixels.
- No mutation actions (move category, archive, quotation upload) were submitted during browser verification.
- No remaining old brand hex/RGB values found in apps/web/src or apps/web/public. Individual screens outside Maintenance were not exhaustively inspected in the browser; the full frontend suite covers their existing component behavior.

Working copy remains on codex/public-home-reference; no commit, push, merge or deployment. The original comparison and friend-ui reference folders were not changed.

Review: http://127.0.0.1:5174/librarian/maintenance
Screenshot is outside the repository at %LOCALAPPDATA%/STILibraryLocal/maintenance-actions-preview.jpg.
