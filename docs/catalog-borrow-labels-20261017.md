# Precise catalog borrowing labels

- **Why:** The owner requested Borrow wording on catalog actions and precise labels throughout the selection flow.
- **Date created:** 2026-10-17
- **Date last updated:** 2026-10-17
- **Status:** built

## How

Use **Borrow book** consistently for available physical books on public cards, signed-in cards and book details. Signed-in selection still adds to the existing cart for review and submission; a loan begins only when staff confirm handover. Public actions retain the selected title when opening login.

Unavailable physical books retain **Reserve book**, because their action joins a waiting list. Selected and reserved states retain their explicit state labels. Digital-only and research records retain their existing behavior. No borrowing, reservation, login or database rules change.

## Implementation tracking

- [x] Align available-book card and detail labels.
- [x] Clarify the signed-in instruction describing cart selection.
- [x] Run existing catalog checks and frontend type check.

## Verification

All 15 existing public and signed-in catalog tests passed, including cart selection, reservation routing, login continuation and book details. Frontend TypeScript checks passed. This is a wording change only; no API, schema, data or lending behavior changed.

## Change log

- 2026-10-17: Applied the owner's catalog wording request using the UI baseline guidance; preserved the existing available-book/cart and unavailable-book/reservation distinction.
