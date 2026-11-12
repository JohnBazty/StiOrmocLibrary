# Unified user library catalog

| Field | Value |
| --- | --- |
| Date created | 2026-10-11 |
| Date last updated | 2026-10-11 |
| Status | `built` |

## Why

The owner requested one Library catalog in the user portal, with the separate Book requests page's functions moved into it.

## How

Use the cover-grid catalog and its collection, category, program, course and resource filters for Student and Faculty. Integrate authenticated borrow-cart selection, reservations, book overview and APA references. Keep digital files and research details available. Redirect previous `/catalog` URLs to `/library`, retaining selected titles and filters; send login continuation and portal discovery links to the combined page. Existing APIs remain authoritative for availability and borrowing limits.

## Implementation tracking

- [x] Combine browsing and request actions.
- [x] Remove duplicate navigation and preserve old links.
- [x] Verify cart, reservation, filters and login continuation regressions; production build.

## Verification

- 19 focused frontend tests passed: merged cart selection, Student limit enforcement, Faculty exemption/cart destination, reservations and rejected requests, selected-book details/APA references, preserved filters, digital-only details, borrowing-service failure, public browsing, auth continuation and old-URL redirection.
- A stale available card rechecks the authenticated record and opens reservation details when a copy is no longer immediately borrowable. It does not automatically create a reservation; the user chooses Reserve book explicitly.
- Production web build passed. Existing bundle-size advisory remains.
- Browser checked the actual catalog and shared sidebar components in a temporary layout preview using live public catalog data and a simulated Student eligibility response. One Library catalog menu entry, book covers, Borrow/Reserve buttons and cart link displayed together. The 390-pixel mobile viewport had no horizontal overflow. Preview file/tab removed and viewport reset; no real borrowing requests submitted.
- Screenshot: `C:/Users/JOHN/AppData/Local/Temp/unified-library-catalog.png` (layout preview with a placeholder account card).

## Change log

- 2026-10-11: Local implementation authorized and started. No database changes required; Postgres next 025 / MySQL reference next 048 unchanged.
- 2026-10-11: Completed the combined Student/Faculty catalog and compatibility redirects. Local frontend hot reload remains active.
- 2026-10-11: Owner requested visible available-copy counts before and after login. Restored “Copies: X of Y available” on book cards in the shared public/user catalog, using the existing API's available and total active-copy counts, including zero availability. Research entries retain their library-viewing label.
- 2026-10-11: Verified live anonymous catalog cards display 1 of 1, 0 of 1, 0 of 2, and 2 of 2 available. Shared rendering applies the same count to the signed-in catalog. Web build passed; screenshot saved to `C:/Users/JOHN/AppData/Local/Temp/catalog-available-copies.png`.
