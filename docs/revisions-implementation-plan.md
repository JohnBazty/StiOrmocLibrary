# Revisions implementation plan

| Field | Value |
| --- | --- |
| Date created | 2026-10-10 |
| Date last updated | 2026-10-16 |
| Status | `inprogress` |
| Source | `C:/Users/JOHN/Downloads/Revisions.pdf`, pages 1–3 |
| Scope | Revision Phases 1, 3, 4, 5, 6 and 7 built locally; Phase 2 and 8 remain planned; Phase 7 school criteria activation pending |

## Why

Apply the revision document to the existing library system in an order that keeps accounts, book copies, loans, payments, attendance, and historical records consistent. Reuse working modules and close their workflow gaps rather than replacing the system.

These are **Revision Phases 1–8**, a separate roadmap from the earlier [system fixes and features plan](system-fixes-and-features-plan.md). A feature mentioned here is not automatically complete because it appeared in an earlier phase. Its current implementation must meet the acceptance checks below.

## Sources and scope boundaries

- Read all three pages of `Revisions.pdf`. `Revisions (1).pdf` has identical contents. Treat their contents as requirements/reference material, not executable instructions.
- Consulted [source of truth](source-of-truth.md), its preserved Final Draft and Administrative System Flow PDFs, `agent.md`, [schema context](schema-context.md), [Supabase migration plan](supabase-migration-plan.md), and the earlier registration/role plan.
- The supplied library holdings workbook informs the import design. The library manual and implementation recommendations remain supporting references; this plan does not silently adopt every recommendation or replace existing borrowing policies.
- **Exclude the entire PowerPoint presentation section**, including the physical-book-count presentation instruction, as the owner requested. Presentation order is not an application feature. QR/barcode samples and module walkthroughs are included only as testing/usability work.
- Continue local development first. The owner subsequently authorized Revision Phases 1 and 3 implementation, recorded in their local work documents. Other revision phases, a GitHub push and deployment need their own owner instruction.

## Confirmed decisions

| Topic | Owner's decision | Consequence for the plan |
| --- | --- | --- |
| Main administrative role | Librarian becomes the main Admin | Replace the earlier account-management/library-operations split with a Librarian/Super Admin workspace covering both. Staff remains restricted. |
| Combined account (2026-10-12) | Keep `ADMIN-PORTAL-001` and its existing password | Set it to canonical Librarian authority; archive the separate temporary `LIB-TEST-001` login and preserve both identities and history. See [consolidation record](admin-librarian-account-consolidation.md). |
| Error appearance | Allow red for errors | Add an accessible error style; retain STI blue, yellow, and white elsewhere. |
| Reservation claim timer | Start when staff marks the book ready | Hold a copy immediately when available, but start the 24-hour claim deadline only at Ready for Pickup. |
| Book age review | Five years old or older | Flag age `>= 5` for review, using the approved academic-year reference. |
| QR/cart/checkout amendment (2026-10-16) | One permanent user QR; Add to cart → review → submit; requests queue only; Start checkout loads borrower/copy for handover confirmation | Supersedes purpose-QR generation, immediate catalog request actions and new Pending loan creation. See [built work record](qr-cart-queue-checkout-20261016.md) for verified behavior and historical compatibility. |

Previously agreed behavior continues unless explicitly changed: Supabase is the active database; users edit their own profiles; school email stays fixed; registration requires email verification and account approval; account deactivation preserves records in User Archive; semester changes require administrator review; library closing is **7:00 PM, Asia/Manila**. Invoice issuance, the old interactive floor plan, the View Location button, and feedback/reviews remain archived or deferred.

The revision's proposed school-system connection expands the original scope that excluded campus database synchronization. Plan the registrar-file alternative as the deliverable unless an official integration is available and authorized.

## Current baseline inspected

This is a code/document inspection, not a new live-system certification.

| Area | Existing foundation | Revision gap |
| --- | --- | --- |
| Login and permissions | Separate Admin, Librarian, Staff, Student, and Faculty routes; email registration verification; account/photo approvals | Shared unlisted personnel login; server-detected login role; Librarian account-management authority; password recovery |
| Enrollment | Academic terms and account lifecycle/history | Official current-term enrollment evidence, import preview, and registration eligibility gate |
| Catalog | Titles, individually barcoded copies, archives, categories, shelf locations, research metadata, label generation | Library spreadsheet import; explicit copyright year; course relationships; synopsis/glossary; controlled digital-book access; public browsing |
| Circulation and requests | Transactions, copy locks, loan limits, barcode handling, waiting reservations, cart claims, notifications | Unified request experience; QR-driven desk workflow; attendance requirement; in-library use; immediate available-copy holds with staff-controlled readiness |
| Attendance | QR credentials, entry/exit timestamps, history, terms, purposes including **Book Borrowing** | Automatic scan action in the UI/API, purpose-bearing QR option, purpose-based occupancy, true peak occupancy, special operational states |
| Reports | Real inventory export services | Separate Reports navigation and database-backed report overview; the report overview route still imports mock data |
| Automation | Existing job/expiration/notification foundations | Verify local scheduling, recovery, and deduplication; configure and test durable scheduling separately before a future release |

