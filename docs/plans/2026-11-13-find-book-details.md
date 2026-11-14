# Find book details from a spreadsheet, download the result, and an unsaved-changes warning

| Field | Value |
| --- | --- |
| **Date created** | 2026-11-13 |
| **Date last updated** | 2026-11-13 |
| **Status** | `built` |
| **Branch** | `feat/book-register` (reuses its lookups and the import fill) |
| **Supabase migration** | none: nothing is stored; the list lives in the browser until it is downloaded |

## Why

Ethan wants the Librarian to complete a book list without adding it to the catalog: upload a spreadsheet, let the lookups fill the missing details, check them, and download the completed list as CSV or Excel. Separately, work must not be lost by accident: leaving with unsaved changes asks "Discard changes" or "Save changes".

## How

### 1. Find book details (no catalog changes)

A new tab in Maintenance, **Find book details**, next to "Add books from Excel or CSV".

1. **Upload** an XLSX or CSV. The same reader and safety checks as the import (size, macros, formulas not evaluated). The Librarian confirms which columns hold title, author, ISBN, edition, publisher, year, pages, copies and summary; no category or shelf questions. At most 5,000 rows.
2. **Fill**: "Find missing details (next 50)" sends up to 50 rows with blanks to the API, which looks each one up with the same rules as the import fill (ISBN lookup; title only on an exact title and author-surname match, or exactly one result without an author; only blanks are filled; 20-second limit per click). Placeholders such as "Not verified" count as blank.
3. **Check**: a table shows every row. Filled cells are marked with their source ("Google Books", "Open Library", "Library catalog") and can be edited. Each row has a "Checked" box; "Mark all filled rows checked" is offered only after the Librarian has looked through them, and asks for confirmation.
4. **Download**: "Download CSV" or "Download Excel" saves the list with the original columns the Librarian mapped, plus three columns: **Filled from** (field: source for each filled value), **Checked** (Yes/No) and **Row in original file**. Unchecked filled rows are still included, marked "No", and the page warns before downloading if any remain.

Nothing is written to the database: no staging rows, no catalog changes.

API (Librarian only, under `/api/v1/admin/maintenance/find`):
- `POST /find/read` (multipart file + mapping): returns the mapped rows, reusing the import parser.
- `POST /find/fill` (`{ rows: [{ id, data }] }`, at most 50): returns the filled values and sources per row. Shares the import fill's lookup logic (one function used by both). Same 6-per-minute per-account limit.
- `POST /find/export?format=csv|xlsx` (`{ rows }`, at most 5,000): returns the file. Cells starting with `=`, `+`, `-`, `@`, tab or carriage return are prefixed so spreadsheets treat them as text. XLSX is written with the API's existing ExcelJS.

### 2. Unsaved-changes warning

One shared dialog: **"You have unsaved changes"** with three buttons: **Save changes**, **Discard changes**, **Keep editing**.

Recommended places (Ethan asked for a recommendation):
1. **Find book details page**: after filling or editing, until the list is downloaded. "Save changes" downloads it (CSV by default, with a format choice in the dialog).
2. **Import review, an open book row**: edits not yet saved with "Save this choice". "Save changes" runs that save (it still needs the lookup tick where required).
3. **Add-book form**: once something is typed or filled by a lookup, closing the form or leaving the page asks first. "Save changes" submits the form.

**Rest of the Librarian portal (surveyed 2026-11-13).** Pages where typed work would be lost, by priority:

| Priority | Page | What can be lost | "Save changes" does |
| --- | --- | --- | --- |
| High | Announcements | a drafted announcement message | publishes or saves it as the form already does |
| High | Maintenance, catalog details panel | synopsis, glossary, edition, programs and courses | "Save catalog information" |
| High | Maintenance, Add research / thesis | title, authors, adviser, abstract | "Publish and generate codes" |
| High | Collection review, decision form | review findings note | "Save recommendation" |
| Medium | Categories, create or edit category | name, description, shelf | "Create category" or save |
| Medium | Fines, record payment or infraction | amount, GCash reference, details | the form's record button |
| Medium | Clearance, override or replacement payment | reason, amounts | the form's record button |
| Medium | Users, create Staff account | account details | "Create Staff account" |
| Medium | Users, Enrollment | semester settings | "Save semester" |
| Medium | Attendance, library operations | cutoff time, events | "Save cutoff" or "Save event" |
| Low | Inventory, mark lost or remove copy | reason | the dialog's submit |
| Low | Profile | name and profile details | "Save my profile" |

Left out: search boxes and report filters (nothing to lose), sign-in pages, and short confirm dialogs. Two editors exist in the code but no page uses them (the old floor-plan layout editor and the invoice setup page), so they get nothing. The floor-plan editor's own tab-close warning stays as it is.

In every place, "Save changes" runs that form's own save button, with its own checks; if the save fails, the dialog closes and the form shows the error, and nothing is discarded.

It triggers on: clicking a menu link or any other in-app link, the browser back button, closing the form or row, and closing or reloading the browser tab (the browser shows its own standard question there, because browsers do not allow custom buttons on tab close).

The app uses `BrowserRouter`, so React Router's `useBlocker` is not available; the guard listens for in-app link clicks and the back button itself, as the floor-plan page already does for tab close.

## Open questions

1. **"Mark all filled rows checked".** Recommended: offer it, with a confirmation, for long lists. Alternative: tick each row one by one.
2. **Excel file style.** Recommended: one sheet named "Book details", a bold header row, filled cells highlighted in light blue with the source in a cell comment.

## Implementation tracking

- [x] Ethan approves this plan (2026-11-13): High and Medium pages; open questions take the recommended answers
- [x] Shared lookup-fill function used by the import and the find page
- [x] `/find/read`, `/find/fill`, `/find/export` with tests (limits, formula guard, no database writes)
- [x] Find book details page: upload, mapping, fill, check, download
- [x] Unsaved-changes dialog and guard (links, back button, tab close)
- [x] Guard on the find page, import row and add-book form
- [x] Guard on the High and Medium pages above
- [x] Tests, `security-reviewer` (no CRITICAL; HIGH and MEDIUM fixed)

## Change log

- 2026-11-13: Plan created from Ethan's request; he chose "look up a file, download it" and asked for a recommendation on where the warning appears.
- 2026-11-13: Surveyed the Librarian portal for other forms that need the warning (Ethan's request); table added.
- 2026-11-13: Ethan chose the High and Medium pages; building started.
- 2026-11-13: Built. Review fixes: Back after Discard works when the page was opened in a new tab (it stays); file links (/api/...) and same-page anchors never ask; leaving discards every open form on the page, while a save stays if another form still has changes; a wrapped form counts as saved only when its page shows a new success message (role="status") or the form closes, so a refused save keeps the warning; Excel cells keep their text with no apostrophe (CSV keeps the formula guard); a list over 5,000 books asks to be split; reading and downloading are limited to 20 a minute per account. Export downloads all find-page columns rather than only the mapped ones. Known limit: navigation done by code without a link (for example after a button action) is not intercepted.
