# Stocktake Sessions: Spec

| Field | Value |
| --- | --- |
| Roadmap | `docs/roadmap.md`, "Stocktake sessions" row |
| Status | `approved` by Ethan on 2026-11-12 with the recommended answers to Q1 to Q4 |
| Date created | 2026-11-12 |
| Date last updated | 2026-11-12 |
| Approved source | STI ILMS REA `docs/specs/stocktake.md` (approved 2026-11-10) and its answers in REA `docs/spec-decisions.md` |
| Existing build | Draft PR #2 (`feat/stocktake-sessions`); its rules are in `docs/stocktake-sessions-discrepancy-implementation-plan.md` on that branch |
| Build plan | `docs/stocktake-sessions-postgres-port-plan.md` |
| Migration | None. Tables come from `018_stocktake_sessions.sql` (on `main` and live). Next unused number stays `037`. |

This spec says what stocktake must do in StiOrmocLibrary. It takes the REA spec's rules (R1 to R12, AC1 to AC4, E1 to E7) and states, for each one, what PR #2 already does and what changes. Where PR #2 is stricter than REA (frozen expected list, reviewed findings, no silent item changes), PR #2's behavior stays, because REA's spec allows it and it keeps an audit trail.

## Purpose

The library counts its shelves from time to time. A count must show which items were expected, which were found, which are missing, which sit on the wrong shelf, and which have a status that does not match what is on the shelf (lost, borrowed, archived). Staff must be able to fix or dismiss each problem with a reason, and export the list.

## Terms

- **Session:** one count (REA "InventoryRun"). Status `in_progress`, `closed`, `reviewed` or `cancelled`.
- **Scope:** what the count covers: one shelf, one category, one room (an area on the published floor plan) or the whole collection; for books, research items or both.
- **Expected item:** an item in scope when the session started. The list is frozen at start.
- **Scan:** one barcode entry, from a scanner or typed. Every scan is kept, including unknown and repeated barcodes.
- **Finding:** a problem written when the session closes (REA "problem").

## Actors and permissions

REA gives the stocktake to Library Staff and settings to the Librarian. On StiOrmocLibrary `main`, Librarian holds `library.manage` and Librarian plus Staff hold `desk.operate`; Admin only manages accounts. PR #2 allows only the Librarian.

| Action | Librarian | Staff | Admin, Student, Faculty |
| --- | --- | --- | --- |
| Start, scan, close, cancel a session; view sessions, scans and findings; export CSV and PDF | Yes | Yes (Q1) | No (403) |
| Resolve a finding that changes an item record (condition, availability) and mark a session reviewed | Yes | No | No (403) |
| Dismiss a finding with a reason | Yes | No (Q1) | No (403) |
| Not signed in | 401 on every route (AC4) | | |

## Rules

| REA rule | What StiOrmocLibrary does | Source |
| --- | --- | --- |
| R1 Barcode must match an item | A scan resolves the barcode against active books (`physical_copies`) and research items (`research_inventory`). A barcode that matches nothing is kept as an `unknown` scan and becomes a finding at close. It does not reject the scan, so the shelf record stays complete. | PR #2 |
| R2 Wrong place | Each scan records the shelf it was seen on. An item seen away from its home shelf gets `wrong_location`. An item outside the session's scope gets `out_of_scope`. | PR #2; REA decision "flag wrong-shelf scans" |
| R3 Lost item found becomes available | A scanned item marked lost gets `lost_but_found`. Its status does **not** change at scan or close. The Librarian resolves the finding (`apply_condition` / `apply_availability`), which writes the normal inventory audit event. **Q2** | PR #2 (differs from REA: no automatic change) |
| R4 Checked out | A scanned item with an open loan gets `borrowed_but_found`. An expected, unscanned item with an open loan gets `borrowed_out`, not `missing`. Circulation stays the source of loan state; stocktake never closes a loan. | PR #2 |
| R5 Missing | An expected item not scanned and not on loan gets `missing` at close. Close never marks an item lost. | PR #2 |
| R6 Export | CSV and PDF of the frozen findings, using the existing report helpers. CSV cells are guarded against formula injection. Fixed columns: barcode, accession number, title, home shelf, seen shelf, finding, status, resolution. | PR #2 |
| R7 Permission | See "Actors and permissions". | This spec |
| R8 Last seen | Every scan of a known book or research item records a `Verified` inventory audit event, so the item's last-verified time is the scan time. | PR #2; test S6 |
| R9 Lost refund | **Q2.** Recommended: not in v1. Resolving `lost_but_found` shows a note that any lost-book charge must be handled in Fines. Refunds come with the lost-items feature (REA lost-items answer 2). | This spec |
| R10 Shelf order check | Dropped for v1 (REA default is off). | This spec |
| R11 Skip withdrawn | Archived items are not expected. An archived item that is scanned gets `archived`. | PR #2 |
| R12 Filter problems | The findings list filters by finding code and status (`open`, `resolved`, `dismissed`, `blocked`). Codes: `missing`, `wrong_location`, `out_of_scope`, `unknown`, `duplicate`, `lost_but_found`, `known_lost`, `borrowed_but_found`, `borrowed_out`, `archived`. | PR #2 |

