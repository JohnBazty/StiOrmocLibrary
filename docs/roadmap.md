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

## 2. Built or specced, not merged

| Item | Where | State |
| --- | --- | --- |
| Renewals | PR #13, `feat/renewal-management-v2` | Open; check against the library rule decisions before merge |
| Stocktake sessions | `feat/stocktake-sessions` | No PR; table `018` already on `main`. Carry over `7a4d478` (Admin → Librarian role) from `integration/2026-10` first |
| Long-overdue and damage case | port commit `6dd0c64` from `feat/long-overdue-and-damage-case` | Table `017_circulation_cases` is on `main` and live, but no code uses it. Port the code, align with "lost = book price". Its job-runner commit is replaced by PR #17 |
| Dynamic attendance QR | PR #10 (draft), `feat/dynamic-attendance-qr` | Spec only, approval gate 1 |
| Attendance QR self-heal (rehash) fix | port commit `75f4ed9` from `fix/attendance-qr-rehash` | Not on `main` or the kiosk branch; 2 files. The kiosk needs it. The branch's other kiosk commits are already in `feat/self-service-kiosk` |
| Printer unavailable at zero supply | PR #12 (draft), `feat/printer-supply-availability` | Spec only, approval gate 1 |
| Self-service kiosk | `feat/self-service-kiosk` (local only) | WIP; needs HTTPS deploy, a real-tablet test and the rehash fix. Ethan: keep local |

### October branches to drop (checked 2026-11-11)

Their work is already on `main` or replaced. Drop after John agrees.

| Branch | Why |
| --- | --- |
| `integration/2026-10` | Only bundles the branches above; its one unique fix (`7a4d478`) moves to stocktake |
| `feat/admin-librarian-role-consolidation` | Rename is on `main` as `033`; the login role selector is gone |
| `feat/circulation-preflight` | Same rename; `main` has a separate staff login page |
| `fix/critical-security-login-ux` | Dark mode (`ThemeToggle`), password reset (`009_password_reset_otp`) and RLS lockdown (`011`) are on `main` |
| `feat/ui-ux-rebuild` | 71 of its 84 app files and the public catalog are on `main`; the rest is mostly agent skill files. Ask John first |

## Already on `main` (the gap report predates PR #16)

- Roles `Librarian`, `Staff` and `Admin` with a permission module (`apps/api/src/core/library-permissions.ts`).
- Dark mode (`ThemeToggle`) and password reset.

## 3. Build order after the safety sprint

1. **Check the roles against the gap report:** `Librarian`, `Staff` and `Admin` exist on `main`; confirm the permissions per role match the decision (Admin plus Library Staff, fixed permissions) and fill any gaps.
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
10. **Later:** course reserves, patron lists, ratings and reviews, patron problem reports, purchase suggestions, acquisitions, serials, MARC21 import, room-use-only items, prebuilt reports, English/Filipino switch for the whole app (kiosk already has en/fil/ceb), self-checkout on phone, an enforced 80% coverage minimum.

## Decided rules (2026-11-11)

Closing 17:00. Fine cap PHP 500. Lost charge = book price, no extra fee. Suspension 0 days. Hold pickup 1 open day. History retention 1 year, pending STI's DPO. Email via Gmail SMTP. Admin creates the kiosk account. Microsoft Entra sign-in dropped.

## Change log

- 2026-11-11: Sorted the October branches (port, drop); removed Library Staff role, dark mode and password reset as missing, since they are on `main`.
- 2026-11-11: Created from the gap report, the safety sprint plan, the reference-features roadmap and the open PRs and branches.