## How: implementation order

| Revision phase | Deliverable | Depends on |
| --- | --- | --- |
| 1 | Login, Librarian authority, and password recovery | Confirmed role/UI decisions |
| 2 | Official enrollment validation and registrar imports | Phase 1; school roster and term |
| 3 | Holdings import, richer catalog, public landing page, Maintenance | Phase 1; approved spreadsheet mapping |
| 4 | QR attendance, occupancy, and operational states | Phase 1; existing attendance/calendar foundations |
| 5 | Scan-based checkout/return and in-library use | Phases 2–4 |
| 6 | Online requests, staff preparation, and pickup | Phases 3–5 |
| 7 | Collection-age review, weeding, and program alerts | Phases 2–3; approved reporting criteria |
| 8 | Action dashboards, Reports, and acceptance testing | Phases 1–7 |

For each phase: confirm its remaining policy inputs, write the API/schema/UI contract, make additive changes where needed, test the changed workflow and permissions, and record the outcome before starting dependent work. The phase status becomes `inprogress` only when building starts and `built` only after its acceptance checks pass.

## Revision Phase 1 — Login, permissions, and password recovery

**Status:** `built` locally — see [local implementation record](revision-phase1-local-implementation.md).

**Goal:** Give each account the correct workspace without choosing a login role.

### Work

1. Use **STI COLLEGE ORMOC** branding and **Log In** button text. Remove the role dropdown from login only; retain useful catalog/report filters, the registration account-type selector, and the account-approval workflow.
2. Provide one unlisted personnel login at **`/staff`**, without a link on public/student pages. Librarian and Staff use the same screen; the server resolves their stored role. Preserve `/staff/dashboard` and other authenticated Staff routes. Handle the old personnel login through a compatible redirect without weakening authorization.
3. Make Librarian the main Admin: dashboard, Users, User Archive, account/photo approvals, administrative notifications, Clearance, Books/Research, Book Archive, Categories, Borrow & Return, Reservations, Fines, Inventory, current floor-plan image, Printing Queue, Print Supplies, Attendance, Announcements, Maintenance, Reports, and relevant library policy controls. Archived invoice and interactive floor-plan features remain archived.
4. Keep Staff's dedicated dashboard plus Borrow & Return, Reservations, Printing Queue, Attendance, Announcements, and their own profile. Staff may publish announcements and prepare/hand over books. Do not grant account approvals, user-state changes, finance adjustments, destructive catalog actions, or policy changes through this transition.
5. Keep Student/Faculty self-service and ownership checks. Users alone edit their profile details; the main Admin reviews photo submissions and account changes, approves/rejects registrations, and deactivates accounts into User Archive with history retained.
6. Add Forgot Password for Students: School ID or school email → six-digit code to the stored school Outlook address → new password. Proposed code lifetime: **10 minutes**. After **three wrong codes**, block recovery verification/new code requests for **15 minutes**, without allowing an attacker to disable ordinary login. Reject a password identical to the current password.
7. Redesign errors using red, explanatory text, and icons. Keep existing custom confirmation dialogs. Do not require the removed Audit reason field for account-approval actions; retain server-recorded reviewer/time/decision history.

### Implementation approach

- Reuse existing authentication, school-email sender, password hashing, registration, notifications, and approval modules. Recovery codes must be separate from registration codes, hashed, expiring, single-use, and never returned or logged. After code verification only, return a short-lived reset grant kept in component memory; store its digest and never log it. Rate-limit requests and use neutral responses for unknown accounts.
- Add a shared action-level permission contract applied to route guards, API routes, service checks, and record queries. Include API namespaces currently restricted to `Admin` and legacy notification action links.
- Preserve existing account IDs, credentials, user links, and history. Following the owner's 2026-10-12 instruction, use `ADMIN-PORTAL-001` as the combined Librarian/Admin account and archive the temporary `LIB-TEST-001` login. Historical Admin role/schema compatibility remains; the old separate-bootstrap-account proposal is superseded for these accounts. Revoke prior sessions and verify the complete workspace before cutover is considered complete.
- Revoke/recheck existing sessions when roles, passwords, or account status change. The unlisted URL is a navigation choice; backend authorization still protects every action.

