# Title initials for missing book covers

- **Why:** The owner requested automatic initials on books without an available cover image.
- **Date created:** 2026-10-17
- **Date last updated:** 2026-10-17
- **Status:** built

## How

Public and signed-in catalogs, details, carts and other shared book thumbnails use a local blue cover with yellow title initials when the image is absent or fails to load. Use the first letters of the first two title words; a single word uses its first two characters. Short numeric titles such as 1984 retain the number. Blank or punctuation-only titles use BK. Unicode letters are supported.

The fallback scales to its container and has a full-title accessible description. Existing uploaded covers retain their normal rendering. A changed image URL can load after an earlier URL failed. No image files, metadata or database records are created or changed.

## Implementation tracking

- [x] Shared initials fallback in both catalog cover components.
- [x] Verify existing image failure/replacement checks and frontend checks.

## Verification

All 17 existing cover/catalog tests passed, including both cover components, missing/failed images, a replacement URL, single-word/numeric/Unicode titles, public login continuation and signed-in selection. Frontend TypeScript checks passed. A read-only browser check of the running public catalog confirmed that missing images display initials while uploaded covers still display normally. Screenshot: ignored `output/book-cover-initials-20261017/catalog.png`. The temporary verification tab was closed; no database writes were performed.

## Change log

- 2026-10-17: Applied the owner's initials-cover request using the existing UI baseline guidance and brand colors.
