# Grouped Admin sidebar

Why: the combined Librarian/Admin sidebar is too long and related pages need dropdowns.
Date created: 2026-11-15
Date last updated: 2026-11-15
Status: built

## How

Use the exact top-level order Dashboard, File maintenance, Transaction, Reports.
Dashboard stays a direct link. File maintenance groups Books, Accounts and Library
setup. Transaction groups book circulation and Payments, with direct Printing queue,
Attendance and Clearance links. Reports contains Book Reports and Collection review.
All 24 existing destinations stay available exactly once through the same routes.
The same tree supplies the page header's flat destination list.

Use native keyboard-accessible disclosures, open the current route's ancestors,
and keep other branches compact after navigation. Manual dropdown choices survive
rerenders on the same page. Only selecting a page closes the mobile drawer. Include
disclosures in its existing focus loop. Preserve the current theme and 44px targets.
The owner calls the active canonical Librarian workspace Admin; restricted Staff
and legacy technical Admin navigation and Student/Faculty menus retain their links.
Account management includes Users and User archive under Accounts.

Source: Administrative System Flow page 1 groups dashboard, management, transaction
and reports modules; current owner instruction specifies the final sidebar labels
and order. No new permissions, routes, API calls, dependencies or migration.
Latest applied migration 045; next unused 046.

## Implementation tracking

- [x] Grouped navigation with all existing destinations and active ancestors.
- [x] Toggle, route-change, rerender, mobile close and other-role regressions.
- [x] Full tests, typecheck, build, coverage and local/browser checks (screenshot limit below).
- [ ] Owner-authorized GitHub push and Vercel deployment.

## Change log

- 2026-11-15: owner supplied the four-section order, requested Books/Payments/Accounts dropdowns, and approved pushing/hosting after verification. Changes are limited to the combined Librarian/Admin navigation and its mobile focus handling.
- 2026-11-15: 724 API and 485 web tests passed (1,209 total), plus typecheck, build and full coverage. Web line coverage is 68.91%; overall repository coverage remains below 80%. Checks cover exact root ordering, all 24 destinations once, active payment ancestors, native toggles, mobile close callbacks, stable manual closure on rerender, destination expansion and preserved Student/Staff/legacy Admin navigation. Combined review checked native semantics, visible focus, mobile focus-loop inclusion, route boundaries and unchanged permissions.
- 2026-11-15: synced seven scoped files into the existing local integration checkout, preserving unrelated edits. Chrome opened a local isolated preview; its accessibility tree showed Dashboard, File maintenance, Transaction and Reports, with groups initially collapsed. The selected browser became unavailable before the screenshot/interactive visual check, so no visual screenshot result is claimed. No school records or settings were changed. Latest remote main is already included, with no merge conflict. Source/package search contains no mysql/dbDriver references. Publishing follows the passed checks.