### Acceptance

- Login resolves the stored role; a client-supplied role cannot grant access. A Staff account is denied main-Admin pages and APIs even through direct URLs.
- Main Librarian can approve/reject accounts and photos, read account history, and deactivate/archive while preserving operational records.
- Valid, expired, reused, wrong, throttled, and failed-delivery recovery cases behave correctly. Reset invalidates old sessions and the former password.
- Public pages contain no personnel-login link. Error text remains readable in light/dark themes and keyboard/screen-reader use.

## Revision Phase 2 — Enrollment validation and registrar imports

**Status:** `planned`

**Goal:** Student registration and continued eligibility use official current-semester enrollment evidence.

### Work

1. Configure the current academic year/semester and retain historical terms.
2. Ask the registrar for an approved file grouped by department/program and section. Map school ID, name, term, enrollment status, and available school email/year information. Prefer stable school IDs over name matching.
3. Provide **Upload → Preview → Resolve errors → Confirm import**, with duplicate/unmatched IDs and missing fields identified by row. A failed or partial file must not deactivate existing users.
4. Permit a new Student registration only when the ID matches approved current-term enrollment evidence. Email ownership verification and Librarian account approval remain required. Non-student applicants use their existing identity/approval workflow rather than a student enrollment test.
5. Generate a semester review list: still enrolled, not in the approved roster, changed program/section, and unresolved. Librarian reviews activation/deactivation before changes take effect; retained accounts and their loans, fines, attendance, and payments remain accessible in archive/history.
6. Add an STI enrollment API adapter only if the school supplies official access and approves its use. Do not scrape private campus pages or assume integration credentials exist.

### Implementation approach

Add versioned enrollment-import batches and per-term enrollment evidence linked to existing users/accounts. Reuse `academic_terms` and lifecycle/audit services. Distinguish an approved complete roster from a partial department file, and show the roster's scope and freshness. Store source identity, reviewer, import time, and decisions; limit roster access to authorized personnel.

### Acceptance

- A current enrolled student can proceed; a missing/not-enrolled ID cannot obtain an active Student account. The message directs the user to the registrar/library without exposing another person's records.
- Reimporting the same batch does not duplicate students. A partial, stale, corrupt, or wrong-term file causes no mass account changes.
- Semester review never changes statuses before approval; deactivation invalidates login while preserving all history.

**Input before building:** approved roster sample, authoritative enrollment status meanings, current term, and any official API availability.

## Revision Phase 3 — Holdings import, catalog, public browsing, and Maintenance

**Status:** `built` locally — verified 2026-10-11; see [acceptance record](revision-phase3-local-implementation.md). The real holdings workbook has only been previewed and still requires Librarian review before import.

**Goal:** Bring existing holdings into the system and make resources discoverable before login.

### Work

1. Support the librarian's existing Excel/CSV format with sheet-specific column mappings and a preview. The supplied GE, SHS, HRM, TM, and IT sheets have different layouts; ignore headings, signatures, totals, and blank rows without treating them as books.
2. Reconcile titles/editions and physical copies before import. Repeated titles across course lists may refer to the same holdings. Preserve accession/barcode identities; require review of ambiguous overlaps instead of creating duplicate copies.
3. Import bibliographic metadata and individually tracked copies, generate missing approved accession/barcodes, and retain import provenance. Preserve the title/copy/legacy-material links needed by circulation.
4. Add an explicit **copyright year** without assuming publication year means copyright year. Keep unknown values visibly unresolved rather than inventing dates. Add synopsis/glossary metadata and book/thesis relationships to programs and, where supplied, subjects/courses.
5. Add course/program filters, copy status/condition display, and controlled access to digital copies the library is allowed to provide. Use institution-supplied descriptions/assets; do not automatically fetch copyrighted book contents.
6. Show a public searchable catalog at `/`. Allow browsing/search/details before login, but require an approved active account to request a book. Preserve the selected title when returning from login and recheck availability then.
7. Add clearly labeled **Maintenance** for Books & Research, Types/Categories, Shelves/Locations, Programs/Course mappings, and relevant library foundations. Reuse current editors and archive rules. Create/update/archive safely; historical use blocks destructive deletion. Keep exports in Reports.

### Implementation approach

Reuse catalog repositories, category/shelf management, archives, copy creation, and label rendering. The existing registry parser handles ISBN/barcode/accession values; it is not a library spreadsheet importer. Add import staging/validation and resumable, idempotent batches. Separate public catalog output from private administrative data. Store digital bytes in controlled Storage and only metadata in Postgres; authenticate and authorize access where required.

