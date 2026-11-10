# Map: printer unavailable when a required supply reaches zero

- **Date created:** 2026-11-10
- **Roadmap:** feature 2 in [reference-features-roadmap.md](../reference-features-roadmap.md)
- **Spec:** [docs/specs/printer-supply-availability.md](../specs/printer-supply-availability.md)

Behavior only. No reference code, text or assets copied.

## Requirement

Final Draft (`docs/source/Final-Draft.pdf`, `pdftotext -layout` line numbers):

- Objectives (l. 232-234): a printing service and consumables tracking subsystem that tracks "ink and paper stock".
- Printing Service Request (l. 589-594): the system "checks printer online/offline status in real time" and "Real-time notifications alert users if a printer is disabled due to stock deficits or maintenance."
- Printing Service Management (l. 665-667): Librarian tools to "toggle printer online/offline states" and log ink and paper stock.
- Printing Supplies Asset Management (l. 669-678): low-ink triggers when thresholds are breached; "auto-triggers printer offline status warnings when consumables reach zero"; bond paper tracked by size (Short, A4, Long) in reams.
- Roadmap wording: "A printer becomes unavailable when required consumables reach zero or the asset is under maintenance."

## Sources

| Source | Stars | License | Version | Why |
| --- | --- | --- | --- | --- |
| OpenPrinting/cups | 1,791 | Apache-2.0 | `e545a96` (master, 2026-11-05) | The reference model for printer state, state reasons (media and supply empty) and what happens to queued jobs while a printer cannot print. |
| hanxi/cups-web | 1,518 | MIT | master (2026-11-08) | Web self-service printing front end on CUPS; shows how a web UI surfaces printer state and supply levels to users. |

Extra search (`gh search repos` for print management, print quota, printer SNMP, printer status, toner): no well-starred print-management or supply-tracking project. The hits read ink levels from printer hardware over SNMP (for example Zedeldi/epson-printer-snmp, 127 stars), which the Final Draft and the roadmap put out of scope. None added.

## How each source does it

### OpenPrinting/cups

Entry points: the IPP operations that accept a job and that change a printer's settings (`scheduler/ipp.c`), the job dispatcher (`scheduler/job.c`), and backends that report device conditions (`backend/runloop.c`).

Behavior:

1. **Two separate switches.** A printer has an "accepting jobs" flag and a separate state (idle, processing, stopped). Changing one does not change the other. OBSERVED `OpenPrinting/cups:scheduler/ipp.c:2623-2633` (accepting flag set on its own), `scheduler/ipp.c:2677-2740` (state set to stopped on its own).
2. **New jobs are refused only when not accepting.** Job creation fails with a "not accepting jobs" error when the flag is off; a stopped printer still accepts and queues jobs. OBSERVED `scheduler/ipp.c:1254-1262`.
3. **Stopped printers keep their queue.** The dispatcher skips a stopped destination, so its jobs stay pending until it is started again; nothing is cancelled. OBSERVED `scheduler/job.c:367-368`, `scheduler/job.c:1808`, `scheduler/job.c:1852`.
4. **A failure while printing puts the job back.** When the device fails mid-job under the stop-printer policy, the job returns to pending and the printer becomes stopped. OBSERVED `scheduler/job.c:3375-3390`.
5. **Reasons explain the state.** Device conditions are reported as state-reason keywords that are added and removed as the condition starts and ends: paper running out raises a media warning and later clears it (`backend/runloop.c:338`, `backend/runloop.c:363`); a test expects a "media needed" reason after paper is removed and its disappearance after paper is loaded (`examples/print-job-media-needed.test`). OBSERVED.
6. **Severity is part of the keyword.** Per the IPP standard (RFC 8011, printer-state-reasons), a reason carries a `-report`, `-warning` or `-error` suffix; supply keywords include `media-empty`, `media-needed`, `marker-supply-low` and `marker-supply-empty`. Fact from the public standard.
7. **Recovery is automatic for the reason, not always for the state.** The reason clears when the condition ends (point 5); a printer an operator stopped stays stopped until started. INFERRED from points 1 and 5.

Data: per printer an accepting flag, a state, a state message and a list of state reasons; per job a state (pending, held, processing, stopped, cancelled, aborted, completed) and job state reasons.

### hanxi/cups-web

Entry points: the IPP client that reads printer attributes (`internal/ipp/client.go`), the printer status panel (`frontend/src/components/print/PrinterStatus.vue`) and the print page (`frontend/src/views/PrintView.vue`).

Behavior:

1. Reads printer state, state message, state reasons and per-supply marker names, colors and levels from CUPS. OBSERVED `hanxi/cups-web:internal/ipp/client.go:362-372`, `internal/ipp/client.go:464-491`.
2. Shows the state as a colored badge (idle green, processing amber, stopped red), the state message as a warning box, every active state reason, and a level bar per supply. OBSERVED `frontend/src/utils/format.js:68-73`, `frontend/src/components/print/PrinterStatus.vue:81-134`.
3. Colors a supply level red at 10 % or less and amber at 25 % or less. OBSERVED `frontend/src/utils/format.js:82-95`.
4. Does **not** block submitting while the printer is stopped or a supply is empty: the print button depends only on a printer and a file being chosen; CUPS queues the job. OBSERVED `frontend/src/views/PrintView.vue:731-735`.
5. Lets users cancel their own jobs stuck in processing or stopped. OBSERVED `frontend/src/views/PrintView.vue:590`.

Data: none of its own for supply; everything comes from the printer through CUPS.

## Common pattern

- "Can take new work" and "can print right now" are separate. Stopping a printer for a supply or device problem does not delete or cancel queued work; work waits and resumes after the fix.
- The cause is shown next to the state (a reason per condition, with severity), and the reason disappears on its own when the condition ends.
- Low and empty are two levels: low is a warning, empty stops printing.
- Both sources get supply facts from printer hardware. StiOrmocLibrary has no hardware telemetry, so only the rules carry over, not the data source.

## StiOrmocLibrary today

- `apps/api/src/modules/printing/printing.service.ts`: `quote` and `submit` refuse with `422 PRINTING_UNAVAILABLE` when `printing_service_settings.accepting_requests` is off (l. 42-43, 53-54). `setServiceStatus` (l. 123) is the Librarian's single manual switch with an optional reason. Stock decrements: `useInkBottle` (l. 133), `openPaperReam` (l. 135), `inkMovement` and `paperMovement` "Issued" (l. 137, 139); restocks `restockInk` (l. 129), `restockPaper` (l. 131). All lock the stock row and run in a transaction.
- `apps/api/src/modules/printing/printing.repository.ts`: `serviceStatus` (l. 23-25) reads the switch; `supplies` (l. 98-100) already flags `is_low` when `available_bottles <= low_stock_threshold_bottles` or `unopened_reams <= low_stock_threshold_reams` and counts low items.
- `apps/api/src/modules/printing/printing.validation.ts`: print types `Colored`, `Monochrome`; paper sizes `Short`, `A4`, `Long`; ink colors `Cyan`, `Magenta`, `Yellow`, `Black`.
- Routes: `GET /service-status` for users and admins, `PATCH /service-status` for admins (`printing.routes.ts:11, 24-25`).
- Notifications: the module already writes to `notifications` with a `dedupe_key` (payment and "now printing" messages, `printing.service.ts:99-118`).
- Schema (`docs/schema-context.md`): `printers` holds a manual `Online` / `Offline` / `Unavailable` state but migration 027 removed printers from the active workflow and the interface; `ink_repository.printer_id` is optional; `available_bottles` counts **unopened** bottles; `bond_paper_stocks.unopened_reams` counts **unopened** reams by size; no telemetry, and the app "never changes printer status from imagined consumable telemetry".

## Gaps

1. **No automatic stop at zero.** Nothing refuses a request when a required ink color or paper size has zero stock. Final Draft l. 673-674.
2. **No supply reason shown to students.** The service-status response carries only the manual switch and reason; students are not told that a configuration is out because of stock. Final Draft l. 593-594.
3. **No notice when stock reaches zero.** Low stock is only visible on the supplies screen; no notification is raised. Final Draft l. 593-594, 673.
4. **Conflict: "printer" versus a printer-less workflow.** The Final Draft speaks of a printer going offline; this repo removed printers from the active workflow (migration 027) and tracks ink and paper as shared stock. Making a printer row go `Unavailable` would bring printers back into the workflow and break deployments with zero printer rows.
5. **Conflict: "zero" versus unopened stock.** Stock counts unopened bottles and reams. Zero unopened does not mean the loaded bottle or the opened ream is empty, so blocking at zero may stop service while the printer can still print.
6. **"Under maintenance"** is already covered by the manual switch (`accepting_requests` off with a reason). No gap, unless per-printer maintenance is wanted (it is not, given gap 4).

## Unknowns

- Whether the Librarian wants requests blocked at zero unopened stock, or only warned (gap 5).
- Whether students with pending requests for an affected configuration should be notified, or only new requesters told.
- Whether an ink color or paper size with no stock row at all means "not tracked" or "zero".
- Whether a Colored job needs all four colors or only the ones the document uses (the app does not inspect document colors).
