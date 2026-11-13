# Research and thesis maintenance page (separate from book maintenance)

| Field | Value |
| --- | --- |
| **Date created** | 2026-11-13 |
| **Date last updated** | 2026-11-13 |
| **Status** | `inprogress` |
| **Branch** | `feat/research-maintenance`, stacked on `feat/book-register` (see "Branch" below) |
| **Supabase migration** | none |

## Why

Ethan wants research/thesis maintenance separated from book maintenance (2026-11-13). He chose its **own sidebar page** for librarians.

Today the data is already separate, but the librarian screens mix it with books:

- Maintenance → "Books & research" tab (`CatalogManagementPage`) has both "Add thesis" and "Add book", a books/research filter and both totals.
- The Inventory page has a "Research and thesis inventory" section (`InventoryDashboard.tsx`).
- Research titles can be created from the web, but not edited or archived. The API already has `PUT /api/catalog/research/:titleId`, `POST /api/catalog/research/:titleId/archive` and `DELETE /api/catalog/research/:titleId`; no web code calls them.

## What stays the same

- Tables: `titles` + `research_records` (one-to-one) for the work, `research_inventory` + `research_inventory_audit_events` for bound copies. No schema change.
- API: no new endpoint. One fix: a research edit no longer clears the title category (see change log). Research stays view-only for borrowing.
- Shared lists stay on Maintenance: Categories, Locations, Resource types (each type is Book or Research/Thesis), Programs, Courses, Catalog information.
- Students and faculty keep `/student/research` and `/faculty/research`.

## How

### 1. New librarian page `/librarian/research-maintenance`

- Sidebar entry "Research maintenance" (`FileText` icon), section Resources, next to Book register and Book archive.
- Route in `App.tsx` under the Librarian `ProtectedRoute`.
- `ResearchMaintenancePage.tsx` shows two sections:
  1. **Research titles**: `CatalogManagementPage` with a new prop `kind="research"`.
  2. **Bound copies**: the research inventory section, moved out of `InventoryDashboard` into `ThesisInventorySection.tsx` (cut and paste, same state, same API calls, same PDF export).

### 2. `CatalogManagementPage` gets `kind: 'book' | 'research'`

| | `kind="book"` (Maintenance → Books) | `kind="research"` (new page) |
| --- | --- | --- |
| Header | "Book management" | "Research and thesis management" |
| Add button | Add book | Add thesis |
| Scope filter | fixed to `books`, select hidden | fixed to `research`, select hidden |
| Totals | book titles, tracked copies | research titles |
| Physical copy register | shown | hidden (bound copies are in section 2) |
| Row actions | unchanged | View codes, Edit, Archive, Change category |

```tsx
const scope = kind === 'book' ? 'books' : 'research'
// filters.scope is forced to `scope`; the "Books + research" select is removed
```

### 3. Edit and archive for research titles

- `catalog-api.ts`: add
  - `updateThesis(titleId, body)` → `PUT /api/catalog/research/:titleId`
  - `archiveThesis(titleId, reason)` → `POST /api/catalog/research/:titleId/archive`
- Edit: `AddResearchModal` takes an optional `initial` record; in edit mode it sends `ThesisMetadataInput` with `copy: null` (metadata only, copies untouched) and the title reads "Edit research".
- Archive: reason required, same confirm pattern as the book archive.

### 4. Maintenance and Inventory clean-up

- Maintenance tab "Books & research" → "Books" (`kind="book"`).
- Inventory page: remove the research section; add one line "Research copies moved to Research maintenance" with a link.

## Tests (Vitest + Testing Library, written first)

- `ResearchMaintenancePage.test.tsx`: shows research titles only, "Add thesis" opens the modal, no "Add book", bound-copies section loads `thesisRows`.
- `CatalogManagementPage` with `kind="book"`: no "Add thesis", no research total, search requests `scope=books`.
- Edit research: modal is prefilled; save calls `PUT /api/catalog/research/:id` with `copy: null`.
- Archive research: empty reason blocked; confirm calls the archive endpoint.
- `InventoryDashboard.test.tsx`: no research section; link points to `/librarian/research-maintenance`. Move the existing thesis inventory tests to `ThesisInventorySection.test.tsx`.
- Sidebar: librarian nav shows "Research maintenance".
- API (`catalog-management.service.test.ts`): editing research metadata does not write `titles.category_id`.

## Branch

`feat/book-register` changes the same files (`App.tsx`, `PortalLayout.tsx`, `CatalogMaintenancePage.tsx`, `AddResearchModal.tsx`). Either:

- **stack** `feat/research-maintenance` on `feat/book-register` and rebase onto `main` after it merges (no conflicts now), or
- branch from `main` and fix small conflicts at merge.

## Implementation tracking

- [x] Branch created (stacked on `feat/book-register`)
- [x] Failing tests written
- [x] `CatalogManagementPage` `kind` prop
- [x] `ResearchMaintenancePage` + route + sidebar entry
- [x] `ThesisInventorySection` moved out of `InventoryDashboard`
- [x] Edit and archive for research titles
- [x] Maintenance tab renamed; Inventory link added
- [x] `npm test`, `npm run typecheck`, `npm run build` pass (API 469/469, web 319/319)
- [ ] Browser check as librarian (view only on live data)
- [ ] plan-verifier, security-reviewer (security review done, findings fixed)

## Change log

- 2026-11-13: Plan created. Ethan chose an own sidebar page for research maintenance.
- 2026-11-13: Ethan approved the plan and chose to stack the branch on `feat/book-register`. Status `inprogress`.
- 2026-11-13: Built in the working tree (web only, uncommitted). Shared inventory pieces moved to `inventory-parts.tsx`; edit prefill uses the catalog list item plus the existing research overview endpoint for abstract and keywords.
- 2026-11-13: Security review fixes. **One API change, scope update:** editing a research title no longer writes `titles.category_id` (`updateThesisMetadata`); the validator always passed `null`, so every edit wiped the category set by "Change category". Category stays owned by "Change category". Research page: the catalog title scanner and its card are off (bound-copy scans go to `ThesisInventorySection` only), the book copy list is not fetched, the edit notice no longer shows the old title, and the edit prefill fetch is cancelled when the modal closes. Known change: scanning a thesis barcode on the Inventory page no longer opens its audit; use Research maintenance.