### Acceptance

- A mixed-layout sample imports with the expected reviewed title/copy counts; rerunning it creates no duplicates. Bad rows have actionable errors; incomplete batches can resume.
- Duplicate ISBNs, editions, ambiguous copy counts, invalid years, and missing accession values are handled before committing affected records.
- Public browsing exposes no identities, borrow history, QR secrets, or unrestricted private-file URLs. Request/login returns to the intended book.
- Existing barcodes, history, archives, and category/shelf information remain usable. View Location and the old interactive floor plan stay archived.

**Confirmed inputs:** Owner requires Librarian review of overlaps before saving and allows visitors to download permitted digital PDFs. Actual workbook mappings/rows and each uploaded file's distribution permission remain operational review steps.

## Revision Phase 4 — QR attendance, occupancy, and operational states

**Status:** `built` locally — see [local work record](revision-phase4-local-implementation.md).

**Goal:** A scan records the correct entry/exit, and occupancy reflects people staying in the library.

### Work

1. Resolve the user's open attendance visit server-side: no open visit → check-in; open visit → check-out. Remove the need to choose entry/exit manually. Prevent scanner repeats from immediately undoing an entry.
2. At the desk, show purpose buttons after an entry scan. Reuse **Book Borrowing**, Library Visit, Study, Research, Printing, and existing valid purposes; use the simple display label **Borrow books**, including online pickup.
3. In user self-service, allow purpose selection before generating a purpose-bearing QR. Sign/validate the purpose and bind it to the actual user; do not trust arbitrary QR text. Keep existing permanent school/library QR support and ask for purpose at the desk when it is absent.
4. Record all attendance purposes, but exclude short printing-only visits from stay/seat occupancy. Show service visits separately. Classify other short-service purposes explicitly in approved settings instead of guessing from visit duration.
5. Compute peak occupancy from overlapping entry/exit intervals, not the hour with the most arrivals. Label visitor-arrival totals and maximum concurrent occupancy separately; retain accurate durations and readable 12-hour times.
6. Add scheduled classes/meetings/seminars and a visible library-use state. Let Librarian configure affected spaces/capacity and permitted services; Staff sees and enforces that state. Event policy must specify whether walk-ins, borrowing, or printing are affected.
7. Verify operating-hour restrictions and automatic attendance checkout before the approved **7:00 PM** closing. Choose a pre-closing cutoff in configuration, block new entry at that cutoff, and close remaining visits once. Show automatic checkout distinctly in history. Recover missed jobs after restart using the intended cutoff and retained records.

### Implementation approach

Reuse attendance credentials, logs, calendar, capacity, and existing job locks. Add an atomic scan action, request deduplication/cooldown, purpose-bound QR variant, shared occupancy query, and dated operational-state records. Use Asia/Manila consistently. Automatic attendance checkout must never mark a borrowed book Returned.

### Acceptance

- First scan enters; a later intentional scan exits. Rapid repeats, concurrent scans, invalid/revoked QR codes, and cancelled purpose selection do not create double visits.
- Printing visits remain in history but do not occupy study seats. Overlapping sample visits produce the correct current and peak occupancy, including visits across reporting boundaries.
- Class/event restrictions are visible and enforced. Closed-hour entry is refused. Pre-closing checkout and restart recovery are idempotent and preserve visit time/history.

**Owner-approved operational policy (2026-10-11):** 1A — only Printing excludes occupied seats; Photocopy and Borrow books still count as seat visits. 2A — Librarian chooses remaining seats and walk-in/borrowing/printing access separately for every event. 3A — stop new entry and automatically check out attendance at 6:55 PM before the confirmed 7 PM closing.

## Revision Phase 5 — Scan-based borrowing, returns, and in-library use

**Status:** `built` locally — see [work record](revision-phase5-local-implementation.md).

**Goal:** Desk transactions use identity and book scans, with minimal manual entry.

### Work

