# Restore missing public brand assets

Why: owner reported the broken public-header logo on Vercel.
Date created: 2026-11-15
Date last updated: 2026-11-15
Status: built

## Cause and how

PublicCatalogWelcome references /logo.jpg and /library-hero.webp, but those files existed only in the original local checkout and were absent from tracked deployment source. /logo.jpg returned HTTP 200 with text/html (the SPA fallback), so the browser could not decode it as an image. Restore the original logo, hero and favicon byte-for-byte into tracked public assets. Do not alter payment logic, credentials, database or layout.

## Implementation tracking

- [x] Reproduce live logo returning HTML instead of an image.
- [x] Inspect original logo and restore public brand files from original project.
- [x] Web build passed; emitted JPEG/WebP files match original bytes and valid signatures.
- [x] Candidate verified and promoted as dpl_GAknC6oL7SEtxgfsciCgWuLVb1pm (source ae5d7d0). Canonical public logo/favicon return image/jpeg, hero returns image/webp, all hashes match original files; API/schema remain healthy.

## Verification and rollback

Static assets only: run the web build and exact asset checks; no new implementation-mirroring tests or database work. Preserve the last healthy deployment dpl_XoTKmujCjMbCW6GKLhZDZd8wGZfF for rollback. Prior payment/full-app tests remain relevant because no app code changed.

## Change log

- 2026-11-15: restore missing public brand assets for owner-authorized Vercel repair.

- 2026-11-15: completed public asset repair and deployment. Restored the same files in the running local integration checkout. No application, payment or database logic changed.
