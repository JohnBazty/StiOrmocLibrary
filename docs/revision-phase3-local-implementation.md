# Revision Phase 3 — catalog and holdings imports

| Field | Value |
| --- | --- |
| Date created | 2026-10-11 |
| Date last updated | 2026-10-16 |
| Status | `built` — locally verified |

## Why

Implement Revision Phase 3 without replacing existing title, physical-copy, research, or circulation identities. Keep development local until the owner requests a push or deployment.

## How

- Read the five supplied holdings sheets (GE, SHS, HRM, TM, IT). Detect their different headers and show editable per-sheet column mappings before staging.
- Stage source rows with provenance; validate missing fields, ISBNs, years, copy counts, accession identities and overlaps. Librarian decisions precede any holdings writes. Repeated batches/rows must not create duplicate copies; interrupted imports can resume.
- Store copyright year separately from publication year. Add optional descriptions, edition, resource types and program/course links. Digital PDFs are downloadable by everyone, including visitors, after the Librarian records permission for public distribution. Bytes remain in a private Storage bucket; the public catalog API rechecks title/file lifecycle before serving each download.
- Provide public metadata/search at `/`; approved Student/Faculty requests continue through the existing authenticated cart/reservation services. Retain the selected title through login and recheck live availability.
- Add Librarian Maintenance for catalog, imports, categories, managed locations, types and programs/courses. Exports belong in Reports; existing report services remain authoritative.
- Use additive Supabase DDL, private tables/bucket and server permissions. Preserve existing catalog history, archives and archived features.

## Implementation tracking

- [x] Read current Phase 3 scope and inspect the reference workbook/PDF requirements.
- [x] Recheck live migration ledger and implement reviewed additive schema.
- [x] Build upload, mapping, preview, row resolution and resumable import.
- [x] Build richer metadata and controlled public digital access.
- [x] Build public catalog and request/login continuation.
- [x] Build Maintenance and separate existing export access.
- [x] Verify workflows, permissions, duplicate prevention, existing records and local browser behavior.

## Verification and use

**2026-10-16 import usability update:** Adding books now uses Choose file → Check books → Add books, automatic column recognition, category/shelf choices once per file, and individual questions only for exceptions. See [implementation, tests and limits](holdings-import-usability-20261016.md). Existing overlap review and transactional duplicate protections remain in force.

**2026-10-16 QA tooling update:** Run `node apps/api/scripts/verify-phase3-qa-isolated.js` for the live gate. It wraps the earlier verifier in a rollback-only transaction with savepoints, disposable permission actors and full-row preservation fingerprints, while explicitly removing external Storage fixtures. The earlier deletion-based cleanup predates Phase 7 collection-cache references, so direct execution is now blocked with an actionable instruction to use the wrapper. See [current QA findings and limits](revision-phase3-qa-20261016.md); the historical acceptance results below describe the original build.

- API suite: **286 tests passed** before the final parser/history error refinements; final targeted parser/category checks: **16 passed**. Web suite: **115 passed**. API/web type checks and production builds passed. The build retains a bundle-size warning; it is not a build failure.
- `node apps/api/scripts/verify-revision-phase3.js` passed against configured Supabase with disposable fixtures. Verified overlap reuse, invalid-row rejection, stale-version protection, per-copy identifiers and legacy circulation links, resumable/idempotent commit, metadata and course filters, public data boundaries, role restrictions, private-table privileges, digital upload/download, and withdrawal after archival.
- Read all five supplied workbook sheets without importing real holdings. The workbook's benign printer-settings binaries are accepted; macros/embedded executables remain rejected. Signature/footer blocks and split headers are excluded. Publication and copyright years stay separate.
- Browser checks passed for public browsing/details, preserving a selected book through the login link, Librarian Maintenance, workbook preview/mapping, metadata/digital controls, managed locations, and both CSV/PDF Reports downloads. No real title metadata was edited during these checks.
- Test Storage files, import rows/batches, catalog fixtures and the disposable browser account were removed. Existing title/copy/loan/account identities were checked unchanged by the integration script. Final totals: **19 titles, 31 physical copies, 6 accounts**, with **zero import batches**. These are current database totals, not a certification of the school's full physical collection.
- API restarted at `http://localhost:4000`; web remains at `http://localhost:5173/`. MySQL is not enabled. No GitHub push or application deployment.

### Remaining operational inputs

- The Librarian must review sheet mappings, category/location/program assignments, invalid rows and overlapping holdings before confirming a real import. Previewing a file does not create catalog records.
- Public digital downloads require a Librarian-uploaded PDF and recorded distribution permission; no copyrighted contents were fetched automatically.
- Dependency audit currently reports **two moderate findings**: ExcelJS and its transitive `uuid` dependency. The advisory concerns buffer checks in UUID v3/v5/v6; ExcelJS calls UUID v4. No high/critical findings remain. Record this for dependency maintenance rather than claiming a clean audit.
- Existing inventory exports are available under Reports. The broader analytical report overview remains Revision Phase 8 work. Deployment configuration and deployed-flow verification remain pending the owner's release instruction.

## Migration tracker

Supabase `021_revision_phase3_catalog.sql` applied on 2026-10-11. Next Postgres number **022**. Externally managed schema through `019` preserved. MySQL reference `047` remains unapplied, next `048`.

## Change log

- **2026-10-11:** Owner authorized Revision Phase 3. Read workbook layouts and revision requirements. Request librarian review for overlaps and clarify digital-access scope. No real holdings imported during development.
- **2026-10-11:** Owner confirmed review of overlapping holdings before saving and visitor access to permitted digital files. Applied additive `021`, built catalog/import/Maintenance/Reports screens, and passed API/web type checks. Work resumed after an intentional interruption; final integration and browser verification remain in progress.
- **2026-10-11:** Finished local acceptance checks, repaired header normalization/workbook footer handling, rejected malformed mapping payloads with a validation error, and made historical category-reference rejection understandable. Verified Reports downloads and fixture cleanup, restarted API, and marked Revision Phase 3 `built` locally.

## Technical references

- **2026-10-11 public-page refinement:** Added the owner's referenced academic-hub welcome layout and preserved the selected book across login/registration. See [implementation and verification](public-catalog-welcome-update.md). Public browsing remains unrestricted; borrowing still requires verified, approved account access and staff processing.

- [ExcelJS workbook reading](https://github.com/exceljs/exceljs#reading-xlsx).
- [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).
