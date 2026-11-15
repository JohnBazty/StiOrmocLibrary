# Grouped Admin sidebar

Why: the combined Librarian/Admin sidebar is too long and related pages need dropdowns.
Date created: 2026-11-15
Date last updated: 2026-11-15
Status: built

## How

Use the order Dashboard, File maintenance, Transaction, Reports. These are ordered
sections, not four collapsible buttons. Dashboard stays a direct link; the other
three labels are always-expanded headings. Only Books, Accounts and Payments use
dropdowns. Floor plan, Maintenance, Print supplies, Announcements, Borrow & return,
Book queue, Printing queue, Attendance, Clearance, Book Reports and Collection review
are visible directly underneath their section without opening a parent menu.
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
- [x] Full checks and local verification of the visible-section correction.
- [x] Publish the correction to the same authorized branch and Vercel project.

## Change log

- 2026-11-15 owner correction: the four labels specify section order, not a four-button navigation. The earlier implementation hid too many pages. Removed the File maintenance/Transaction/Reports dropdown layer, the extra Library setup group and duplicate transaction Books group. Only the requested Books/Accounts/Payments dropdowns remain. New regressions failed against the old layout and pass against the correction; all 24 routes remain present. This corrects the same approved sidebar release.
- 2026-11-15 correction verification: 724 API and 485 web tests passed (1,209 total), typecheck, full coverage and build passed. Web line coverage is 68.92%; overall coverage remains below 80%. Regression checks now require uncoupled section headings, directly reachable routine pages and exactly three dropdowns, while retaining all 24 routes and existing role boundaries. Chrome's local accessibility tree and screenshot showed the visible sections and direct links; browser debugging detached afterward, so further interaction and saving the screenshot were unavailable. Five scoped files were synchronized locally. No backend, route, dependency, permission or database change. Remote main remains included without conflict.

- 2026-11-15: owner supplied the four-section order, requested Books/Payments/Accounts dropdowns, and approved pushing/hosting after verification. Changes are limited to the combined Librarian/Admin navigation and its mobile focus handling.
- 2026-11-15: 724 API and 485 web tests passed (1,209 total), plus typecheck, build and full coverage. Web line coverage is 68.91%; overall repository coverage remains below 80%. Checks cover exact root ordering, all 24 destinations once, active payment ancestors, native toggles, mobile close callbacks, stable manual closure on rerender, destination expansion and preserved Student/Staff/legacy Admin navigation. Combined review checked native semantics, visible focus, mobile focus-loop inclusion, route boundaries and unchanged permissions.
- 2026-11-15: synced seven scoped files into the existing local integration checkout, preserving unrelated edits. Chrome opened a local isolated preview; its accessibility tree showed Dashboard, File maintenance, Transaction and Reports, with groups initially collapsed. The selected browser became unavailable before the screenshot/interactive visual check, so no visual screenshot result is claimed. No school records or settings were changed. Latest remote main is already included, with no merge conflict. Source/package search contains no mysql/dbDriver references. Publishing follows the passed checks.

## Publication — 2026-11-15 (Asia/Manila)

Pushed source `a7e6aaa` to `codex/grouped-admin-sidebar`; main was not modified.
Vercel initially refused the expired saved access token. The installed CLI's
`whoami --scope ssl19` refreshed its existing login; project access then passed
without creating credentials or changing permissions. Built a clean source archive
and verified the candidate before promotion.

Promoted `dpl_7nr5dfty59owGMSaZHEE8Rm2pvji` to
https://sti-ormoc-smart-library.vercel.app. Verified the canonical production target,
grouped sidebar bundle and disclosure styles, public health/catalog/research reads,
research department/detail metadata and retained cover assets. Attendance/payment
APIs still require authentication. Previous `dpl_AH2mMNsdE4uiPsciM7Pc9Mgh5YXt` remains
available for rollback. No migration or library-record write was performed. Local
source is synchronized; reload existing tabs to replace the old sidebar. The
temporary isolated preview server was stopped after verification.

## Visible-section correction publication — 2026-11-15 (Asia/Manila)

Pushed correction `f008292` on the same `codex/grouped-admin-sidebar` branch.
Deployed a clean archive and verified the always-visible heading renderer in the
candidate bundle, alongside existing public catalog/research data, cover assets
and protected APIs. Promoted `dpl_7f1CxEAc9uY5vHztP8Eer3zkm95a` to the canonical
library domain and repeated those checks against its new production target.
File maintenance, Transaction and Reports now have directly visible child links;
only Books, Accounts and Payments remain disclosures. All 24 routes are retained.
The earlier four-button release remains in deployment history; the prior flat
sidebar release `dpl_AH2mMNsdE4uiPsciM7Pc9Mgh5YXt` is also retained as a fallback.
No library record, schema, credential, permission or API behavior changed. Local
files are synchronized. Reload open tabs to replace the four-button layout.
