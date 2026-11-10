# Automatic cleanup when adding books from a file

- **Why:** Reduce librarian corrections for ordinary spreadsheet formatting while keeping factual changes and duplicate-copy decisions explicit.
- **Date created:** 2026-10-17
- **Date last updated:** 2026-10-17
- **Status:** built

## How

Normalize extra whitespace, ISBN formatting and unambiguous whole-number formatting. Recognize supported heading aliases. Recognize category/shelf columns and match names only to one existing active reference using case/space-insensitive exact matching. Do not invent a quantity, author, ISBN check digit, category, shelf or duplicate-copy decision. Preserve identifiers as strings with leading zeros.

Keep original source cells and record automatic before/after changes in the existing import JSON. Show a concise cleanup summary and optional details before the final Add action. Unknown or ambiguous reference names stay in Questions; suggested matches require an explicit librarian click and normal review/save validation. Preserve old fingerprint identities, completed rows, validation, permissions and resumable saves. No catalog records are written until the final Add action.

Fix the category-options contract: categories have no archive lifecycle, but the new importer expects an explicit Active status. Return that status consistently without changing the database schema.

## Implementation tracking

- [x] Safe parser cleanup, heading recognition, unique reference matching and immutable cleanup records.
- [x] Review summary and explicit suggestions for uncertain reference names.
- [x] Category-option compatibility and legacy fingerprint preservation.
- [x] Parser/normalization and UI safeguard tests, build and sample verification.

## Using the feature

Open **Maintenance → Add books from Excel/CSV** and choose a book list. Recognized headings include Book Name, Writer, Quantity, Category and Shelf. The green cleanup summary shows how many entries changed; expand **See what was corrected** for original and cleaned values. Longer lists have **Show more corrections**.

Extra spaces are removed from ordinary metadata. ISBN prefixes, dashes and spaces are normalized without altering digits or inventing a valid check digit. Values such as `003.00` become `3`; fractional counts, scientific expressions, comma-separated numbers and unknown quantities remain questions. Accession numbers and barcodes keep leading zeros, internal spaces and line separators.

Category and shelf columns match one existing active name after case, space and Unicode normalization. Unmatched or ambiguous names cannot fall back silently to an unrelated default. Near matches appear as optional **Use …** buttons; selecting one changes only the review form. **Save this choice** saves the review, and the final **Add … copies** action creates catalog entries. Duplicate/overlap decisions still require the librarian. The original file is not modified, and old import fingerprints remain compatible.

## Verification and limits

- Focused tests: 15 backend cleanup/parser tests and 32 frontend import/selected-file-preview tests. Includes original cells, missing facts, invalid ISBNs, preserved identifiers, ambiguous headers/numbers/references, archived choices, legacy fingerprints, explicit suggestions, long correction histories, duplicate decisions and resumable saves.
- API TypeScript and frontend production build passed. The existing main-bundle size warning remains.
- Restarted the local API and checked `/api/health`: healthy, schema ready. Read-only public options returned four categories with `id,name,status,version`, all Active. No hosted database writes were used for these checks.
- Browser verification used the real import components with server-parser-generated disposable CSV data and in-memory API replacements. Verified two entries/five copies, one unresolved category/shelf question, explicit suggestion selection, saved review and final Add completion. The fresh sample had no console errors. A React root warning during fixture hot reload was confined to the disposable test harness and disappeared after a fresh reload.
- Desktop and 390 × 844 phone layouts were checked, including dark mode. Phone document width did not exceed 390 px; suggestion controls were 44 px high. Screenshots are in ignored `output/book-import-cleanup-20261017/`: `cleanup-summary.png`, `review-desktop.png`, `review-mobile.png` and `review-dark-mobile.png`.
- Removed the temporary parser/HTML/TSX fixtures, sample CSV/JSON and browser tab; restored browser viewport. Evidence screenshots remain. School holdings and account/history records were not changed. No migration was applied and nothing was pushed or deployed.
- Limits: sample browser saves used memory, not a live database acceptance test or physical phone. Existing server permissions, reference revalidation and copy-conflict checks remain authoritative. Existing saved batches are reused rather than silently rewritten with new cleanup history.

## Change log

- 2026-10-17: Owner approved automatic cleanup. Applied Postgres remains 027; draft 028 is unapplied; MySQL reference 048 / next 049 remain unchanged. No migration or real holdings import is planned.
- 2026-10-17: Built normalization, immutable correction history, column aliases, exact reference recognition, explicit near-match suggestions, cleanup review and category-option compatibility. Verified focused tests/build, public options and isolated desktop/mobile sample flow.
