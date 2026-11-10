# Simplify adding books from a file

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` — locally verified |

## Why

The owner finds the copy-transfer importer too complicated and requires all future product flows to assume no technical background. The current screen exposes column mapping, internal row decisions and identifiers, and requires individual confirmation even for ordinary valid new books.

## How

Use a plain-language file → review → add flow. Offer a simple UTF-8 CSV template, automatically recognize supported CSV/XLSX headings, choose category/shelf once for the file, and keep per-worksheet or unusual column adjustments behind optional settings. Display book/copy totals before saving. Ordinary valid new books can be reviewed together in the final confirmation; errors, possible existing books and overlaps require an explicit individual choice. Existing review/version/commit endpoints remain authoritative. Do not default to adding more copies for an existing title, discard supplied identifiers, infer missing quantities, import real school holdings in QA, or change schema.

Keep import drafts resumable with familiar labels. Show progress, make partial completion clear, preserve completed rows and provenance, and retry safely through existing durable row results. Simplify row editing to essential fields with optional details available. Clear old errors after a successful correction. Persist the owner's rule in `AGENTS.md` and `agent.md`.

References: approved Revision Phase 3 import/overlap decisions, Final Draft and Administrative System Flow catalog/inventory requirements, current import schema contract and existing Phase 3 QA findings. Product Postgres 026 / next 027 and MySQL reference 048 / next 049 remain unchanged.

## Implementation tracking

- [x] Review existing file reader, mapping, duplicate handling, review and commit contracts.
- [x] Record the owner's nontechnical-user rule in repository guidance.
- [x] Build plain-language file setup, preview, exception review and final confirmation.
- [x] Verify aggregate review, duplicate/error boundaries, partial failure and resume behavior.
- [x] Check desktop and phone layouts with disposable samples and remove test fixtures.

## Verification and limits

- Web import tests: **12 passed**. Parser tests: **7 passed**. API type check and web production build (including TypeScript) passed. The existing bundle-size warning remains.
- Tested automatic file inspection, category/shelf selection once, missing required columns, explicit duplicate choices, grouped review before commit, stale-version rejection, clearing a corrected error, interrupted saves, resume behavior, zero-copy choices, missing-copy totals, and a blank headings-only CSV template.
- Browser checks used the actual import screen with three clearly marked in-memory sample books and mocked API responses. Verified a duplicate marked already recorded contributes no additional copies, and one final confirmation completes the ordinary books together. No real holdings, accounts or import batches were created or edited.
- Desktop and 390 × 844 phone viewport checks passed; no horizontal page overflow in the phone check. This is browser viewport verification, not a physical-device certification. Screenshots: `output/book-import-simple-desktop.png` and `output/book-import-simple-mobile.png`.
- Temporary preview HTML/TSX and sample CSV were removed, the preview tab was closed and the viewport override was reset. Parser heading aliases now also recognize common Book name / Writer / Quantity / Qty / ISBN-10 / ISBN-13 headings without guessing quantities or discarding identifiers.
- The previous Phase 3 stale-import-alert finding is addressed by clearing old errors when saving a correction. Other findings in the earlier Phase 3 QA report remain outside this change. Existing server role, version, validation and transactional duplicate protections are retained; this task did not repeat the earlier live integration QA or import the school's workbook.
- No migrations, GitHub push or deployment. Postgres 026 / next 027 and MySQL 048 / next 049 are unchanged.
- Restarted only the verified local API process to load the parser aliases. API health and the web application's API connection both returned HTTP 200; the project remains running at `http://localhost:5173/`.

## Change log

- 2026-10-17: The owner requested a further simplification after finding this version difficult to use. The follow-up replaces the default per-book editor list with a compact table, automatically opens recognized files for review, hides optional settings, asks focused questions and uses one final Add action. See [guided book-file import](book-file-import-guided-20261017.md) for current behavior and verification.

- 2026-10-16: Owner requested simpler copy imports and a permanent project-wide nontechnical-user design rule. Started the UI redesign with existing server safeguards preserved.
- 2026-10-16: Completed the three-step import screen, shared category/shelf choices, automatic column recognition, exception-only individual review, plain-language copy totals and durable resume handling. Recorded the owner's rule in repository guidance. Passed focused tests and desktop/phone sample checks; removed temporary fixtures.
