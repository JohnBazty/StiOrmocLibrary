# Research and thesis reference appearance

Date created: 2026-11-14
Date last updated: 2026-11-14
Status: built

## Why

Apply friend-ui's research/thesis presentation to Student, Faculty and public browsing while preserving current features, access restrictions and records. The user approved both signed-in roles and public pages, then separately approved read-only public API filter/metadata support.

## How

- The shared Student/Faculty ResearchCatalog starts with a thesis-cover grid and retains a table alternative using the updated app's responsive table component. Search, department, year, author and adviser filters query the existing signed-in API across the full result set. Pagination, removable filter chips, clear filters, loading/error states and the APA guide remain available.
- ThesisCoverCard uses department-specific reference colors and cover typography. Unknown departments use a neutral cover. It shows only the recorded publication year; no publication month is invented. Current live records provide title, authors and department.
- ResearchOverview is a centered, bounded, scrollable dialog. Existing department, year, shelf, adviser, abstract, additional catalog information, digital-file links and APA generation/copy remain. Research continues to be view-only; no borrowing, reservation or cart action was added.
- Public browsing uses thesis covers in research and mixed collections, with research-specific filters when Research/thesis is selected. The Collection selector stays visible. Research/thesis shows only Department, Year, Author and Adviser; Category, Program, Course and Resource type remain available for books and mixed browsing. Switching into research clears those four book filters and pagination; switching collections clears research-specific fields. General search text remains. Public research details use a centered cover/details window; book presentation/actions remain in their existing form.
- Dialog keyboard handling supports Escape, focus containment and return to the opener. Mobile close buttons and modal heights have scoped overrides for the existing global responsive rules. Dark surfaces remain #22232e.

## Approved backend scope — include in future repository review

This batch is **not frontend-only**. `catalog-enhancements.service.ts` now accepts read-only department, publicationYear, author and adviser filters on the existing public catalog query and returns recorded department/adviser metadata. It reuses the signed-in research year validation, binds SQL values, and keeps existing active-title/nonarchived-research restrictions. The data and count queries share the same filters. There are no new endpoints, writes, schema migrations, authentication changes or permission changes.

## Implementation tracking and verification

- [x] Student/Faculty grid, table, filters and details with current services.
- [x] Public covers, filters and details with approved read-only API support.
- [x] Tests: 508 API tests and 328 frontend tests pass.
- [x] Root type checks and production build pass. Existing large-bundle warning remains.
- [x] Root coverage command passes: API coverage 72.54% lines; frontend coverage 66.33% lines, 56.85% branches and 52.3% functions. Tests use the existing localhost:5173 redirect expectation through a process-only WEB_ORIGIN override; application environment files remain unchanged.
- [x] Real anonymous API checks: research list, department/year/adviser filtering, matching detail metadata and malformed-year rejection.
- [x] Student browser: desktop grid/table and details, APA generation, light/dark modes, 390px layout and dialog fit, Escape dismissal.
- [x] Public browser: real department/author filtering reduced the results to one matching record; cover, metadata and centered details inspected.
- [ ] Authenticated Faculty browser session not checked; Student and Faculty share this component and API, and no role-specific navigation logic was introduced.

The original-comparison and friend-ui folders remain unchanged by this task. The updated runtime remains connected to the isolated enrollment-test database. No source settings, database schema or catalog data was changed. No commit, push, merge or deployment was performed.

## Change log

- 2026-11-14: User confirmed Student, Faculty and public scope, and explicitly approved public API support after clarification. Adapted reference presentation to the updated app's components and retained its current catalog services and controls.

- 2026-11-14: User approved separating public research filters from book filters. Updated the shared catalog panel and regression tests for visible controls and filter cleanup. Anonymous browser verification on port 5174 confirmed research-only controls, restored book controls, and 15 research results after switching from category/program-filtered books. No API, schema or data changes in this follow-up.
- 2026-11-14 verification for filter separation: focused regression tests passed after first failing on the old behavior; full 508 API and 329 frontend tests, root type checks, build and coverage passed. Test and coverage commands used the documented process-only WEB_ORIGIN=http://localhost:5173 override for the existing authentication redirect expectation. The application remains on port 5174; environment files were unchanged. Existing large-bundle build warning remains.
