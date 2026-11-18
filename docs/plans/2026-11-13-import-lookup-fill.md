# Fill missing book details in an Excel or CSV import from the book lookups

| Field | Value |
| --- | --- |
| **Date created** | 2026-11-13 |
| **Date last updated** | 2026-11-13 |
| **Status** | `built` |
| **Branch** | `feat/book-register` (builds on its lookups) |
| **Supabase migration** | none (filled values live in `catalog_import_rows.data_json`) |

## Why

The library already keeps book records in spreadsheets. "Add books from Excel or CSV" (Holdings import) loads them, but many rows have gaps: no publisher, no year, sometimes no title or author when the ISBN is known. Ethan wants the import to fill those gaps from the book lookups (Google Books, Open Library), with the Librarian checking every filled value before the book is saved.

## What exists today

- Upload → choose sheet, header row and column mapping → rows are staged in `catalog_import_rows` with status `Review`.
- Each row is opened, checked and saved with a decision (`new`, `add`, `link`, `reuse`, `skip`), which makes it `Ready`. Only `Ready` rows are committed, 10 at a time.
- The mapping requires Title, Author and Copies columns. A row needs a title and an author to be saved.

## The library's file (checked 2026-11-13)

`LIBRARY HOLDINGS CHED FINAL - SUMMARIES AND GLOSSARY REFERENCES.xlsx` (not committed):

| Sheet | Header row | Book rows | Usable ISBN | Missing publisher / year / ISBN |
| --- | --- | --- | --- | --- |
| GE BOOKS | 4 | 493 | 319 | 61 / 100 / 174 |
| SHS BOOKS | 4 (+ row 5) | 58 | 40 | 3 / 3 / 18 |
| CHED HRM | 6 (+ row 7) | 662 | 582 | 4 / 3 / 45 |
| CHED TM | 6 (+ row 7) | 187 | 171 | 3 / 4 / 12 |
| IT BOOKS | 4 (+ row 5) | 254 | 199 | 0 / 1 / 55 |

About 1,650 titles. Findings that shape the change:
- Every row has a title and an author; the gaps are ISBN (about 300), year (about 110), publisher (about 70) and edition (about 470, which the lookups rarely know).
- **Placeholders:** GE BOOKS writes "Not verified" in empty publisher, ISBN and year cells; editions use "-". Today these are kept as values (a year of "Not verified" fails the check). They must count as blank, so the lookup can fill them.
- **Accession numbers are blank on every sheet**, so the import's generated numbers are used.
- Section rows ("LANGUAGE", "FILIPINO", "HRM-2019 Acquisitions") and the second header line are already skipped by the parser.
- Copies are in "CPS.", "COPIES", "Copies" and a two-line "NO. OF / COPIES": the mapping picks the column, as today.
- Each sheet has an "ABSTRACT / SUMMARY" column the catalog could keep as the synopsis (`catalog_title_details.synopsis`), plus research notes ("MATCH STATUS", "RESEARCH STATUS") that are not book data.
- The file has none of the register columns (date received, class, fund, cost).

## How

### 1. Fill from the lookups (API)

- New `POST /api/v1/admin/catalog/imports/:id/fill-from-lookup` (Librarian, same guard as the other import routes).
- It takes up to **50** `Review` rows of the batch that still have a gap and were not filled before, one after another:
  - A row **with a valid ISBN** uses the ISBN lookup (local catalog first, then the providers).
  - A row **without an ISBN but with a title** uses the title lookup and takes a result only when its title is the same as the row's title (ignoring case and punctuation) and, if the row has an author, the author matches too. Otherwise it is left alone.
- Only **empty** fields are filled: title, author, ISBN, publisher, publication year (the lookups do not return pages). A value the spreadsheet has is never replaced.
- Placeholders count as empty, both when staging and when filling: "Not verified", "Not located online", "N/A", "none", "-" and "—" (whole cell, any case). They are recorded as cleanup corrections, like the import's other formatting fixes.
- Each filled field is recorded in the row's data as `lookupFilled: { field: { value, source } }`, plus `lookupCheckedAt: null`. Rows with nothing found are marked as tried, so they are not looked up again.
- The answer says how many rows were filled, not found and still waiting, so the page can offer "Fill the next 50".
- Lookups go through the existing service, so the 10-minute cache and the provider order apply. Google Books' daily quota (1,000 requests on the default plan) is why it runs 50 rows per click instead of the whole file: this file needs about 450 rows filled, so about 9 clicks.

### 2. Librarian checks the filled values (web)

- The import page gets a "Fill missing details from book lookup" button with the count of rows that have gaps.
- In each row, a filled field shows its value with a "From Google Books" or "From Open Library" tag and stays editable.
- A row with filled values cannot be saved until the Librarian ticks **"I checked the details filled from the book lookup"**. Saving records `lookupCheckedAt` and who checked, in the row data. The existing save is unchanged for rows without filled values.
- The server enforces the tick: `PUT /imports/rows/:id` refuses a row with unchecked filled values (`409 LOOKUP_NOT_CHECKED`).

### 3. Mapping: let ISBN stand in for Title and Author

- The mapping requires Copies, plus Title **or** ISBN. Author becomes optional in the mapping. A row still needs a title and an author before it is saved, so the lookup (or the Librarian) must fill them.

## Open questions

1. **Register columns in the import.** The library's file has none of them. Recommended: not in this change; add them when a register spreadsheet needs importing.
2. **Batch size per click.** Recommended: 50 rows, about 9 clicks for this file, within the Google Books daily quota.
3. **Summaries.** Recommended: an optional "Summary" column in the mapping, saved as the book's synopsis (shown in the catalog details). The research-status columns are not imported.
4. **Covers for imported books.** Recommended: later; covers attach in the add-book form only.

## Implementation tracking

- [x] Ethan approves this plan with the recommended answers (2026-11-13)
- [x] Fill route and service, tests first (ISBN path, title path, only empty fields, marked as tried, 50 per run)
- [x] Review save refuses unchecked filled values
- [x] Mapping accepts ISBN in place of Title and Author
- [x] Import page: fill button, source tags, the checked tick
- [x] Placeholders count as blank when staging
- [x] Optional Summary column saved as the synopsis
- [x] Tests, live check, `security-reviewer` (no CRITICAL or HIGH; MEDIUM fixes applied)

## Change log

- 2026-11-13: Plan created from Ethan's request.
- 2026-11-13: Checked against the library's holdings file: placeholders, blank accession numbers and the summary column added; 50 rows per click; register columns not needed for this file.
- 2026-11-13: Built. Real-file check: 1,647 rows staged (144 section and header rows skipped), 287 rows had placeholders cleared, 903 have a summary; blanks left: ISBN 292, publisher 59, year 154; 52 rows have an ISBN with a wrong check digit (the import already asks for those). Live sample of 6 rows: 2 filled; local Philippine titles are often not in Google Books or Open Library, so expect a modest fill rate. The row label "Needs a lookup check" keeps filled rows in the Questions list.
- 2026-11-13: Review fixes: an ISBN taken from a title result is normalized and dropped if invalid; a title-only match without an author needs exactly one result; one click stops looking up after 20 seconds and leaves the rest waiting; editing a row clears the checked tick. Adding copies to an existing title does not change its summary.
