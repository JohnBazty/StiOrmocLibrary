# Revision Phase 4 — Attendance and library operations

| Field | Value |
| --- | --- |
| Date created | 2026-10-11 |
| Date last updated | 2026-10-11 |
| Status | `built` |

## Why

The owner authorized Revision Phase 4 of the revision roadmap. Retain attendance history and permanent passes while adding purpose QR, automatic scan actions, accurate occupied seats, events and closing-time recovery.

## Approved policy

Owner answered **1A, 2A, 3A**:

- Only **Printing** excludes occupied seats. Photocopy, Borrow books, Library Visit, Study and Research still count as seat visits.
- Librarian chooses affected space, remaining library seats and walk-in/borrowing/printing permissions per class, meeting or seminar.
- Stop new entry and automatically check out attendance at **6:55 PM**, five minutes before the confirmed **7 PM** closing on operating days. Retain open days/opening times and dated closures.

## How

### QR and scans

Student/Faculty select purpose and generate/download a signed 15-minute QR. Permanent passes remain available. Tampering, expiry, revocation and inactive accounts are rejected; signed purpose overrides arbitrary desk input.

The scanner resolves the actual open visit and confirms server-selected Entry/Exit, without manual mode buttons. Permanent-pass entry prompts purpose buttons; cancelling writes no visit. Scan transactions lock capacity and credential, enforce a 30-second cooldown and retain stable request receipts. Retries return the same result. Old check-in/check-out URLs use the same atomic policy on active Postgres.

### Occupancy, events and reporting

New visits retain seat classification; old visits use the approved mapping. Current occupied seats and printing visits are separate. Peak occupied seats uses overlapping intervals, including carry-in visits and clipping open visits at now. Arrivals per hour/busiest arrival hour are separately labeled. Full timestamps determine duration; times display in 12-hour format. User/Staff/Librarian history identifies Automatic closing exits.

Librarian manages dated events, affected space, remaining library capacity and explicit service permissions. Overlapping events use minimum capacity and intersect permissions. Staff reads/enforces state without management controls; API writes enforce the same boundary. Desk checkout and starting a print job check operational permissions. Online request queues, cancellations and book returns remain available.

Attendance calendar SQL explicitly uses Asia/Manila because the configured Supabase connection reports UTC despite startup timezone options. Credential scan times are explicitly stored/interpreted in Manila. Existing durable job timestamp columns use UTC consistently for five-minute leases/minute deduplication; job status interprets them as UTC instants.

### Closing, database and delivery

The existing durable operational-minute runner includes attendance closing and starts locally with recovery. It also runs existing reservation/overdue/notification jobs. Closing/scans/events share the capacity lock. Recovered exits retain intended cutoff time, are idempotent and never return borrowed books.

Applied additive **022** after owner answers and rolled-back DDL validation. Policy/events/scan-receipt tables have RLS and no anonymous/authenticated table grants. Existing visits, credentials, accounts and loans retain their identities. Latest product file 022, next unused Postgres 023; MySQL reference 047/next 048 unchanged. The new extension targets active Postgres.

No GitHub push/deployment. The local API must stay running for scheduled checkout; startup recovers missed cutoffs when it was stopped.

## Implementation tracking

- [x] Confirm occupancy/event/cutoff policy and apply extension.
- [x] Implement signed purpose QR and permanent-pass compatibility.
- [x] Connect atomic scan, cooldown, retry receipts and API restrictions.
- [x] Implement seat/service separation, concurrent peak and accurate durations.
- [x] Add Librarian controls, Staff state/history and automatic scanner UI.
- [x] Integrate idempotent closing/recovery into the durable local runner.
- [x] Finish final UTC integration check, runtime restart and disposable fixture cleanup.

## Verification

- **296 API tests**, **125 web tests** across 50 files passed. Type checks and API/web build passed; existing Vite bundle-size warning remains.
- Isolated Postgres checks cover stable retries, cooldown, simultaneous visitor scans/final-seat competition, seat/service counts, roles, events/cancellation, signed purpose, revoked/inactive accounts and cutoff/restart recovery. Temporary cloned schema is dropped afterwards; public attendance is preserved.
- Runtime HTTP: Librarian/Staff state/events/summary 200; Staff policy/event/capacity writes 403; anonymous state 401; Librarian PDF 200/application/pdf; health 200.
- Browser: disposable Librarian/Staff accounts verified operations controls, automatic scanner text, cancelled event history and Staff read-only state. Event fixture created through authenticated API; cancellation exercised in the browser. Component tests also verify form payload, purpose/cancellation, retry ID and automatic exit.
- Final isolated UTC-session integration passed, including true final-seat competition, full report durations, intended-cutoff recovery and five-minute/minute job lease boundaries. Test schema was dropped. Two disposable UI accounts and one test event were removed by verified exact identities after sign-out. All three existing public attendance rows remain; original accounts/loans were preserved.
- Restarted the stable local API with completed code. Web/API proxy health is 200/ready. The local durable runner reports successful runs, no lease held and zero failures. Approved policy is configured with Printing only and a five-minute cutoff; no test events/accounts remain.
- Local Sunday correctly shows Closed without fake operating hours. Automated component tests passed after making event field updates preserve simultaneous changes and preventing background polling from resetting an unsaved cutoff.

## Change log

- **2026-10-11:** Owner authorized Phase 4. Consulted product/schema references, requested required policy decisions, added independent QR/date helpers, prepared atomic operations/reporting and rolled-back schema validation.
- **2026-10-11:** Owner confirmed 1A/2A/3A. Applied 022, connected routes/scanner, events/cutoff UI, occupancy/reporting and durable runner. Local suites/build/API/browser checks passed. Found UTC session behavior and added explicit calendar/lease handling; final UTC integration, cleanup and local restart succeeded; Phase 4 is built locally.
