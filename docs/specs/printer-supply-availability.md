# Printing stops for a configuration when a required supply reaches zero

Sources: [docs/maps/printer-supply-availability.md](../maps/printer-supply-availability.md); Final Draft "Printing Service Request" and "Printing Supplies Asset Management". Reference only, clean-room.
Status: draft (awaiting JohnBazty's approval, GATE 1)

- **Date created:** 2026-11-10
- **Date last updated:** 2026-11-10

## Purpose

The Final Draft says the system "auto-triggers printer offline status warnings when consumables reach zero" and alerts users when printing is "disabled due to stock deficits". Today only the Librarian's manual switch can stop requests, so students can submit a Colored job when no ink is left or a Long job when no Long paper is left.

**Reconciling the Final Draft with this repo.** Migration 027 removed printers from the active workflow: ink and paper are shared stock, and a deployment with zero printer rows must keep working. So this spec does not change any `printers` row. Instead, the thing that becomes unavailable is a **print configuration** (print type + paper size) whose required supply is at zero. With one shared printer, as at STI Ormoc, this is the same thing the Final Draft describes. This interpretation is open question Q1.

## Actors & permissions

| Actor | Can |
| --- | --- |
| Student, Faculty | See which configurations are available and why one is not; are refused when they quote or submit an unavailable configuration. |
| Admin (the Librarian) | Everything above; receives a notification when a required supply reaches zero; turns the zero-stock block on or off (Q2); keeps the existing manual service switch. |
| System | Works out availability from current stock on every read. Stores no availability flag. |

The server enforces all of this; the web app only displays it.

## Entities

| Entity | Fields used | New or existing |
| --- | --- | --- |
| `ink_repository` | `color_variation` (Cyan, Magenta, Yellow, Black), `available_bottles` (unopened bottles, integer ≥ 0). `printer_id` ignored. | Existing, unchanged |
| `bond_paper_stocks` | `paper_size_dimension` (Short, A4, Long), `unopened_reams` (integer ≥ 0) | Existing, unchanged |
| `printing_service_settings` | `accepting_requests`, `unavailable_reason` (existing). **New:** `block_on_zero_stock` boolean, not null, default true (only if Q2 is accepted). | Existing; one new column |
| `notifications` | One row per Admin when a required supply falls to its low threshold, and again when it reaches zero, with a dedupe key per stock movement | Existing table, two new message kinds |
| Supply availability (derived, not stored) | For each configuration: `print_type`, `paper_size`, `available` boolean, `missing` list of supplies (for example `Ink: Black`, `Paper: Long`) | New, computed |

`printers` and `print_requests.printer_id` are not read or written.

## Workflows

**Student submits a request**
1. The printing page loads service status. It shows each configuration's availability; unavailable ones are disabled with the reason (for example "Colored is out: no Cyan ink in stock").
2. The student uploads a file and asks for a quote. The server checks the manual switch first, then the configuration's supplies. If unavailable, it refuses (see Edge cases).
3. On submit the server checks again, so a stock change between quote and submit is caught.

**Librarian records stock going down**
1. The Librarian records "load one ink bottle", "open one ream" or an "Issued" movement, as today.
2. If that movement takes a required supply from above its low threshold to at or below it, the same transaction adds a "low stock" notification for every active Admin. If it takes the supply from one or more to zero, it adds an "out of stock" notification instead: which supply is at zero and which configurations are now unavailable.
3. From that moment, new quotes and submits for those configurations are refused.

**Librarian restocks**
1. The Librarian records a restock or an "Added" movement, as today.
2. Availability returns at once, because it is worked out from stock. No manual step.

**Librarian turns the block off** (only with Q2)
1. On the printing service settings, the Librarian turns off "Stop requests when a required supply reaches zero" (for example when the loaded bottle still has ink but no unopened bottle is left).
2. Zero stock then only shows a warning to the Librarian; students can submit.

## Business rules

- **R1. Required supplies.** A Monochrome configuration needs Black ink and paper of its size. A Colored configuration needs Cyan, Magenta, Yellow and Black ink and paper of its size.
- **R2. Stock of a supply.** An ink color's stock is the sum of `available_bottles` across every ink row of that color, whatever its cartridge type or printer. A paper size's stock is its `unopened_reams`.
- **R3. Untracked supply does not block.** If no ink row exists for a color, or no paper row for a size, that supply is "not tracked" and does not make a configuration unavailable. (Keeps a fresh deployment with no stock rows working. Q3.)
- **R4. Zero blocks.** A configuration is unavailable when any required, tracked supply has stock 0 and the zero-stock block is on.
- **R5. Manual switch wins.** When `accepting_requests` is off, every configuration is unavailable for the manual reason; supply checks add nothing. (Existing behavior kept.)
- **R6. Quote and submit both check.** Quote and submit refuse an unavailable configuration with `422 PRINT_SUPPLY_UNAVAILABLE` and a message that names the missing supplies. Submit re-checks even if the quote passed, and does so inside the same transaction as the request insert, reading the settings row and the required stock rows with a lock that waits for any stock movement in progress. So a request is never created after its last required unit was taken.
- **R7. Existing requests are not touched.** Requests already Pending, Printing or Ready for Pickup keep their status and price. The Librarian can still record payment and move them through the queue. (Same as CUPS keeping queued jobs when a printer stops.)
- **R8. Automatic recovery.** When stock of every required supply is above zero again, the configuration is available on the next read. No stored flag to reset.
- **R9. Service status shows the reasons.** `GET /service-status` (user and admin) adds a list of all six configurations with `available` and `missing`. Students see only supply names and configuration names, never stock counts or costs.
- **R10. Low and out-of-stock alerts.** A stock movement that takes a required, tracked supply from above its low threshold to at or below it (but above 0) creates one "low stock" notification for each active Admin; one that takes it from ≥ 1 to 0 creates one "out of stock" notification for each active Admin instead. Both are written in the same transaction as the movement. A movement that stays on the same side of the threshold, stays at 0, or goes up creates none. The dedupe key per movement stops duplicates. For an ink color with several rows, the threshold is the lowest `low_stock_threshold_bottles` among its rows. (Final Draft: "low-ink triggers when thresholds are breached".)
- **R11. Low-stock flags unchanged.** The existing low-stock flags (`is_low`, thresholds) on the supplies screen stay as they are; R10 only adds the alert, and R4 is a separate, stronger level.
- **R12. Block setting** (only with Q2). When `block_on_zero_stock` is off, R4 and R6 do not refuse; R9 still reports `missing` so the Librarian sees the warning, and R10 still notifies. Changing it is Admin-only.

## Configuration

| Setting | Who | Default |
| --- | --- | --- |
| Accept print requests (existing) | Admin | On |
| Stop requests when a required supply reaches zero (new, Q2) | Admin | On |

## Edge cases & errors

| Code | HTTP | Message (example) | When |
| --- | --- | --- | --- |
| `PRINTING_UNAVAILABLE` | 422 | The manual reason, or "Printing requests are temporarily unavailable." | Existing: manual switch off (R5). |
| `PRINT_SUPPLY_UNAVAILABLE` | 422 | "Colored printing on Long paper is unavailable: no Cyan ink and no Long paper in stock." | R4/R6 at quote or submit. |

- Two ink rows of the same color, one at 0 and one at 2: stock is 2, available (R2).
- Stock drops to 0 between quote and submit: submit refuses (R6); the student re-chooses.
- The Librarian moves a Pending job to Printing while its supply is at 0: allowed (R7); the Librarian knows the real printer.
- A restock and a drop to 0 happen at once: both lock the same stock row today, so they run one after the other; availability reads whatever is committed.
- The last Long ream is opened while a student submits Long: the submit's check waits for the movement (R6), so either the request was committed first or it is refused.
- A deployment with no printer, ink or paper rows: everything is untracked, every configuration is available (R3).
- Paper row exists for Short and A4 only: Long is untracked, not blocked (R3).

## Security & privacy

- All checks run on the server; a client that ignores the disabled options is refused by R6.
- Students see supply names only, not quantities, costs or who restocked (R9).
- The new setting and stock movements stay Admin-only and CSRF-protected like the rest of the module.
- Parameterized SQL; the notification is written in the same transaction as the stock movement.

## Out of scope for v1

- Changing any `printers` row, or bringing printers back into the request flow.
- Reading ink or paper levels from printer hardware (SNMP, IPP markers).
- Estimating ink left inside an opened bottle or sheets left in an opened ream.
- Working out which colors a document actually uses.
- Notifying students who already have pending requests (Q4).
- Cancelling, holding or re-pricing existing requests.
- Per-printer maintenance; "under maintenance" stays the existing manual switch.
- Push or real-time sockets: students see availability when the printing page loads or refreshes.

## Open questions

- **Q1. Configuration instead of printer.** The Final Draft says "printer becomes unavailable"; this repo has no printer in the workflow. *Recommended:* make the print configuration unavailable (this spec), and say so in the Final Draft reconciliation. With STI Ormoc's single printer the effect is the same.
- **Q2. Zero unopened stock versus empty.** Stock counts unopened bottles and reams, so zero may happen while the loaded bottle or open ream still works. *Recommended:* block by default (the Final Draft requires it) and add one Admin setting to turn the block off (one new column, the next Supabase migration from the tracker).
- **Q3. Missing stock row.** *Recommended:* treat as untracked, not zero (R3), so deployments without stock rows keep working.
- **Q4. Alert students with pending requests?** *Recommended:* no in v1. Their requests are not cancelled (R7), and the Librarian handles them at the counter. New requesters see the reason on the printing page (R9).
- **Q5. Colored needs all four colors?** *Recommended:* yes (R1); the app cannot tell which colors a document uses.
- **Q6. A "Maintenance" cause on the manual pause?** The Final Draft names maintenance and stock deficits as two reasons printing is disabled. Today the manual switch stores only a free-text reason. *Recommended:* not in v1. The reason text already tells students why, and supply-out is already separate because it is worked out from stock, so a restock never ends a manual pause (R5, R8). Add a cause column later only if reports need to count maintenance pauses.

## Acceptance criteria

- **R1/R4** Given Black ink stock is 0, when a student quotes Monochrome A4, then the server returns 422 `PRINT_SUPPLY_UNAVAILABLE` naming Black ink.
- **R1** Given Cyan is 0 and Black is 3, when a student quotes Monochrome A4, then the quote succeeds; when they quote Colored A4, then it is refused naming Cyan.
- **R1/R4** Given Long paper is 0, when a student quotes Colored Long, then it is refused naming Long paper; Colored A4 still quotes.
- **R2** Given two Black ink rows with 0 and 2 bottles, when a student quotes Monochrome A4, then it succeeds.
- **R3** Given no ink row for Yellow, when a student quotes Colored A4 with other supplies above 0, then it succeeds.
- **R3** Given no rows in `printers`, `ink_repository` or `bond_paper_stocks`, when a student reads service status and submits, then all six configurations are available and the submit succeeds.
- **R5** Given the manual switch is off and all stock is above 0, when a student quotes, then the server returns `PRINTING_UNAVAILABLE` with the manual reason; given the switch is off and Long paper is restocked from 0, then the switch stays off.
- **R6** Given a quote succeeded and Black then drops to 0, when the student submits Monochrome, then submit is refused and no request row is created.
- **R6** Given the last Long ream is opened in one transaction while a student submits Long in another, then either the request was committed before the ream was opened or the submit is refused; a request is never created after Long reached 0.
- **R7** Given a Pending Colored request and Cyan drops to 0, when the Librarian records payment and moves it to Printing, then both succeed and the request is unchanged otherwise.
- **R8** Given Black is 0, when the Librarian restocks 1 bottle of Black, then the next quote for Monochrome succeeds.
- **R9** Given Long paper is 0, when a student reads service status, then Colored Long and Monochrome Long show `available: false` with `missing: ["Paper: Long"]`, the other four show `available: true`, and no stock counts appear.
- **R10** Given Black has 2 bottles, a threshold of 1 and two active Admins, when the Librarian loads one bottle, then two "low stock" notifications are created in the same transaction; when they load the last bottle, then two "out of stock" notifications are created; when a later movement leaves Black at 0, then none is created; the dedupe key per movement stops a duplicate if the insert runs twice.
- **R11** Given a paper size at its low threshold but above 0, when a student quotes it, then it succeeds and the supplies screen still shows it as low.
- **R12** Given the block setting is off and Black is 0, when a student quotes Monochrome, then it succeeds and admin service status still lists Black as missing; when a Student or Faculty tries to change the setting, then the server returns 403.

## Change log

- 2026-11-10: Draft written from the map for JohnBazty's review (GATE 1).
- 2026-11-10: After an independent feature-cartographer and spec-extractor pass, added low-stock alerts to R10 (Final Draft "low-ink triggers"), the in-transaction submit check to R6, the no-rows and manual-pause criteria, and Q6 (maintenance cause).
