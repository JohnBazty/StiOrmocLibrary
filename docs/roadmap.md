# StiOrmocLibrary roadmap

- **Date created:** 2026-11-11
- **Date last updated:** 2026-11-11
- **Status:** planned (each item still gets its own plan doc and approval before building)

## Why

One list of what is left, in build order. It merges the order in `docs/rea-comparison-report.md` §8, `docs/safety-sprint-plan.md`, `docs/reference-features-roadmap.md` and the open branches. Those docs keep the details; this file keeps the order and the state. Update the State column when a PR opens or merges.

Live database (2026-11-11): `032` and `036` applied, `033` pending, `034` (job runner) and `035` (circulation RLS) not applied.

## 1. Safety sprint (fix first)

| Item | Where | State |
| --- | --- | --- |
| Scheduled jobs run on Vercel (overdue, reservation expiry, notices): Part A job runner | PR #17 | Review fixes pushed; waits for John. After merge: apply `034`, set the secret, set up Vercel Cron |
| Mock routes removed, `GET /api/reports` on live data, RLS check | PR #18 | Open, waits for John |
| Sign-in hardening, Part C: httpOnly cookie instead of `sessionStorage`, per-account lockout, one sign-in system (retire old session) | PR #19 (draft) | John runs the preview check (`docs/sign-in-hardening-preview-check.md`); local wording fix not pushed |
| Audit findings and circulation-table RLS (`035`) | PR #20 (draft) | Retarget to `main` after #17 merges |
| Real-SQL RLS migration tests (PGlite) | PR #21 | Review requested from John |
| Plan docs: gap report, safety sprint plan, `plan-and-build` skill | PR #15 | Open, waits for John |
| Password reset | Part C follow-up | Not started (needs email, section 3) |

## 2. Built or specced, not merged

| Item | Where | State |
| --- | --- | --- |
| Renewals | PR #13, `feat/renewal-management-v2` | Open; check against the library rule decisions before merge |
| Stocktake sessions | `feat/stocktake-sessions` | No PR |
| Long-overdue and damage case | `feat/long-overdue-and-damage-case`, `integration/2026-10` | No PR; align with "lost = book price" |
| Dynamic attendance QR | PR #10 (draft), `feat/dynamic-attendance-qr` | Spec only, approval gate 1 |
| Attendance QR self-heal (rehash) fix | `fix/attendance-qr-rehash` | No PR; kiosk needs it |
| Printer unavailable at zero supply | PR #12 (draft), `feat/printer-supply-availability` | Spec only, approval gate 1 |
| Self-service kiosk | `feat/self-service-kiosk` (local only) | WIP; needs HTTPS deploy, a real-tablet test and the rehash fix. Ethan: keep local |

## 3. Build order after the safety sprint

1. **Library Staff role** and the permission module (Admin plus Library Staff, fixed permissions per role).
2. **Audit log viewer** with CSV export, and the **settings catalogue**.
3. **Calendar port:** date ranges for breaks, yearly holidays, same-day overrides, past dates locked.
4. **Email notices:** templates, queue, Gmail SMTP, dev redirect (today notices are in-app only).
5. **Circulation:**
   - due-time mode and a staff-set due date
   - merge renewals (PR #13)
   - check-in with hold trapping; backdated return with a reason
   - holds with a pickup deadline of 1 open day
   - day-based overdue notices by level, one send per level
   - patron restrictions (suspension is 0 days, so blocks only; no tables exist yet)
6. **Money:**
   - GCash payment verification queue (reference number, screenshot, approve or reject)
   - lost item charge = book price, no processing fee; refund when the book comes back
   - clearance request with 30-day expiry
   - one "owed" figure on student screens
7. **Patrons:** membership expiry by semester, patron CSV import, printable patron card, personal-data export and anonymization of old history (retention 1 year, pending STI's DPO).
8. **Catalog:** printable label sheets (A4, spine labels), duplicate detection, title lookup, "Books received" report, stocktake (section 2), cover upload and replace, search facets and "did you mean", batch edit of copies.
9. **Printing and attendance extras** (`docs/reference-features-roadmap.md` items 3 to 6, 8): print file auto-delete, failed/reprint state, duplex price rule, auto check-out at closing (17:00), multi-floor map only if the library has more floors.
10. **Later:** course reserves, patron lists, ratings and reviews, patron problem reports, purchase suggestions, acquisitions, serials, MARC21 import, room-use-only items, prebuilt reports, English/Filipino switch for the whole app (kiosk already has en/fil/ceb), self-checkout on phone, dark mode, an enforced 80% coverage minimum.

## Decided rules (2026-11-11)

Closing 17:00. Fine cap PHP 500. Lost charge = book price, no extra fee. Suspension 0 days. Hold pickup 1 open day. History retention 1 year, pending STI's DPO. Email via Gmail SMTP. Admin creates the kiosk account. Microsoft Entra sign-in dropped.

## Change log

- 2026-11-11: Created from the gap report, the safety sprint plan, the reference-features roadmap and the open PRs and branches.
