# Reference features roadmap: printing, attendance QR, floor plan

- **Date created:** 2026-11-10
- **Date last updated:** 2026-11-10
- **Status:** planned (each feature gets its own map, spec and plan through `reverse-feature`)

## Why

On 2026-11-10 the printing, attendance and floor-plan modules were compared with well-starred GitHub projects and with the Final Draft. This is the resulting list of what to add, in order. Required items come from the Final Draft; optional items are good practice seen in the reference projects. Each one goes through the `reverse-feature` pipeline with JohnBazty's approval at every gate ([johnbazty-handoff.md](johnbazty-handoff.md)).

## Already built (do not redo)

- **Printing:** request upload (PDF/DOCX, page count detected), server-side pricing, queue states Pending → Printing → Ready for Pickup → Completed / Cancelled, cash payment and digital receipt, ink by bottle, paper by ream, restock costs, low-stock threshold, revenue, expense and stock PDF reports, service on/off switch.
- **Attendance:** permanent QR pass per user (opaque, revocable), desk camera scanning, check-in with purpose, check-out, capacity limit with audited changes, daily, weekly, monthly and semester analytics, PDF report.
- **Floor plan:** editable single-floor layout with shelves, book and research counts per shelf, a catalog title linked to its shelf on the map.

## Features, in recommended order

| # | Feature | Area | Final Draft | Reference projects | State |
| --- | --- | --- | --- | --- | --- |
| 1 | Dynamic (TOTP) QR made offline on the phone | Attendance | **Required** | authelia/authelia, beemdevelopment/Aegis, jeffreydivi/QRIdentity | Spec draft, GATE 1 |
| 2 | Printer becomes unavailable when a required ink or paper stock reaches zero | Printing | **Required** | OpenPrinting/cups (printer state reasons such as supply empty) | Spec draft, GATE 1 |
| 3 | Auto-delete uploaded print files after N days (setting) | Printing | Optional, privacy | hanxi/cups-web (record and file retention) | Not started |
| 4 | Failed / reprint state in the print queue | Printing | Optional | OpenPrinting/cups (held, stopped, aborted jobs) | Not started |
| 5 | Duplex (double-sided) option with its price rule | Printing | Optional | hanxi/cups-web, OpenPrinting/cups | Not started |
| 6 | Auto check-out at closing time for open visits | Attendance | Optional | ChurchCRM/CRM, changeweb/Unifiedtransform | Not started |
| 7 | Tablet kiosk mode (catalog search, shelf location, citation) | Kiosk | **Required** (planned client) | ChurchCRM/CRM kiosk | Not started, large: split first |
| 8 | More than one floor, and directions from the entrance | Floor plan | Optional | c3nav/c3nav, openindoormaps/openindoormaps, mehanix/arcada | Only if the library has more than one floor |

## Cleanup found during the comparison

- `GET /inventory/supplies` and `GET /reports` serve hardcoded demo rows from `apps/api/src/data/mock-data.ts`; `/inventory/supplies` has no sign-in check. The web app calls neither. Remove them (small `fix/` branch, also reviewed by JohnBazty).
- `StudentAttendancePage` in `apps/web/src/pages/student/StudentPages.tsx` is an unused demo with a fake QR. It is removed in feature 1.

## Seen in reference projects but not needed

- Reading ink levels from the printer hardware and installing printer drivers: the Final Draft puts printer hardware out of scope.
- Print quotas or prepaid credit (valcir/ibquota): STI charges cash per job.
- Scanning, Wi-Fi or Bluetooth presence, face recognition: not in the Final Draft.
- An offline queue on the desk scanner: the Final Draft keeps the desk online; only the phone works offline.

## Implementation tracking

- [ ] 1 Dynamic QR: map ✔, spec ✔ (draft), approval, plan, build
- [ ] 2 Printer unavailable at zero stock: map ✔, spec ✔ (draft), approval, plan, build
- [ ] 3 Print file retention
- [ ] 4 Failed / reprint state
- [ ] 5 Duplex option
- [ ] 6 Auto check-out at closing
- [ ] 7 Tablet kiosk (split into sub-features first)
- [ ] 8 Multi-floor map (confirm floors with the Librarian first)
- [ ] Remove the mock-data routes

## Change log

- 2026-11-10: Created from the GitHub comparison and Final Draft review.
- 2026-11-10: Feature 2 map and draft spec written (`docs/maps/printer-supply-availability.md`, `docs/specs/printer-supply-availability.md`); waiting at GATE 1.
