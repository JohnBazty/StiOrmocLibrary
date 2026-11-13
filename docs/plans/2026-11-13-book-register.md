# Book register, copy cost and title lookup (ported from STI ILMS REA)

| Field | Value |
| --- | --- |
| **Date created** | 2026-11-13 |
| **Date last updated** | 2026-11-13 |
| **Status** | `inprogress` |
| **Branch** | `feat/book-register` (from `main`) |
| **Supabase migration** | `037_book_register.sql` (draft, not applied) |
| **Source** | STI ILMS REA (Ethan's repo): bibliographic records, items, books received, ISBN lookup and title lookup. Code is ported and adapted to this repo's tables; nothing comes from Koha. |

## Why

Ethan wants the library's accession register in this app, as STI ILMS REA has it: one row per copy with
No. (accession), Date received, Class, Author, Title, Edition, Volumes, Pages, Source of fund, Cost price, Publisher, Year and Remarks.
He also wants REA's title lookup (search Open Library and Google Books by title and author) next to the ISBN lookup this repo already has.

Decision (Ethan, 2026-11-13): **cost price and date received are stored per copy**, as in REA, because copies of one title can be bought at different times for different prices.

## What exists today

| Register column | Today | Change |
| --- | --- | --- |
| No. | `physical_copies.accession_number` (text, staff-entered) | Keep |
| Date received | `physical_copies.acquired_at` | Keep; show as "Date received" |
| Class | missing (`titles.call_number` only) | Add `titles.classification` |
| Author | `authors` table | Keep |
| Title | `titles.title` | Keep |
| Edition, Pages | `catalog_title_details.edition`, `page_count` (migration 021) | Keep; the add-book form now fills them for a new title |
| Volumes | missing | Add `titles.volumes` |
| Source of fund | missing | Add `physical_copies.fund_source`, `fund_detail` |
| Cost price | `titles.purchase_price` (per title) | Add `physical_copies.cost_php`; backfill from the title price |
| Publisher, Year | `titles.publisher`, `titles.publication_year` | Keep |
| Remarks | missing | Add `titles.remarks` |

ISBN lookup already exists (`catalog/isbn-lookup.service.ts`, Google Books and Open Library, 10-minute cache). Title lookup does not exist.

## How

### 1. Migration `037_book_register.sql` (one transaction)

```sql
ALTER TABLE titles
  ADD COLUMN IF NOT EXISTS classification TEXT CHECK (classification IS NULL OR char_length(classification) BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS volumes        TEXT CHECK (volumes IS NULL OR char_length(volumes) BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS remarks        TEXT CHECK (remarks IS NULL OR char_length(remarks) BETWEEN 1 AND 2000);

ALTER TABLE physical_copies
  ADD COLUMN IF NOT EXISTS fund_source TEXT CHECK (fund_source IS NULL OR char_length(fund_source) BETWEEN 1 AND 60),
  ADD COLUMN IF NOT EXISTS fund_detail TEXT CHECK (fund_detail IS NULL OR char_length(fund_detail) BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS cost_php    NUMERIC(9,2) CHECK (cost_php IS NULL OR cost_php BETWEEN 0 AND 999999.99);

-- Backfill: each existing copy takes its title's price; titles.purchase_price stays for old readers.
UPDATE physical_copies pc SET cost_php = t.purchase_price
  FROM titles t WHERE t.title_id = pc.title_id AND pc.cost_php IS NULL AND t.purchase_price IS NOT NULL;
```

Text columns, as in REA: "xii, 340 p." and "2 vols." are not numbers. `schema-readiness.ts` gains the new columns. Update `docs/schema-context.md` and the migration tracker.

### 2. Add-book API and form

- The add-book form (`AddMultipleCopiesModal`) posts to `POST /api/v1/admin/catalog/bulk-entry`, so that path carries the fields. `validateBulkBookInput` accepts `classification`, `edition`, `pages`, `volumes`, `remarks` (title) and `fund_source`, `fund_detail`, `cost_php`, `received_on` (copy). Too-long text is refused, not cut; cost 0 to 999999.99 with at most 2 decimals; date received a real date, not after today in Manila.
- A new title stores class, volumes and remarks on `titles`, and edition and pages in `catalog_title_details`. Adding copies to an existing title leaves its details alone. Fund, cost and date received go on every copy of the entry.
- The form has a "Book register" group with these fields. Editing an existing title's register fields, the holdings import and `POST /api/catalog/books` (no UI) are not changed in this round.

### 3. Register screen (REA "Books received")

- `GET /api/v1/admin/catalog/register`: one row per active book copy joined to its title and authors. Filters: date received from/to, "date unknown" only, fund source, "no fund source". Sort: accession, date received, title, cost; ascending or descending; unknown values last. Paged, at most 100 rows a page. Parameterized SQL only.
- `GET /api/v1/admin/catalog/register.csv`: the same filters (at most 20,000 rows), the 13 columns, for printing or Excel.
- Web: a Librarian page "Book register" with the 13-column table, filters and CSV export. STI color tokens only.

### 4. Lost charge uses the copy's cost

`main` does not read a book price for lost charges yet, so this branch changes nothing there. `fix/lost-book-price` (PR #27) reads `titles.purchase_price`; when both are merged, the lost charge should read `COALESCE(pc.cost_php, t.purchase_price)`, so the price of the lost copy wins. Whichever PR merges second carries this change.

### 5. Lookups

- **ISBN lookup:** keep this repo's service; it already answers from the local catalog first. Added: a per-account limit of 30 lookups a minute, shared with title lookup.
- **Title lookup:** `GET /api/v1/admin/books/title-lookup?title=&author=` (same guard as the ISBN route): validate input (title 2 to 200 characters), search Open Library and Google Books (at most 10 candidates, same provider order as the ISBN lookup), mark candidates whose ISBN is already in `titles`, and list up to 10 local titles containing the text. Saves nothing. Tests inject `fetch` and never touch the network.
- Web: `TitleLookup.tsx` in the add-book form; "Use this" fills title, author, publisher, year and ISBN, without a second ISBN lookup overwriting them.

## Open questions

1. **Source of fund values.** REA picks from an editable lookup list; this repo has none. Recommended: a fixed list in code (for example Purchase, Donation, Government grant, Other) plus the free-text `fund_detail`. Answered (Ethan, 2026-11-13): Purchase, Donation, Government grant, Other.
2. **"Date unknown".** REA stores an explicit "date received unknown" flag. Recommended: skip it; an empty `acquired_at` means unknown.
3. **Accession number.** Answered by the code: the add-book form already generates `STI-ACC-YYYY-NNNNNN` numbers; kept as they are.

## Implementation tracking

- [x] Ethan approves this plan (2026-11-13)
- [ ] JohnBazty agrees to the change
- [x] Migration `037` with PGlite test; schema readiness, schema context, tracker (next unused `038`)
- [x] Add-book API and validation (tests first)
- [x] Add-book form fields
- [x] Register API and CSV export
- [x] Register page (`/librarian/book-register`)
- [ ] Lost charge reads copy cost (nothing on `main`; carry into PR #27 or this PR, whichever merges second)
- [x] ISBN lookup rate limit
- [x] Title lookup API and UI
- [x] `security-reviewer`, `database-reviewer` (no CRITICAL or HIGH); MEDIUM fixes applied
- [ ] `plan-verifier` (project agent; run from a StiOrmocLibrary session)
- [x] `titles.purchase_price` is the price of one copy (Ethan, 2026-11-13), so the `037` backfill is correct
- [ ] Status `built`

## Change log

- 2026-11-13: Plan created. Ethan chose per-copy cost price and date received.
- 2026-11-13: Ethan approved with the recommended answers; building started. Edition and pages reuse `catalog_title_details` (021) instead of new `titles` columns, so `037` adds only class, volumes and remarks to `titles`. The add-book form's real path is `bulk-entry`, which already generates accession numbers. Lost charge needs no change on `main`. `037` drafted; next unused `038`.
- 2026-11-13: Reviews done, no CRITICAL or HIGH. Fixed: `037` lock timeout and a notice for prices it cannot copy; CSV guard also covers a leading tab or carriage return; title results clear when the title or author changes; register loading state; distinct "Use" button names. Open: confirm `purchase_price` is per copy; CSV export stops at 20,000 rows.
- 2026-11-13: Ethan confirmed `titles.purchase_price` is a per-copy price, and renamed the fund source "School fund" to "Purchase" (list: Purchase, Donation, Government grant, Other).
