# Research covers in the combined catalog

Why: combined catalog cards show book initials for research, unlike the existing department/title research jackets.
Date created: 2026-11-15
Date last updated: 2026-11-15
Status: built

## How

Reuse the existing ResearchCover through CatalogCover for Research/Thesis cards and
their detail view. Pass title, author, publication year and the active research
record's department. Add the department to the existing read-only public catalog
query; exclude archived research metadata. Do not guess department from a category
or a title's initials. Missing department retains the existing Campus research
label. Real cover images remain preferred; unreadable images fall back to the
styled research jacket. Book covers and book-initial fallbacks remain unchanged.

Source: Final Draft pages 7/18/22 and source-of-truth catalog/research requirements
identify repository metadata. The reference matches the existing ResearchCover.
No migration or dependency. Latest applied migration 045, next unused 046.

## Implementation tracking

- [x] Reproduce the missing metadata and wrong initials fallback with regression tests.
- [x] Reuse the existing research cover and expose department in public reads.
- [x] Full tests, typecheck, build, coverage and local synchronization.
- [x] Owner-authorized GitHub push and Vercel deployment.

## Change log

- 2026-11-15: owner requested the existing research jacket style in the combined catalog and approved pushing/hosting after validation. Change is presentation plus an additive, read-only response field; no research data is edited.
- 2026-11-15: 724 API and 478 web tests passed (1,202 total), typecheck, build and full coverage passed. Actual PGlite SQL verifies active department selection, archived metadata exclusion, research details and unchanged book behavior; UI checks verify combined cards/detail jackets and unreadable-image fallback. Web line coverage is 68.83%; repository-wide coverage remains below 80%.
- 2026-11-15: synchronized seven scoped files to the existing local integration checkout, preserving unrelated edits, and restarted its API. Local read-only check returned 24 research items with department metadata. Reviewed SQL and UI boundaries: existing public fields and metadata sources, read-only access, no migration/permissions change, original cover images preferred, book fallback preserved, and existing responsive research rendering reused. Remote main is already included; no merge conflict or source/package mysql/dbDriver reference. No fresh browser screenshot was captured; the existing research jacket itself is unchanged. Publication follows the passed checks.

## Publication — 2026-11-15 (Asia/Manila)

Pushed `ed78340` to `codex/research-catalog-covers`. Deployed a clean archive of
that commit and verified the candidate before promotion. Both search and details
provide active research department metadata; all 24 research records in the first
page have it. Book results, protected attendance/payment APIs and retained camera
UI passed release checks. The shared research cover and separate book-initial
assets load successfully. API responses stayed in memory during verification;
receipts contain counts and asset names only.

Promoted `dpl_AH2mMNsdE4uiPsciM7Pc9Mgh5YXt` to
https://sti-ormoc-smart-library.vercel.app. Verified production target, public
research/details/book responses, protected APIs and new app/cover assets on the
canonical domain. Previous `dpl_4cHD5PuZh7quhG5uYGx8Am2gfxsx` remains available for
rollback. No database write or migration occurred; latest applied remains 045,
next unused 046. GitHub main is unchanged. Reload existing catalog tabs to load
the corrected cover selection.
