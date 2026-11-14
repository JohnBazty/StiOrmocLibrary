# Public catalog collection and category filters

- **Why:** The combined Books & research selection displayed book filters even though research has different filters. Repeated category pills also crowded the public page. The owner approved explicit collection choices and dropdown-only category browsing.
- **Date created:** 2026-11-15
- **Date last updated:** 2026-11-15
- **Status:** built

## How

The Collection dropdown offers only **Books** and **Research / thesis**. Missing or empty collection selections, including old combined-view links, resolve to Books. The displayed selection, heading and outgoing search use the same effective collection. Every search explicitly sends `kind=Book` or `kind=Research/Thesis`, preventing a Books heading over mixed results.

Existing research links keep their research selection. The existing switch handler clears collection-specific filters and pagination while preserving the general search text. Books show Category, Program, Course and Resource type; research shows Department, Year, Author and Adviser. The shared component also gives embedded catalogs the same default. API support for mixed search remains unchanged for other callers. No collection maintenance screen or database changes were added.

Removed the hero category shortcuts, the full Browse by category pill section, and Categories links from desktop/mobile public navigation. The welcome component no longer accepts category data or callbacks. Home and Browse remain, with two equal columns in the mobile menu. Existing `#categories` bookmarks scroll to the catalog instead of a removed section.

Category selection remains in Filter collection for Books. When a known category is selected, its name appears as plain wrapping text beside the filter heading, including when collapsed. Choosing All or switching to research removes the category indicator. Category records and librarian category maintenance are unchanged.

The full “Your Academic Hub at STI College Ormoc” heading uses the reference's exact `text-shadow: 0 2px 10px rgba(0,17,51,0.45)`, including the yellow highlight. Browser computed styles and visual inspection confirmed the shadow; the production build passed after this styling-only follow-up. Tests were not rerun for the shadow-only change.

## Implementation tracking

- [x] Inspect collection filtering, links and maintenance options.
- [x] Confirm the two-choice layout and Books default with the owner.
- [x] Add default/legacy-link and embedded-query regression checks and observe failures.
- [x] Use the selected collection consistently in headings, controls and API queries.
- [x] Verify filter clearing in both directions and retention of general search text.
- [x] Inspect the live public catalog and phone layout; run repository checks.
- [x] Remove duplicate category pills/navigation and verify dropdown-only browsing, collapsed selection text and old category bookmarks.

## Verification

- Focused public catalog suite: 11 tests passed. Tests cover the two options, Books default for missing/empty kind, explicit outgoing kind for public and embedded views, direct research links, details/borrowing links, filter clearing, dropdown-only category selection, both public menus, collapsed category text and legacy category bookmarks.
- Root `npm test`: 548 API and 386 web tests passed. The test process uses WEB_ORIGIN=http://localhost:5173 for the existing authentication expectation; private configuration was unchanged.
- Root `npm run typecheck` and `npm run build`: passed. The build retains its existing bundle-size advisory.
- Browser at port 5174: live Books heading and two dropdown choices verified; research selection shows its heading and Department filter without book-category controls. Switching back yields kind=Book with the adviser filter cleared. Phone viewport has no document overflow. Viewport override restored afterward.
- Category browser follow-up: no category section or links remain; selecting a live category filters results and displays its name with filters collapsed. A long category name fits a 390px phone viewport without document overflow. Light/dark page and two-link mobile navigation checked; theme and viewport restored.
- Final diff review and `git diff --check` passed. Earlier uncommitted portal/login/favicon work was preserved. No push, merge, deployment or database writes.

## Change log

| Date | Change |
| --- | --- |
| 2026-11-15 | Removed the combined collection option, defaulted browsing to Books, verified direct research links and filter resets, and recorded automated/browser checks. |
| 2026-11-15 | Owner approved dropdown-only categories. Removed both pill groups and Categories navigation, added collapsed category context, preserved legacy bookmark scrolling, and reran tests, types, build and browser checks. |
| 2026-11-15 | Matched the reference text shadow on the full welcome heading after owner confirmation; verified browser rendering and production build. |
