# STI ILMS REA vs StiOrmocLibrary: gap report

**Date:** 2026-11-11. **Compared:** StiOrmocLibrary `origin/main` (`daa41d5`, migrations to `016`) against STI ILMS REA `main` (#1 to #13 built) and its 55 specs, with the answers in REA `docs/spec-decisions.md` (2026-11-10).

**Important (added 2026-11-11): `main` is not what the live database runs.** The live `schema_migrations` table lists migrations up to `029`, applied from unmerged branches (`codex/library-revision-updates` and `ui/library-theme` by JohnBazty and Keith, `integration/2026-10`). Those branches add work this report did not look at, such as password recovery (`020`), roster enrollment, semester archive, desk circulation and book requests. Some "missing" items below may already exist there. Re-check each finding against the branch that becomes the baseline (`docs/safety-sprint-plan.md`, decision S7).

**How this was checked:** I read every REA spec's rule titles (829 rules), the decisions file, and StiOrmocLibrary's routes, migrations, workers, plan docs and key services. I did not run either app, the test suites, or the live site. Each finding names the file or rule it rests on; check it before building.

**Labels**
- **Fix now**: a security, data or correctness problem on the live system.
- **Before go-live**: needed before the library relies on it daily.
- **Port**: an approved REA rule or feature that StiOrmocLibrary lacks.
- **Improve**: code health or user experience.

Build every item with the `plan-and-build` skill: one plan doc, Ethan's approval, tests first, reviews. In the specs, "Librarian" means Admin and "staff" means Library Staff.

---

## 1. Summary

StiOrmocLibrary already does more of the day-to-day library work than REA. It has circulation, fines, clearance, printing, supplies, attendance, reservations, the floor plan and reports, and REA has none of these yet. REA is stronger in the foundations under them: sign-in security, staff roles, an audit log, a job runner, email notices, the calendar, settings and lookup lists. The 37 approved specs then describe how circulation should behave in detail.

**The ten most important things to do, in order:**

1. **Fix now: background jobs do not run on Vercel.** Overdue scans, reservation expiry and notifications run on `setInterval` timers started in `apps/api/src/server.ts`. A Vercel function does not stay running, so these jobs never fire on the live site. Port REA #8 (job runner) onto Vercel Cron, with a database lock per run. Draft PR #3 already started this.
2. **Fix now: sign-in security gaps.** The access token is kept in `sessionStorage` (`apps/web/src/features/auth/auth-storage.ts`), where any injected script can read it. There is no account lockout after failed passwords, only an IP limit of 8 tries per 15 minutes. There is no password reset. Port REA #1 R11 to R16 and R25 to R28.
3. **Fix now: mock data is still served.** `GET /api/reports` returns `reports` from `apps/api/src/data/mock-data.ts`, and `GET /api/inventory/supplies` returns mock `supplies` from the same file. Replace both with real queries or remove them.
4. **Checked, safe: copy delete routes.** The `DELETE` routes for copies and thesis records only remove a Lost copy with no loans, reservations or audit history; everything else must be archived (F6).
5. **Before go-live: add the Library Staff role.** Only `Admin`, `Student` and `Faculty` exist. Student assistants must either share the Librarian's Admin account or have no access. Ethan's decision (2026-11-10) is Admin plus Library Staff with fixed permissions per role. Build this first, as decided.
6. **Before go-live: one audit log.** Changes are logged in separate tables (`account_management_events`, `inventory_audit_events`, `circulation_override_events`, `print_status_history`, `fine_adjustments`). There is no one screen to answer "who changed this, and when". Port REA #7.
7. **Before go-live: email notices.** StiOrmocLibrary sends no email at all; notifications exist only inside the app. Due-date and overdue notices (spec `due-overdue-notices`), password reset and hold pickup all need email. Port REA #9a (queue, templates, SMTP, dev redirect).
8. **Port: finish circulation.** Merge renewals (PR #13) after checking it against the decisions. Then build check-in with hold trapping, holds with a pickup deadline, patron restrictions, payments with GCash verification and write-offs, and lost items with the processing fee and refunds. Details are in section 4.
9. **Port: calendar and settings.** StiOrmocLibrary has weekly hours (`library_operating_schedule`) and single closed days (`library_closed_days`). REA #5 adds date ranges for breaks, yearly holidays, same-day overrides and a rule that past dates cannot be edited (that would change fines already charged). Fines and due dates depend on this, so port it before more circulation work.
10. **Improve: enforce 80% coverage, finish the TypeScript move, and add dark mode.** The coverage scripts report coverage but set no minimum. Twelve API files are still JavaScript, including the old session sign-in. The UI has no dark mode.

---

## 2. Fix now (live-system risks)

| # | Problem | Where | What to do | REA source |
|---|---|---|---|---|
| F1 | Scheduled work never runs on Vercel: overdue status, reservation expiry, notification delivery | `server.ts` starts `startCirculationOverdueWorker`, `startReservationExpirationWorker`, `startNotificationWorker` with timers | A job catalogue, run by Vercel Cron calling an authenticated endpoint. Each run takes a database lock, records start, end and error, never runs twice at once, and shows "last success" to Admin. Then move the three workers onto it. Draft PR #3 (`feat/long-overdue-and-damage-case`) started a "durable job runner" on the MySQL-era code; reuse its design, not its code | #8 job-runner R1 to R13, R23 to R27 |
| F2 | Access token in `sessionStorage` can be stolen by any script injection | `auth-storage.ts` lines 61 to 69; `Authorization: Bearer` on about 26 calls | Move to an `httpOnly`, `Secure`, `SameSite` cookie session, or a short-lived token in memory with an `httpOnly` refresh cookie. Keep CSRF checks on every write | #1 R11, R12, R20 |
| F3 | No account lockout; only an IP rate limit (8 per 15 min login, 5 per hour registration) | `jwt-auth.routes.ts` lines 24 to 30 | A per-account failed-attempt count that locks for a set time, with staff unlock and lock expiry. Give the same answer for an unknown user and a wrong password, with a dummy password check so response timing does not reveal accounts | #1 R8, R9, R13 to R16, R28 |
| F4 | No password reset; users who forget a password need the Librarian | Only a setting name in `config/env.js` | A reset flow: a token stored only as a hash, expiry in minutes, one use, the same reply whether or not the account exists, a rate limit, and an email notice after every password change | #1 R25 to R27, R38 |
| F5 | Mock data in live routes | `reports.routes.ts` lines 2 and 16 (`GET /api/reports` returns mock `reports`); `inventory.routes.ts` lines 2 and 26 (`GET /api/inventory/supplies` returns mock `supplies`) | Replace with real queries, or delete the routes and their UI. Add a test that fails when any non-test file imports `data/mock-data` | Product rule "server is the authority" |
| F6 | ~~Copies and thesis records have delete routes~~ **Checked 2026-11-11: safe.** `deletePhysicalCopy` and `deleteThesisInventory` delete only a copy marked Lost with no loans, reservations or audit events; anything else gets `PHYSICAL_COPY_REQUIRES_ARCHIVE` / must be archived | `physical-copy.service.ts` lines 60 to 110; `thesis-inventory.service.ts` lines 200 to 235 | No change needed. REA never deletes copies at all; keeping a guarded delete for never-used lost copies is a reasonable difference | #11 items R2 |
| F7 | Two sign-in systems run side by side: the old session login (`auth.routes.js`, `authController.js`, `sql-session-store.js`) and the JWT login (`jwt-auth.*.ts`). Both are in use: the web calls `/api/auth/csrf`, `/me`, `/logout` and about 18 session-protected `/api/catalog`, `/api/inventory` and `/api/reports` routes, and JWT for `/api/v1` | `app.js` mounts `/api/auth` and `/api/v1/auth` | Keep one (see F2) and move the other's routes over. This is a large change; give it its own plan. Two paths double the attack surface and the review work | #1 R11, R17 to R19 |
| F8 | Row-level security has no explicit `ENABLE ROW LEVEL SECURITY` statements in the migrations; it relies on the `rls_auto_enable()` trigger and on revoking `anon` and `authenticated` (`011_advisor_security_lockdown.sql`) | `database/supabase/` | Run the Supabase security advisor. Add a test that lists every `public` table and fails when RLS is off | REA: every table has RLS on |

---

## 3. What REA has built that StiOrmocLibrary lacks (#1 to #13)

| REA feature | REA has | StiOrmocLibrary has | Gap and action |
|---|---|---|---|
| #1 Accounts and sign-in | argon2id hashing, per-account lockout, session revalidation on every request, password reset, email-verified self-registration restricted to `ormoc.sti.edu.ph`, forced password change, an `auth_events` log | bcrypt, JWT plus a legacy session, an IP rate limit, registration by school ID with a placeholder email, active-account check (`ensureActiveJwtAccount`) | F2 to F4, F7. Decide the school-email question in `docs/system-fixes-and-features-plan.md` ("School-email registration"). Microsoft Entra sign-in is planned in StiOrmocLibrary, but REA dropped school sign-in for v1; pick one direction |
| #2 Roles and permissions | Four roles; the permission catalogue lives in one module; the web reads permissions, never role names; last-Librarian guard; no self-edit | `Admin`, `Student`, `Faculty`; `requireJwtRoles('Admin')` per route | Add `library_staff` with a fixed permission set (Ethan 2026-11-10: no per-account granting). Move role checks into one permission module so routes ask "can this account do X". Keep the last-Admin guard |
| #3 Patron categories and records | Categories per role, programs and year levels, membership expiry, patron photo, staff edit with permission | `users`, `student_profiles`, a programs list, Activate/Deactivate/Archive (Phase 2 A1) | Port membership expiry (`expires_on`, renewal), needed by `semester-membership-expiry`. The photo is optional (Phase 5 N2 covers the avatar) |
| #4 Library settings | One typed settings catalogue, checked on the server, cached, every change audited, a public library-profile endpoint | `library_profile_settings`, policy pages for borrowing and fines | Gather scattered settings (capacity, printing service status, fine policy, closing time) into one catalogue with validation and audit, so new specs add keys instead of tables |
| #5 Calendar | Weekly hours; closures as date ranges (breaks); yearly holidays; same-day overrides; past dates locked; counting functions that return their inputs; Asia/Manila | `library_operating_schedule` (per weekday), `library_closed_days` (single dates) | Port ranges, yearly holidays, overrides and the past-date lock. Today, editing a past closed day silently changes fines already charged |
| #6 Lookup lists | Managed lists (material type, location, collection, fund source, lost reason) with codes, labels, sort order, deactivation, delete only when unused | `categories`, `borrowing_policy_material_rules`, floor-plan shelves | Add lookup lists when a spec needs them, first `lost_reason` (lost-items R2) and material type and location (catalog facets, on-site use) |
| #7 Audit log | One registry of log tables, an append-only rule, a viewer with filters, CSV export with formula-injection protection, logging of who viewed the log | Separate event tables per area | A read-only "Audit log" page over the existing event tables (a database view or union), with filters and CSV export. Escape cells that start with `=`, `+`, `-` or `@` (REA #7 R18) |
| #8 Job runner | Constant job catalogue, one run at a time, heartbeat, time budget, run history, manual "Run now", admin banner on failure | `setInterval` workers (F1) | F1 |
| #9a Notices | Template catalogue, email queue with claim and retry, SMTP, a dev redirect so test mail never reaches students, message history per patron | In-app `notifications` only | Port it. Keep in-app notifications and add email as a second channel per notice |
| #10 Bibliographic records | Title normalization, up to 20 authors, duplicate detection with confirmation, version check against stale edits, archive and restore | `titles`, `authors`, archive (Phase 3 A9), ISBN lookup | Port duplicate detection (same normalized title, first author and year, or the same ISBN) and the stale-form check (`version` field) on edit |
| #11 Items | One row per copy, never deleted; server-assigned accession number equals the barcode; one status field; loanability rule (`isLoanable`); copy history | `physical_copies`, `barcode_sequences`, condition plus availability, `physical_copy_asset_code_history` | F6. Check that condition and availability cannot contradict each other (REA chose one status). Expose one `isLoanable` function that circulation, reservations and search all use |
| #12 Labels | Barcode and spine labels on A4 presets with start cell and calibration offsets | Barcode and QR PNG per copy (`/assets/:id/barcode.png`, `qr.png`) | Add printable label sheets (A4, start cell, offsets) and spine labels with the call number |
| #13 ISBN lookup and title lookup | Open Library then Google Books, a fixed host allowlist, timeouts, preview before apply, local matches first | `GET /isbn/:isbn` | Check host allowlist, timeout and "preview, never overwrite". Add title-and-author lookup (REA `title-lookup`) |
| Multi-copy add, Books received | Add up to 50 copies in one transaction; received list with filters, keyset paging, CSV export | Bulk book entry (`/add-bulk`, `/bulk-entry`) | Add a "Books received" report (date-received filter, CSV) |
| Catalog search (#14, spec still draft) | `pg_trgm` and full-text ranking, facets, "Did you mean", suggestions, highlighting | Case-insensitive `ILIKE` (PR #11) | Wait for the spec's approval, then port facets (availability, material type, location) and suggestions. No `pg_trgm` is used yet |
| Theme | Semantic color tokens with light and dark mode, contrast rules | STI blue, yellow and white only; no `prefers-color-scheme` | Add dark mode with tokens. Keep STI colors |

---

## 4. Approved specs to build in StiOrmocLibrary

Ordered by how much the library needs them. "Has" is what StiOrmocLibrary `main` does today.

### 4.1 Circulation core (do these first)

| Spec | Has | Build or fix | Key decisions to apply |
|---|---|---|---|
| **borrowing-policy** | Versioned policy (`016`): per-role loan and reservation limits, 1 renewal of 1 day, renewal blocks, long-overdue days, material rules; fine policy versions with cap | Add the **due-time mode** (`fixed` 08:59 or `checkout_time`, capped at closing); add the **grace period** in minutes (default 0) to the versioned policy; store the cap as nullable (null means no cap, R11) | Q1 hourly until end of due day, then PHP 10 per day; Q2 cap and suspension amounts are [Librarian]; Q4 UTC storage, Manila logic; Q5 grace period; Q6 renewal due date counted from renewal time. Spec R16 ("from original checkout date") and R17 ("pickup within 7 days") are overridden by the decisions; follow the decisions |
| **checkout** | Desk checkout, cart requests, preflight with blocker and warning, override with reason (`014`), lock against double lending | Staff-set due date (future, operating day only, R12); hold-queue check (R7, R8) once holds exist; age restriction is not needed (R10); confirm the preflight token is server-issued and used by both UI and API (Q5) | Q2 overdue loans warn, Admin can override with reason; Q3 Admin can override hold blocks with reason |
| **checkin** | Return by scan, fine calculated at return (`calculate-penalty`) | Backdated return with reason (R4; no book drop, Q2); hold trapping on return (R8, R9) and pickup deadline counted in operating days (Q3, N is [Librarian], suggested 2); overdue restriction lifting (R10); lost-item return outcomes (R11); damaged or not-for-loan status on return (R19); CHECKIN notice (R15) | Q1 fines follow the policy calculation; notices compare dates only |
| **renewals** | PR #13 (`feat/renewal-management-v2`, migrations `017`, `018`) open, not merged | Review PR #13 against the decisions before merging: renewal due date from renewal time (borrowing-policy Q6); overdue loans renew from now (Q7); no auto-renewal (Q2); unseen renewals off (Q3); self-renew blocked for expired patrons (Q5); batch renew returns per-loan results (Q9); renewal count kept after return (Q10); RENEWAL notice (Q4); hold check waits for holds (Q13) | Spec R13 "not too soon": settings default 0 (Q1) |
| **due-overdue-notices** | Overdue worker (not running live, F1), in-app notifications | Day-based notices with advance notice days, overdue levels with trigger days, **one send per level** (decision), restriction added per level, failed-notice handling | Needs F1 and #9a email first |
| **holds** (StiOrmocLibrary "reservations") | Title-level reservations, waiting list, statuses pending → approved → ready_for_pickup → claimed / cancelled / expired, Student cap, desk-verified pickup | Show "N people waiting" (Q1); allow holds on loaned items with a notice (Q2); daily job cancels expired waiting holds (Q3, needs F1); pickup deadline in operating days; trap on return (checkin R8); one in-app notice per status change (Phase 2 A7, not built) | |
| **patron-restrictions** | None (no restriction tables) | Manual restrictions with types (custom types allowed, Q5), overdue suspension = fine-days × days overdue (Q8), auto-lift by setting (default `when_no_overdue`), override with reason logged on the loan and audit log (Q12), comment limit 2000 (Q11) | Clearance stays computed live and separate from restrictions (conflict decision); drop GONE_NO_ADDRESS and LOST_CARD (Q6); DISCHARGE is a record, never a blocker (Q15); same rules for Students and Faculty |
| **payments** | Cash payments with allocation (`fine_payment_allocations`), receipts with a verification code, reversal, adjustments (waive or void) | **GCash verification queue** (reference number, screenshot, staff approve or reject); partial write-off at least PHP 1.00 with reason (Q1, check the current minimum); payment never above the balance (Q2, built per Phase 1 B3; keep the test); credits only from refunds, applied to the next charge | Product rule: no payment gateway. Phase 2 A10 (invoices) needs the school's finance approval first |
| **lost-items** | Lost-book report by student, staff confirm or reject, one charge (`lost_book_reports`) | **One processing fee** for all material types (Q1; amount [Librarian], spec default PHP 50; may be 0); replacement cost entered by staff, no default (Q9; StiOrmocLibrary plans a supplier quotation, Phase 2 A8, which fits); **full refund** when the book comes back, as a credit or cash (Q2), with no age limit (Q3); long-overdue job marks lost after N calendar days (Q4, needs F1; draft PR #3 has a start); claims-returned with staff deciding per claim (Q5); a lost-paid copy is a reason under `lost`, not a status (Q8); warn above 3 open claims (Q10, [Librarian]); auto-resolve claims only on check-in (Q11, setting off by default) | |
| **discharge** (clearance) | Live clearance from loans, fines and lost charges; overrides with reason and revoke; CSV export; student view with blocking items | A clearance **request** from the student with a 30-day expiry (Q2) and re-request allowed at once (Q6); a granted clearance stays granted (Q7); Faculty follow the same rules (Q3); a lost loan counts once (Q4) | No bulk clearance (Q1), no QR or verification code (Q5), no conditional clearance (Q8) |
| **patron-account** | Student dashboard, borrowing page, fines page, clearance page | One "owed" figure per screen (Q1); last 50 checkouts, no paging (Q2); a credit balance never blocks renewal, unpaid fines still block clearance (Q3); expiry warning once membership expiry exists | |

### 4.2 Catalog and collection

| Spec | Has | Build or fix |
|---|---|---|
| **stocktake** | Inventory audits, scan sessions on `main` (`/session`, `/scans`); fuller sessions and discrepancy review on draft PR #2 | Flag wrong-shelf scans (included); CSV export; skip loaned and lost copies; problem list. Rebase PR #2 onto Postgres-only `main` or rebuild it from the spec |
| **cover-images** | None | Upload and replace covers; covers from ISBN lookup (included); scale in the browser, no thumbnails; batch import deferred |
| **batch-edit** | None | Select copies, change status or location in one reviewed batch with a dry run and audit; bulk barcode generation deferred, MARC edits dropped |
| **course-reserves** | None | Courses with reserve items, temporary loan period, no renewal, automatic expiry at term end (uses `academic_terms`); instructor auto-assignment dropped |
| **acquisitions** | None | Orders, receiving, budget report (it is the feature); multi-fund deferred; receipt scanning and vendor portal dropped |
| **purchase-suggestions** | None | Patron suggestions with a limit, staff approve or reject, notify; **type book or serial** with optional frequency and ISSN (Ethan included); **Librarian CSV bulk import**, checked row by row (Ethan included); the spec still needs rules written for both |
| **serials** | None | Issue frequency, expected issues, check-in, coverage gaps; claim email deferred |
| **marcd21** | None | MARC21 import with field mapping and duplicate check; Z39.50 dropped (Ethan); ISBN and title lookup cover copy cataloguing |
| **lists-and-cart** | Borrow cart | Patron lists (private or shared), export CSV and print (included); **"Also on lists with this title"** recommendation from non-private lists, never showing who made them (Ethan included; rule not written yet); public list browse deferred |
| **tags-reviews-ratings** | None (a book feedback feature is deferred in Phase "Future N1") | One rating per user per title, simple average, reviews with a moderation queue (included); tag cloud deferred |
| **on-site-use** | None | A "room use only" flag on location, collection or material type; checkout becomes on-site use, due at closing the same day (Ethan included); **patron self-service** scan for room-use copies, same limits as staff checkout (Ethan included); rules not written yet |

### 4.3 Patrons, privacy and administration

| Spec | Has | Build or fix |
|---|---|---|
| **patron-import-batch** | None (bulk book entry only) | CSV only (Excel deferred), standard headers, row-by-row validation before save, rollback, audit; no field-mapping UI |
| **semester-membership-expiry** | `academic_terms`; semester turnover planned (Phase 4 T2) | Expiry from the term calendar; the enrollment import sets the new expiry (auto-renew dropped); a borrowing block for expired accounts; batch renewal by staff |
| **patron-cards** | Attendance QR pass | Printable card with photo, barcode or QR and expiry; badge, laminator and RFID dropped |
| **privacy-anonymization** | None | Personal-data export for the Data Privacy Act right of access (included); bulk anonymization of old history for retention (included); opt-out of history; consent history deferred. Needs retention periods from STI's data protection officer (open question) |
| **announcements** | `announcements`, `announcement_revisions`, a dashboard card | Safe HTML only (`p br strong em a ul ol li h2-h4`, links `rel="noopener"`); expiry; soft delete with `deleted_at` only, logged; "Preview as patron"; Admin-only management; English only |
| **problem-reports** | Lost-book reports only | Patron problem reports on a title or copy, a fixed short category list (included), status, staff resolution notes, patron notice; staff-initiated reports deferred; photos dropped |
| **reports** | Many CSV and PDF exports; `GET /reports` is mock (F5) | Pre-built reports only, CSV now, PDF/Excel export deferred; no ad-hoc SQL (dropped, security risk); no scheduling (deferred); a row limit and a permission per report |
| **saved-reports** | None | Only after `reports`; read-only, row-limited, logged |
| **translation** | None | English and Filipino switch for the app's own text, remembered per user (Ethan included; rule not written yet); staff-written content stays English |

### 4.4 Self-service and devices

| Spec | Has | Build or fix |
|---|---|---|
| **self-checkout** | None on `main` | Patron scans the copy on the web app (phone works; native app dropped), same blocks and limits as staff checkout, session timeout, audit; RFID, NFC and biometrics dropped |
| **self-checkout-kiosk** | `feat/self-service-kiosk`: 33 commits, no PR, last change 2026-10-19 | Large-button touch layout (included), on-screen or email receipt (receipt printer dropped). Decide whether to rebase the branch onto Postgres-only `main` or rebuild it from the spec; 33 MySQL-era commits will conflict |
| **offline** | None | Offline circulation with staff review of conflicts on upload; mobile offline, real-time conflict resolution and offline patron creation dropped. Low priority for one campus with internet |
| **recalls** | None | Deferred; overnight loans make recalls rare. Consider dropping |
| **pos** | Print cash payments, fine cash payments | Card payment dropped (no gateway); shift management and drawer reconciliation deferred; a daily cash total comes from reports |

### 4.5 Not to build

- **identity-providers** (school sign-in): dropped by Ethan on 2026-11-10. StiOrmocLibrary still has `docs/microsoft-entra-authentication-plan.md` with status `planned`. Either close that plan or record that StiOrmocLibrary keeps it on purpose.

---

## 5. Spec problems to settle before porting

1. **Decisions override spec text.** `borrowing-policy` R16 (renewal from the original checkout date) and R17 (hold pickup within 7 days) contradict decisions Q6 and checkin Q3. `borrowing-policy` R14 ("restricted if fines ≥ cap") conflicts with the decision to keep clearance and restrictions separate. A builder who reads only the spec will build the wrong thing. Add a note at each of these rules, or rewrite the rules.
2. **Six included items have no rules yet:** list recommendations, automatic on-site use, patron self-service on-site use, serial suggestions, bulk CSV suggestion import, and the language switch. Write the rules before planning them.
3. **[Librarian] values to confirm before go-live:** the processing fee (spec default PHP 50), the fine cap (StiOrmocLibrary's code default is PHP 500 in `fine-calculator.ts`), the suspension rate, hold pickup days (suggested 2), and the open-claims warning threshold (suggested 3).
4. **Two REA specs are still drafts:** `accounts-sign-in` (built in REA, but its spec status still says draft) and `catalog-search`. Approve them before porting.
5. **Small one-line specs.** Many of the 2026-11-10 specs (acquisitions, serials, course-reserves, pos and others) have short rule titles only, such as "R2: Fund allocation". They are enough to plan, not to build: the plan doc must spell out each rule's fields, limits and errors, and Ethan approves those.
6. **Closing time.** REA's calendar shows "7:00 AM to 5:00 PM", the Final Draft says the same, and StiOrmocLibrary's Phase 4 T4 asks for 7:00 PM. Ask the Librarian once and set it in the calendar.

---

## 6. Open branches and PRs

| Branch / PR | State | Recommendation |
|---|---|---|
| PR #13 `feat/renewal-management-v2` | Ready for review; migrations `017`, `018` | Review against the renewals decisions (section 4.1), then merge. Close draft PR #4 (`feat/renewal-management`), which it replaces |
| Draft PR #3 `feat/long-overdue-and-damage-case` | 3 commits, 2026-10-10, MySQL era | Use it as a reference for F1 and lost-items long-overdue; rebuild on current `main` |
| Draft PR #2 `feat/stocktake-sessions` | 4 commits, 2026-10-11 | Rebase or rebuild against the `stocktake` spec |
| `feat/self-service-kiosk` | 33 commits, no PR | Decide: rebase or rebuild (section 4.4) |
| Draft PR #10 `feat/dynamic-attendance-qr` | Spec waiting for JohnBazty (gate 1) | Continue through the reverse-feature gates |
| Draft PR #12 `feat/printer-supply-availability` | Spec waiting for JohnBazty (gate 1) | Continue through the gates |
| Draft PR #9 `chore/reverse-feature-process` | Pipeline and handoff docs | Merge, so `reverse-feature` and `docs/FEATURES.md` reach `main` (the `plan-and-build` skill refers to them) |
| `feat/ui-ux-rebuild` | 1 commit, 2026-10-11 | Check whether it is still wanted; otherwise delete it after Ethan agrees |
| Local `main` | Behind `origin/main` | Run `git fetch` and `git switch main`, then `git merge --ff-only origin/main` |

---

## 7. Code health and user experience

- **Coverage minimum not enforced.** `test:coverage` in `apps/api/package.json` and `apps/web/package.json` reports coverage but has no threshold, so it never fails. Add `--test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80` (Node) and `coverage.thresholds` (Vitest), as REA does.
- **Tests.** 60 API and 35 web test files. Write a test per spec rule as each feature is built (REA rule: every business rule has a test).
- **JavaScript leftovers.** 12 API source files are still `.js`, mostly the old session sign-in (F7). Removing the old sign-in removes most of them.
- **Large files.** `circulation.service.ts` is 786 lines, close to the 800-line ceiling. Split it (checkout, return, requests) before adding check-in and renewals.
- **One loanability rule.** Circulation, reservations, catalog availability and the kiosk should all call one function that decides if a copy can be lent (REA items R9).
- **Dark mode and color tokens.** No `prefers-color-scheme` support. Add semantic tokens with light and dark values, keeping STI blue, yellow and white, text contrast 4.5:1 and UI parts 3:1.
- **Accessibility.** Follow REA's form rules: visible labels, `role="alert"` for errors, `role="status"` for results, focus kept inside dialogs, never color alone.
- **Stale docs.** `docs/system-context.md` still says the app is a "presentation-ready prototype" with mock endpoints and MySQL. `docs/source-of-truth.md` still mentions MySQL. Update them, because agents read them first.
- **Invoices.** Payment PDFs are internal receipts. Do not call them invoices until finance approves the format (Phase 2 A10).

---

## 8. Suggested order

1. **Safety sprint:** F1 job runner, F5 mock data, F6 delete routes, F8 RLS check, then F2, F3, F4 and F7 sign-in (one plan).
2. **Library Staff role** and the permission module (#2).
3. **Audit log viewer** (#7) and **settings catalogue** (#4).
4. **Calendar port** (#5): ranges, yearly holidays, overrides, past-date lock.
5. **Email notices** (#9a).
6. **Circulation:** borrowing-policy additions, merge renewals PR #13, check-in with hold trapping, holds, due and overdue notices, patron restrictions.
7. **Money:** payments with GCash verification, lost items with processing fee and refunds, discharge requests.
8. **Patrons:** membership expiry, patron import, semester expiry, privacy export and anonymization.
9. **Catalog:** label sheets, duplicate detection, title lookup, books received, stocktake, cover images, catalog search (after spec approval), batch edit.
10. **Later:** course reserves, lists and recommendations, reviews, problem reports, purchase suggestions, acquisitions, serials, MARC import, translation, on-site use, self-checkout and kiosk, reports and saved reports, offline.

---

## 9. Not checked

- I did not run the apps, tests, coverage, or the Supabase advisors. Every "Has" entry comes from routes, migrations and plan docs, not from using the screens.
- I read the REA specs' rule titles and the decisions, not every rule's full text. The plan doc for each feature must read the full spec.
- I did not review PR #13's code against the renewals decisions; that is its own review.
- Phase 2 items A2 to A11 in `docs/system-fixes-and-features-plan.md` are planned and were counted as not built.
