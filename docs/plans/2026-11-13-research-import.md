# Research import from Excel/CSV, and adding a department/program

| Field | Value |
| --- | --- |
| **Date created** | 2026-11-13 |
| **Date last updated** | 2026-11-13 |
| **Status** | `inprogress` |
| **Branch** | `feat/research-maintenance` (same page as `docs/plans/2026-11-13-research-maintenance.md`) |
| **Supabase migration** | `038_research_optional_details.sql` (not applied) |
| **Source list** | Hospitality Management research list (Ethan's file `APA FORMAT HM RESEARCH PAPER FIN.docx`, 46 papers, 2022-2025) |

## Why

Ethan wants to add research in bulk from an Excel or CSV file on the Research maintenance page, and to add a new department/program (first case: Hospitality Management).

The HM list is an APA reference list, one paper per entry:

```text
1 – 2 Alamil, B.B. et.al (2022) The impact of COVID-19 pandemic on the local employment situation ... STI College Ormoc. 2cps
81 – 82 – 83 Bargayo, K.A., et.al (2025) Securing future risk management ... STI College – Ormoc. 3cps
25 Cataros, A.J.P. et.al (2023) The effects of inflation on restaurants in Ormoc City. STI College Ormoc.
```

So each entry gives: copy numbers, authors, year, title and copy count. It has **no adviser, no abstract and no research code**.

## Decisions (Ethan, 2026-11-13)

1. **Adviser and abstract become optional.** One migration allows empty values. Pages show "Not recorded". They can be filled in later with Edit research.
2. **Copy numbers get the program code as a prefix.** HM copies 1 and 2 become `<CODE>-1` and `<CODE>-2` (for example `BSHM-1`), so other programs' lists that also start at 1 cannot clash.

Defaults chosen without asking (say if wrong):

- **Research code** is generated when the file leaves it blank: `<CODE>-<year>-<first copy number>` (for example `BSHM-2022-1`). It stays unique because copy numbers are unique per program.
- **Department/program** is picked from the existing Programs list (`catalog_programs`, which needs a name and a code). The text saved on the research record stays the program name, as today. No link table change.
- **Shelf**: one shelf location chosen for the whole import (same as the book import), overridable per row.

## How

### 1. Migration `038_research_optional_details.sql`

```sql
BEGIN;
ALTER TABLE research_records   ALTER COLUMN adviser_name  DROP NOT NULL,
                               ALTER COLUMN abstract_text DROP NOT NULL;
ALTER TABLE research_inventory ALTER COLUMN adviser       DROP NOT NULL;
COMMIT;
```

No data changes. Down: set `NOT NULL` again only if no empty rows exist.

### 2. Validation (`catalog.validation.ts`)

- `validateThesisMetadata` / `validateThesisEntry`: adviser optional (max length kept); abstract optional, but at least 20 characters when given.
- New `validateResearchImportRow`: title, authors, year, program and at least one copy number required; adviser, abstract, keywords, research code, shelf optional.

### 3. Import template (CSV and XLSX, same columns)

| Column | Required | Example |
| --- | --- | --- |
| Copy numbers | yes | `1-2`, `81-83`, `25` or `1, 2` |
| Authors | yes | `Alamil, B.B. et al.` (several authors separated by `;`) |
| Year | yes | `2022` |
| Title | yes | `The impact of COVID-19 pandemic on ...` |
| Program | yes | `Hospitality Management` or its code `BSHM` |
| Adviser | no | |
| Abstract | no | |
| Keywords | no | |
| Research code | no | generated when blank |
| Shelf | no | uses the shelf chosen for the import |

Copy count is taken from the copy numbers (`81-83` = 3 copies), so the file does not need a separate count.

### 4. API (new, Librarian only, under the existing catalog maintenance router)

- `POST /api/v1/admin/research/imports/preview` (file upload, `exceljs` for XLSX as in `holdings-parser.ts`, CSV parsed the same way): returns each row with its parsed fields and either errors or the copy numbers and research code it will get. It also lists program names that do not exist yet. Nothing is saved.
- `POST /api/v1/admin/research/imports` (JSON rows from the preview, at most 500): validates again on the server, then saves all rows in **one transaction**: `titles` + `authors` + `research_records` + one `research_inventory` row per copy (barcode generated as for single theses). Any error rolls back the whole import. Duplicate titles (same title and year in the same program) and copy numbers already used are reported per row in the preview and rejected again on save.

### 5. Web (Research maintenance page)

- **Import from Excel/CSV** button next to Add thesis. Steps: download template, choose file, choose shelf, preview table (rows needing attention first), then **Import N research titles**. Same look as the book import (`HoldingsImportPage`).
- **Department/program**: a select of active programs in Add/Edit research and in the import, plus **Add department/program** (name + code) that uses the existing `POST .../foundation/programs`. When the preview finds an unknown program, it offers to add it before importing.
- Adviser and abstract show "Not recorded" when empty: `ResearchOverview`, `PublicCatalogPage`, `ThesisInventorySection`, the research list.

### 6. One-off: convert the HM list

A script (scratch, not committed) turns the HM `.docx` into a CSV in the template format, for Ethan to check and then import. It flags entries it cannot read cleanly (for example missing copy count) instead of guessing.

## Tests (written first)

- API `node --test`:
  - copy-number parser: `1 – 2`, `81 – 82 – 83`, `25`, `1, 2`, bad input;
  - row validation: missing title/year/program, abstract under 20 characters, adviser empty allowed;
  - preview: unknown program listed, duplicate copy numbers and duplicate titles reported, nothing written;
  - import: one transaction, prefixed copy numbers, generated research code, rollback on a conflict, 500-row limit, Librarian only (supertest).
- Web Vitest: import steps, preview errors block the import button, add department/program from the import, "Not recorded" display, program select in Add/Edit research.

## Implementation tracking

- [x] Migration `038` written (applied only with Ethan's go-ahead)
- [x] Validation: adviser and abstract optional
- [x] Copy-number parser and import row validation
- [x] Preview and import endpoints
- [x] Import UI on Research maintenance
- [x] Department/program select and add
- [x] "Not recorded" display
- [ ] HM list converted to CSV for Ethan to check
- [x] Trackers updated (`.cursor/agent-protocol.md` next number `039`, `docs/schema-context.md`)
- [x] `npm test`, `npm run typecheck`, `npm run build` pass
- [ ] plan-verifier, security-reviewer, database-reviewer

## Change log

- 2026-11-13: Plan created. Ethan chose optional adviser and abstract (migration `038`) and program-code prefixes for copy numbers.
- 2026-11-13: Ethan approved the plan. Status `inprogress`.
- 2026-11-13: Built on `feat/research-maintenance` (uncommitted): migration `038` written, not applied; parser, import row validation, preview and import endpoints (`/api/v1/admin/research/imports[/preview]`), import dialog, program select and add, "Not recorded". HM list conversion and reviews still open.