Extra rules from PR #2 that stay:

- The expected list is frozen at start. Items added or moved later show up as findings, never as new expected items.
- Only an `in_progress` session takes scans. Closing twice returns the same findings. A closed session is never reopened; recount with a new session.
- A session becomes `reviewed` only when every finding is resolved or dismissed. Every resolution needs a reason and writes an append-only resolution event.
- Each scan carries a request key, so resending the same scan after a network error does not count it twice.
- An item with stocktake history cannot be hard-deleted; it takes the archive path.

## Settings

REA lists three settings. None are needed in v1: shelf order is dropped (R10), lost items are always flagged, and the CSV columns are fixed (R6). **Q3** if the Librarian wants any of them.

## Workflows

**W1 Run a count.** Staff open Inventory, then Stocktake, and start a session: name, scope, books, research or both. The session shows the expected count. In the scan view they pick the shelf they are standing at, then scan (or type) barcodes. Each scan shows its result at once (present, wrong shelf, out of scope, unknown, already scanned, lost, borrowed). They close the session; the findings list appears and can be exported.

**W2 Review.** The Librarian opens a closed session, filters findings, and resolves or dismisses each one with a reason. When none are open, they mark it reviewed.

REA W1 also allows uploading a barcode file. **Q4** (recommended: defer; PR #2 has scanner and manual entry only).

## Acceptance criteria

| # | Given / when / then | Test |
| --- | --- | --- |
| AC1 | Given an item whose home is shelf A, when it is scanned with shelf B selected and the session closes, then it has a `wrong_location` finding. | S1 |
| AC2 | Given an item marked lost, when it is scanned, then the scan result and the close findings show `lost_but_found`, and the item stays lost until the Librarian resolves the finding. Resolving with `apply_condition` makes it available and writes an inventory audit event. | S2 |
| AC3 | Given 3 expected items and 1 scanned, when the session closes, then the 2 unscanned items are `missing` (or `borrowed_out` if on loan). | S3 |
| AC4 | Given no sign-in, when any stocktake route is called, then 401. Given Student, Faculty or Admin, then 403. | S4 |
| AC5 | Given a Staff account, start, scan, close and export work; resolve and review return 403. (If Q1 is answered "Librarian only", Staff get 403 everywhere.) | S5 |
| AC6 | Given a known item is scanned, then its last-verified time is the scan time. | S6 |
| AC7 | Given the same request key is sent twice, then one scan is stored and the second call returns the first result. | S7 |
| AC8 | Given a session that is closed, when a scan is sent, then 409 and nothing is stored. | S8 |

PR #2 already has service tests for most of S1, S2, S3, S7 and S8. The build checks each one exists and adds the missing ones first.

## Edge cases

| REA | What happens |
| --- | --- |
| E1 Empty input | An empty barcode returns `422 STOCKTAKE_VALIDATION_FAILED` and stores nothing. |
| E2 Invalid barcode | Same `422`; the field error names the barcode. |
| E3 Barcode matches several items | A book and a research item can share a barcode when the session covers both. The scan is stored with no resolved item and the reply lists both matches; the finding at close is `unknown` with both in its evidence. **Check in the build**: if PR #2 does something else, report before changing it. |
| E4 Already scanned | Stored again and flagged `duplicate`; the reply says "Already scanned in this session". |
| E5 Scope has no items | A room with no placed shelves cannot be started (422). An empty shelf, category or collection can be started and closed with zero items. |
| E6 Network error | No automatic retry. The request key makes a manual resend safe (AC7). |
| E7 Export fails | 500 with the standard error body; the session is unchanged. |

## Out of scope for v1

RFID, a mobile app (a phone browser with a scanner works), shelf order checking, stocktake settings, lost-fee refunds, barcode file upload (unless Q4 says otherwise), `/api/v1` JWT routes for stocktake.

## Open questions for Ethan

Answered 2026-11-12: Ethan accepted every recommendation below (Staff run and export, Librarian resolves and reviews; lost items flagged with no refund in v1; no settings; no file upload).

1. **Q1 Staff access.** REA lets Library Staff run the count. Recommended: Staff can start, scan, close and export; only the Librarian resolves, dismisses and marks reviewed, because those change item records. Alternative: keep PR #2's Librarian-only access.
2. **Q2 Lost item found.** REA changes the item to available at once and refunds the lost fee. Recommended: keep PR #2's way (flag it, the Librarian resolves it with a reason) and no refund in v1, since StiOrmocLibrary has no lost-fee refund yet.
3. **Q3 Settings.** Recommended: no stocktake settings in v1.
4. **Q4 Barcode file upload.** Recommended: defer. Scanner and typed entry cover a single-campus count.

## Change log

| Date | Change |
| --- | --- |
| 2026-11-12 | Approved by Ethan with the recommended answers to Q1 to Q4. |
| 2026-11-12 | Spec drafted from REA `stocktake.md`, REA `spec-decisions.md` and PR #2. Status `draft`. |