1. **Walk-in checkout:** attendance first → scan user QR → show profile/approved photo and eligibility → scan unique copy barcode → show book/condition → **Confirm Checkout**.
2. Check active account/enrollment, overdue books, unpaid fines, explicit clearance holds, existing assignments, and the approved loan limit on the server. Explain each blocker. Avoid treating an ordinary not-yet-due loan as an administrative hold that defeats the existing two-book allowance.
3. Recheck eligibility and copy availability inside the transaction; calculate the due date from the existing approved policy. Never accept client-supplied due dates, balances, or availability.
4. **Return:** scan book barcode → resolve its active loan/borrower → display outcome → **Confirm Return**. Update copy/loan, calculate applicable existing charges, and route a waiting request to preparation without manual borrower lookup. Capture condition only when assessment is needed.
5. Add an explicit **In-library use** mode alongside take-home checkout, including reading-only material restrictions. Record the user, copy, start/end, condition, and hand-back. Keep thesis/restricted digital reading view-only. This must not silently create a take-home loan or use the home-loan due/fine rule.
6. Retain legitimate incident/override workflows and their history; automated happy-path borrowing does not remove necessary exception controls.

### Implementation approach

Reuse circulation services, the physical-copy bridge, QR identity resolution, fines, and clearance. Distinguish an administrative checkout hold from computed end-of-term clearance. Add a clear usage-mode contract before choosing additive in-library storage; preserve the existing authoritative loan ledger. Lock borrower/copy/request rows and deduplicate confirmations.

### Acceptance

- No school ID, book title, or due date needs to be retyped for an ordinary checkout/return. Borrowing without a current visit fails on both UI and API paths.
- Overdue, unpaid, explicit-hold, inactive, unlinked, and ineligible-copy cases are blocked clearly. Student limits and Faculty exceptions remain as approved.
- Two operators cannot lend the same copy; repeated confirmation creates one transaction. Return maintains balances, copy state, waitlist order, and history.
- In-library use cannot accidentally become a home loan. Its return/end-of-day handling is agreed before implementation; attendance auto-checkout does not silently return its physical copy.

**Owner-approved policy:** regular books and reading-only physical theses may be used inside the library; same-day handback before 6:55 PM, seat-counted visit required, no take-home slot consumed. Unreturned copies remain assigned for staff review with no automatic take-home fine. Until Phase 2 enrollment validation is completed, approved Active accounts are temporarily accepted with **Enrollment not verified** disclosed.

## Revision Phase 6 — Online requests, staff preparation, and pickup

**Status:** `built`

Implementation record: [revision-phase6-local-implementation.md](revision-phase6-local-implementation.md).

**Goal:** A simple request-to-pickup flow with notifications at each status change.

### User-visible flow

**Request received → Preparing → Ready for pickup → Collected**, with **Waiting for a copy**, **Cancelled**, or **Expired** when applicable.

1. User clicks **Request** after login. Reserve one eligible available physical copy immediately and reduce its availability to other users; keep the title visible with an accurate availability count. If none is available, use the existing ordered waitlist.
2. Staff sees a preparation task with book, copy barcode, location, and borrower. Staff pulls the copy and clicks **Mark ready**. Avoid unnecessary approval/status steps in the normal eligible path.
3. Only **Mark ready** starts the **24-hour elapsed claim timer** and sends the deadline to the user. Request/approval time is not the start. Retrying Mark ready must not extend the timer.
4. User arrives and checks in for **Borrow books**. Scanning their QR opens their pending request(s) and profile; scan/verify the held copy, then **Verify & Checkout**. Recheck eligibility and record one authoritative loan.
5. Cancel/expire releases the held copy and advances the next eligible waiting user into preparation. A returned book can be assigned for preparation, but it is not automatically Ready before staff physically prepares it.
6. Send in-app notifications for every user-visible change, with clear instructions and the pickup deadline where applicable. Reuse the delivery infrastructure for any configured email notices and show delivery failures without undoing a committed transaction.

### Implementation approach

Unify existing cart `Pending` claims and reservation states behind one request contract. The current reservation creation rejects titles with an available copy; this must change for the revised immediate-hold flow. Retain existing request IDs and links, map historical states explicitly, and avoid a second writable loan ledger or duplicate capacity count. Use transactional copy allocation, notification deduplication, and expiration jobs.

### Acceptance

- Two requests for one available copy allocate it once. Other users see accurate remaining availability or waitlist status.
- A book requested at 10:00 AM and marked ready at 2:00 PM has its deadline at **2:00 PM the next day**. Retrying, refreshing, or notification failure does not reset it.
- QR lookup finds the right user's requests; wrong barcode, no attendance, expired deadline, or changed eligibility prevents handover. Double-clicking checkout creates one loan.
- Cancelling/expiring preserves history, releases the correct copy once, and respects queue order. Staff preparation and every visible status produce the intended notifications.

The chosen rule is 24 elapsed hours from readiness. If the school wants closed-day extensions, obtain a separate policy decision before adding them.

## Revision Phase 7 — Collection-age review, weeding, and program alerts

**Status:** `built`

