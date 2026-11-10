# Public catalog main search

| Field | Value |
| --- | --- |
| Date created | 2026-10-11 |
| Date last updated | 2026-10-11 |
| Status | `built` |

## Why

The owner requested moving the collection search function into the large Academic Hub search bar.

## How

The main search filters titles, authors and ISBN as the visitor types using the existing query/API. Clearing it resets the query; changing it resets pagination and preserves other filters. The arrow or Enter submits and scrolls to results. Remove the duplicate field from the public collection heading. Keep the embedded Student/Faculty catalog's search, since that view has no welcome section. Prevent completed search loads from scrolling away from the main input while typing.

## Implementation tracking

- [x] Connect live main search and remove the public duplicate.
- [x] Verify query, filters, clearing, submit/scroll and embedded search.
- [x] Check mobile behavior and build.

## Verification

- 15 focused tests passed across public catalog, authenticated catalog and authentication popups. New regressions cover live main search, retained filters, pagination reset, clearing, arrow/form submission, avoiding repeated hash scrolling and embedded search.
- Production web build passed; existing bundle-size advisory remains.
- Live anonymous browser at 390 px: typing `harry` returned only Harry Potter; there was one search field and no page overflow. Enter brought the results into view. Clearing restored all 19 current catalog entries. No account/operational changes.
- Saved proof at `C:/Users/JOHN/AppData/Local/Temp/main-catalog-search.png`; restored the default viewport and closed the temporary tab.

## Change log

- 2026-10-11: Started the authorized search move. No database or API changes.
- 2026-10-11: Completed the main search move and verified live filtering, clearing, mobile layout, focused tests and build.