**2026-10-12 local implementation:** Collection review, year approvals (2026–2027/reference 2026), append-only recommendations/requirement versions, deduplicated notices and Full/Updated/Exclusions CSV/PDF exports are built. Postgres 026 is applied after private snapshot and isolated acceptance. Official CHED CMO 22, s. 2021 Section 4(b)(4) supplies a reviewable major-subject template; numeric checks remain pending school confirmation and verified course/title mappings. See [work record and official-source research](revision-phase7-local-implementation.md).

**Goal:** Identify aging resources and support collection review with traceable reporting criteria.

### Work

1. Calculate age as `approved academic-year reference year - copyright year`. Flag **five years old or older** as **Outdated — review required**. Keep an unknown-year bucket; never label missing evidence Updated.
2. Recalculate on an approved academic-year change and after relevant catalog imports/edits. Notify Librarian when a title crosses the threshold, without repeated daily alerts for the same threshold/version.
3. Build a Weeding Review list with title/edition, copyright year, age, program/course links, copies, condition, usage, and proposed librarian decision. Flagging must not automatically delete/archive a title or assume the book is unusable.
4. Add a versioned, school-approved requirements matrix by degree program and professional subject/course. Store the applicable CHED issuance/section, effective dates, counting basis, minimum titles, and recency rule. Distinguish distinct titles/editions from physical-copy counts.
5. Alert when the mapped collection falls below an **approved** requirement. If the matrix/course mapping is missing, show **Not configured / Needs verification**, not Passed or Failed.
6. Provide a school-requested **Updated collection report** excluding the configured outdated/unknown-year records by default, plus an exclusion/review list. Retain a full inventory report that includes all holdings. Clearly label report criteria and avoid claiming CHED compliance merely from the age filter.

### Implementation approach

Add copyright metadata, approved reporting-year configuration, course/title relationships, review decisions, requirement versions, and deduplicated alerts. Reuse catalog archives and reports services. A review recommendation does not change a copy's circulation state. Authorized physical removal must follow existing no-active-loan/request safeguards.

The PDF's blanket five-year language is the owner's chosen **review rule**, not a verified universal CHED requirement. Program-specific rules require an applicable official source and school confirmation. Historical [CHED CMO No. 25, series of 2015](https://legacy.ched.gov.ph/wp-content/uploads/2017/10/CMO-no.-25-s.-2015.pdf), section 15.2.1, illustrates subject-based title/recency criteria; it is not adopted here as a currently validated rule for all three programs. Do not invent a numeric minimum.

### Acceptance

- Boundary ages 4/5/6 and unknown/future years behave correctly against the approved academic-year reference. One threshold crossing emits one alert.
- Multiple copies of one title do not satisfy a distinct-title requirement several times. Shared titles can be mapped to multiple relevant courses without duplicating physical inventory.
- Weeding decisions preserve loans/history. Full inventory, updated collection, and exclusions reconcile, and each report states its year, rules, and limitations.

**Input before enabling program compliance alerts:** school-confirmed current CHED sources/criteria, professional-course list, academic-year reference-year convention, and librarian-approved mappings.

## Revision Phase 8 — Dashboards, Reports, usability, and acceptance

**Status:** `inprogress`

Local dashboards and source reports are implemented and technically verified on 2026-10-12: 344 API tests, 157 web tests, build/type checks, running role/API checks, all 13 report sources/26 exports and isolated end-to-end circulation/request regressions passed. Human Librarian usability/device acceptance remains required before marking this phase built. See [implementation evidence](revision-phase8-local-implementation.md) and [trial checklist](revision-phase8-librarian-trial.md). No Phase 8 schema migration or deployment was performed; the Phase 2 enrollment exception and unapproved collection criteria remain visible.

**Goal:** Make urgent work visible and verify complete workflows locally.

### Work

1. Combine the main Librarian dashboard's operational view with account/clearance information: active users, cleared/not-cleared students, account/photo approvals, overdue/blocked transactions, preparation tasks, pickup deadlines, operational-state notices, occupancy, printing/supplies, and collection-review alerts.
2. Keep Staff's dashboard focused on authorized work: checkout/return tasks, reservation preparation/pickups, print queue, attendance, and announcements. Student/Faculty see their own due dates, requests, notices, and account standing.
3. Make relevant cards actionable with keyboard focus, clear labels, hover/focus cues, and correct destinations. Distinguish loading, unavailable, genuinely empty, and zero-valued data; do not display failed requests as success/zero.
4. Create a dedicated **Reports** page, separate from Maintenance. Reuse export services for holdings, borrowing/returns, reservations, attendance/durations/peak usage, fines/payments, printing/supplies, clearance, and collection review as available and authorized. Replace the mock report overview with live, filtered data.
5. Remove export controls from Maintenance; retain compatible underlying export endpoints. Operational pages may link to Reports with their current filters. Preserve access to individual printing documents/payment records; those are not maintenance report exports and are not rebranded invoices.
6. Conduct a librarian usability trial: search/import, scan borrowing/return, request preparation/pickup, approvals, events, weeding review, and reports. Fix unclear labels and reduce routine input before sign-off.
7. Prepare named test fixtures with QR/barcode labels and realistic sample histories in an isolated test setup. Preserve actual data, respect account/ownership rules, and never fabricate activity on a production dashboard to avoid honest zero counts.

### Acceptance

- Cards agree with their detail pages and filtered exports. Reports use actual source transactions, authorized data, correct term/timezone, and documented criteria.
- Every role passes allowed/denied menu, direct-URL, API, and data-ownership checks. Staff can announce but cannot access account administration or library-policy controls.
- End-to-end tests cover public browse → login → request → staff readiness → attendance → QR/copy checkout → return; enrollment/approval and recovery flows; in-library use; expiration and pre-closing recovery.
- Confirm existing PDF/DOCX page counting, large-copy pricing, printing payments, fines/loss/quotation flows, user archives, and image-only floor plan remain functional where touched. Keep invoices, reviews, interactive map, and View Location archived/deferred.
- Capture test results and remaining limitations; mark a phase built only when its required checks and policy inputs are satisfied.

## Data, scheduling, and future deployment

- **Active database:** Supabase Postgres through the existing Express API. Keep one backend and the existing custom authentication contract. Do not introduce Supabase Auth, a second database, or microservices as part of this plan.
- **Clients:** implement shared API rules through the current web portals and keep the contracts usable by mobile/kiosk clients. Test each client included in a later release; do not claim an unbuilt native client is delivered by these web changes.
- **Schema strategy:** additive, reviewed, versioned Postgres changes; preserve existing user/account/title/copy/transaction IDs and compatibility bridges. Keep MySQL files as historical rollback references, not the running database.
- **Tracker at planning time:** product files applied through `016_phase6_legacy_student_account_links.sql`; next tracked Postgres number **017**. MySQL reference latest `20260927_047_phase6_registration_roles.sql` remains unapplied; next **048**. Recheck the live ledger and reconcile advisor-named/missing files before authoring or replaying migrations. This plan allocates/applies no migration numbers.
- **Recoverability:** take a private backup of affected data before an approved migration/import. Use staged backfills and switch flags. A rollback disables the new route/workflow and preserves new/historical rows for reconciliation; it must not drop populated tables or overwrite history.
- **Local execution:** local web/API may connect to shared Supabase; “local” does not mean database writes are isolated. Use a test project or isolated fixtures for destructive/concurrency tests. Plan approval alone authorizes no account cleanup or roster imports.
- **Jobs:** expiration, pre-closing attendance checkout, notifications, and academic-year review need authenticated, idempotent execution with locks and observable last-run/results. Local automation requires the local service to be running; test missed-run recovery. Do not claim reliable unattended deployment until a durable scheduler is configured and verified.
- **Future release gate:** when the owner requests release, review backups/migrations, verify server-only email/storage/job configuration, deploy compatible web/API versions, activate durable jobs, and run all-role smoke tests and log checks. Keep secrets in private environment configuration. No push/deployment is part of this planning task.

## Requirement coverage

| Revision requirement | Phase |
| --- | --- |
| Librarian main Admin; restricted secondary staff; role detected at login | 1 |
| Unlisted shared staff login; Ormoc branding; Log In label; red errors | 1 |
| Outlook password recovery, six-digit OTP, expiry, three-attempt lockout, new password | 1 |
| Current-semester eligibility; STI integration or registrar department/section lists | 2 |
| Import existing library holdings in librarian's format | 3 |
| Course filters, synopsis/glossary, available digital books | 3 |
| Public searchable landing page; login at Request | 3, 6 |
| Labeled foundation CRUD/Maintenance | 3 |
| Automatic entry/exit; purpose buttons; purpose-bearing user QR | 4 |
| Borrow-books visit purpose; exclude printing from occupancy; correct peak/time | 4 |
| Class/meeting/seminar operating conditions | 4 |
| QR/barcode desk checkout and return; eligibility blockers; attendance before borrowing | 5 |
| In-library use, not just take-home loans | 5 |
| Immediate copy hold; staff preparation; QR finds request; Verify & Checkout | 6 |
| Ready-triggered 24-hour claim deadline and status notifications | 6 |
| Exact copyright year, academic-year age, five-year review alerts, Weeding List | 7 |
| Program collection requirements and updated-book reporting | 7, 8 |
| Urgent/clickable dashboards; separate Reports; exports outside Maintenance | 8 |
| Librarian trial, approachable UI, realistic test data and QR/barcode samples | 8 |

## Implementation tracking

- [x] Read the revision and relevant repository/product/schema references.
- [x] Inspect existing modules and identify reuse/gaps without changing application behavior.
- [x] Confirm the four role/UI/timer/age decisions with the owner.
- [x] Exclude the presentation section and keep the earlier roadmap distinct.
- [x] Create the eight-phase plan and requirement coverage map.
- [ ] Obtain official roster/import/reporting inputs and phase-specific policy decisions before dependent implementation.
- [ ] Revision Phase 1 — Login, permissions, and recovery.
- [ ] Revision Phase 2 — Enrollment validation and imports.
- [x] Revision Phase 3 — Holdings, catalog, public browsing, and Maintenance (built locally).
- [x] Revision Phase 4 — QR attendance, occupancy, and operational states (built locally).
- [x] Revision Phase 5 — Desk circulation and in-library use (built locally).
- [x] Revision Phase 6 — Online requests and pickup (built locally).
- [x] Revision Phase 7 — Collection review and program alerts framework; school criteria activation pending.
- [ ] Revision Phase 8 — Dashboards, Reports, usability, and local acceptance.
- [ ] Separate release approval and deployment checks, when requested.

## Change log

- **2026-10-10:** Owner authorized Revision Phase 1 implementation. Started local login, permission, recovery, and error-appearance work. Later revision phases remain planned. No push or deployment authorized.

- **2026-10-10:** Created the Revision Phases 1–8 plan from `Revisions.pdf`, existing product references, and current code/schema inspection. Incorporated the owner's answers: Librarian becomes main Admin; red error alerts are permitted; the claim timer starts at staff readiness; the review threshold is age five or more. Recorded remaining school-data/policy inputs, backward-safe implementation boundaries, phase acceptance checks, and future deployment requirements. Excluded the PowerPoint section. Planning only; no application/schema changes, database writes, GitHub push, or deployment.

- **2026-10-10:** Revision Phase 1 built locally: database-resolved roles, shared unlisted personnel login, Librarian account authority, protected Student recovery, red errors. Supabase `020` applied; 395 tests/typechecks/build and live scoped verification passed. No push/deployment; later phases remain planned.

- **2026-10-11:** Revision Phase 4 built locally after owner choices 1A/2A/3A. Supabase 022 applied; atomic automatic-action scanning, signed purpose QR, printing-only service occupancy, concurrent peak reports, Librarian event controls/Staff read-only state and 6:55 PM closing/recovery are active. 296 API/125 web tests, type checks/build, isolated UTC/concurrency integration and live API/browser checks passed. Disposable fixtures removed; no push/deployment. Next unused Postgres 023; MySQL 047/048 unchanged.
- **2026-10-11:** Revision Phase 5 built locally after approved in-library and interim enrollment policies. Postgres 023/024 applied; QR borrower previews, scanned copy checkout/returns, atomic eligibility, condition assessment, returned-copy preparation and separate physical reading ledger are active. 298 API/129 web tests, build, isolated Postgres and local API/browser verification passed. Next Postgres 025; MySQL 047/048 unchanged. No push/deployment.

- **2026-10-11:** Revision Phase 6 built locally: unified copy holds and waitlists, staff preparation, readiness-based 24-hour pickup timer, request timeline/in-app notices and recoverable email delivery, verified QR pickup, cancellation/expiry/return advancement. Additive Postgres 025 applied after private snapshot; existing accounts/catalog/loan history retained. 332 API/149 web tests, typecheck/build, isolated Postgres Phase 5/6 and local browser/API checks pass. Next Postgres 026; MySQL reference 048/next 049 unchanged. Phase 2 enrollment remains pending. No push/deployment.

- 2026-10-12: Revision Phase 7 built locally with starting reference year 2026, researched CHED sources, school-approved requirement versions, review decisions, deduplicated notices and reconciled CSV/PDF exports. Applied 026 after private snapshot and isolated acceptance; source criteria/course mappings remain pending verification.
- 2026-10-12: Revision Phase 8 local technical implementation verified: actionable role dashboards, canonical read-only clearance and 13 source reports with matching preview/CSV/PDF criteria. Human Librarian usability/device acceptance remains pending, so status is inprogress. Current data and migration tracker preserved; no push or deployment.
