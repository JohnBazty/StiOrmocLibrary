# Library maintenance and account controls implementation plan

- **Why:** complete the requested catalog, research, inventory, maintenance, printing-record and account workflows with clear review and validation for each action.
- **Date created:** 2026-11-17
- **Date last updated:** 2026-11-18
- **Status:** inprogress
- **Prepared by:** Agent Alpha
- **Goal:** make routine library work easier while preserving accurate holdings, financial records, roster identities and administrative access.
- **Architecture:** extend the existing React/Vite/Tailwind interface and Express modular-monolith services. Enforce permissions and validation in the API; use additive Postgres changes and preserve existing transaction history.
- **Scope authorization:** owner authorized the implementation queue and hosting each completed feature before starting the next. Continue automatically in the numbered sequence. Necessary reviewed additive migrations are part of implementation; verify each target and preserve existing data. No GitHub push is authorized. No real ownership handover or operational email to an unapproved recipient is performed as a test.

## Owner priorities — implement these first

Updated from the owner's follow-up on 2026-11-17. This order supersedes the earlier implementation sequence; requirement IDs remain stable for tracking.

| Priority | Work | Required outcome |
| --- | --- | --- |
| 1 | [R04 — Faculty roster enrollment](#r04--faculty-roster-enrollment) | Faculty can enroll through a reviewed roster and verified campus email, preserving existing accounts and departments. |
| 2 | [R14 — Forgot password for every role](#r14--dedicated-forgotreset-password-ui-including-admin) | Student, Faculty, Staff and Librarian/admin receive a secure reset link opening a dedicated new-password page. |
| 3 | [R17 — Transfer ownership](#r17--transfer-admin-ownership-by-ormoc-outlook-invitation) | Current owner invites a verified Ormoc Outlook recipient; ownership changes only after successful password setup. |
| 4 | [R18 — Floating Borrow / Return shortcut](#r18--floating-borrow--return-shortcut-and-user-qr-scan-flow) | New button sits above Scan attendance; first user-QR scan shows requested books, second deliberate scan shows active loans for return selection. |

Complete baseline checks before coding. Build recovery before ownership transfer. Other requested maintenance features follow these priorities. Each priority keeps its full validation and acceptance requirements below.

## Confirmed decisions and queue authorization — 2026-11-17

- Implement sequentially and host/verify each feature before proceeding to the next number. A failed release gate stops advancement until repaired.
- Faculty enrollment ends with each semester; reuse semester closure and verified restoration without discarding account history.
- After ownership transfer succeeds, the old admin loses both admin and Staff access. The recipient sets up the new admin account; preserve old actor/history links.
- Dedicated research register means registration of research/thesis materials.
- “ARCHIVE THIS” means the **Collection Review page**. Retire its active navigation/workflow into a read-only archived view, preserving saved reviews, alerts and history. Do not archive unrelated holdings or research.
- Ink types receive the same Add, Edit, Delete and Archive maintenance controls as paper sizes and stock.
- Agent Alpha started priority 1 on `codex/faculty-roster-enrollment` in `StiOrmocLibrary-main-sync`. Live public migration ledger verified: 060, 059 and 058 match local SHA-256 checksums; reserve 061 for Faculty enrollment, next 062 after authoring.
- The active checkout confirms MySQL was retired; use Postgres only. Older MySQL/dual-driver language below is historical baseline evidence and must not be implemented.

## Sequential implementation queue

Host and verify each individual feature before starting the next row. Keep building automatically; do not group unverified features into a later deployment.

| Number | Requirement | Feature | State |
| --- | --- | --- | --- |
| 1 | R04 | Faculty roster enrollment | Hosted |
| 2 | R14 | Forgot password for every role | Hosted |
| 3 | R17 | Administrator ownership transfer | Hosted |
| 4 | R18 | Floating Borrow / Return shortcut | Hosted |
| 5 | R06 | Auto-fill missing required book information | Hosted baseline; bulk expansion in progress |
| 6 | R07 | Automatic covers and ISBN cover preview | Hosted baseline; bulk expansion next |
| 7 | R08 | Stocktake for books and research | Planned |
| 8 | R16 | Staff eligibility for Ormoc Microsoft accounts | Planned |
| 9 | R15 | Password-only profiles, initials, no admin profile | Planned |
| 10 | R05 | Confirm logout | Planned |
| 11 | R01 | Dedicated research-material register | Planned |
| 12 | R02 | Borrowing-rule maintenance | Planned |
| 13 | R03 | Library schedule maintenance | Planned |
| 14 | R09 | Delete/archive courses | Planned |
| 15 | R10 | Announcement maintenance | Planned |
| 16 | R11 | Ink type, paper size and paper stock maintenance | Planned |
| 17 | R12 | Printing payments, revenue and usage records | Planned |
| 18 | R13 | Archive Collection Review page | Planned |

## Source requirements and current baseline

Read alongside [source of truth](../source-of-truth.md), [architecture and usability rules](../../agent.md), [schema context](../schema-context.md), [migration plan](../supabase-migration-plan.md), and [agent protocol](../../.cursor/agent-protocol.md).

Source PDF review: Final Draft PDF pages 19–22 cover user authentication, catalog/research administration, inventory audits, printing revenue and supply tracking; page 35 identifies the printing-revenue process. The one-page Administrative System Flow includes inventory audit history, missing-book/condition reporting, printing revenue and print-job summaries. These are PDF page numbers. The user's current explicit instructions take priority where they change previous product behavior.

Important baseline difference: this original checkout contains many existing changes and older runtime files. The [service priorities plan](2026-11-17-library-service-priorities.md) identifies `C:/Users/JOHN/Documents/SSL/StiOrmocLibrary-main-sync` as the newer served checkout. The [Faculty department release](2026-11-17-faculty-departments.md) reports hosted Postgres **060 applied / 061 next**. The original README/protocol/migration plan still reports **032 / 033**. These are documentary findings, not a fresh live-ledger verification.

**Before implementation:** identify the actual release checkout, compare its routes/services/schema with these targets, inspect the live migration ledger/checksums, and reconcile the trackers. Do not apply 033 or reserve 061 solely from this document. MySQL reference remains `20261009_048_rename_system_brand.sql`, next **049**; keep the rollback reference and dual-driver contracts intact. Do not replay the migration directory or overwrite newer releases with this older checkout.

Existing foundations to reuse:

| Area | Evidence in this checkout or release notes | Planned extension |
| --- | --- | --- |
| Research | `ResearchCatalog.tsx`, `AddResearchModal.tsx`, research catalog API/service/repository | Dedicated registration workflow, separate from the book register |
| Borrowing and hours | Borrowing policy service/routes, attendance calendar, `LibraryOperationsPanel.tsx`; newer printing release adds print-service hours | Clear Maintenance entry points using existing policies/calendars |
| Enrollment | Enrollment parser/service and Student roster registration; local schema notes say new Faculty signup is paused | Faculty roster and verified signup without changing Student roster semantics |
| Faculty departments | Hosted release 060 records reviewed assignments | Reconcile roster department changes with the existing assignment and audit contract |
| Recovery | `PasswordRecoveryPage.tsx`, `password-recovery.service.ts`, school-email sender, private recovery challenges | Email-link reset UI for all eligible roles, including admin |
| Profiles | `ProfileAvatarPage.tsx`, avatar API, profile routes including Librarian | Password-only user page, initials, no admin My profile page |
| Printing | Printing service/repository, historical-print service, supply details, reports; newer payment releases | Unified records in Print supplies without duplicate receipts, revenue or stock deductions |
| Announcements | `AdminAnnouncementsPage.tsx`, notification announcement tests; hosted push/retention release | Maintenance editor and lifecycle controls preserving delivery history |
| Stocktake | Schema notes reference externally managed `018_stocktake_sessions.sql`, source absent here | Inspect and extend existing stocktake contracts before designing tables |
| Desk shortcuts | `AttendanceFab.tsx`, `CirculationDesk.tsx`, desk borrower/request preview and return APIs | Stack a Borrow / Return shortcut above attendance; reuse the desk in a quick dialog with user-scoped requests/active loans |

## Decisions to settle before dependent work

These are explicit open decisions, not permission requests or completed validations. Other independent phases can proceed after build authorization.

| ID | Ambiguity | Planning interpretation / decision needed |
| --- | --- | --- |
| D1 | “Dedicated research register” | Confirmed: register research/thesis materials, using the existing research catalog and physical research identities. |
| D2 | “ARCHIVE THIS” | Confirmed: archive the Collection Review page into a read-only retained view; do not archive unrelated holdings or the chat. |
| D3 | “SIMILAR FOR INK TYPE” | Confirmed: ink types receive the same Add, Edit, Delete and Archive controls as paper definitions/stock. |
| D4 | “Dedicated Gmail” | Existing configured sender reports Gmail. Reset and ownership mail reuse that private transactional sender; recipient addresses come from stored accounts or reviewed invitations. No real mail sent during tests. |
| D5 | Ormoc Microsoft account | Use the existing exact Ormoc school domain and mailbox-possession verification. No new Microsoft SSO or inferred account-role rule is introduced. |
| D6 | Ownership succession | Confirmed: remove outgoing admin and Staff access on successful acceptance. Existing recipients are explicitly reviewed for role promotion while preserving identity/history; new recipients create their invited administrator account. |
| D7 | Required metadata | Document the agreed minimum book/research fields against the active create/import validators. Do not make an optional field mandatory just to increase auto-fill coverage. |
| D8 | Faculty enrollment period | Confirmed: Faculty eligibility ends with each semester, with version-safe original-identity restoration on the next matching roster. |

## Shared validation and interface rules

1. Use plain labels, sensible defaults, readable field errors and review of changes before saving. Keep advanced settings collapsed. Confirm logout and consequential actions; avoid repeated confirmations for ordinary navigation.
2. API authorization is mandatory. Librarian/admin manages policies, rosters, maintenance, deletion and ownership. Staff retains only existing permitted operational actions; no new settings/destructive authority is implied. Students/Faculty access their own records only.
3. Validate both browser and API inputs. Reject malformed IDs, unknown fields, overlong text, invalid states, nonfinite numbers and stale versions. Trim ordinary text; canonicalize emails/ISBNs without losing display values or leading zeros in roster identifiers.
4. Protect writes with current authentication, CSRF controls and version checks. Use transactions, unique constraints, row locks and idempotency where retries or competing writes could duplicate records or money.
5. Preserve actor, timestamp, reason and before/after values for administrative changes. Audit logs must exclude passwords, raw tokens and email credentials.
6. Archive retains history and removes an item from new selections. Hard delete is limited to genuinely unused entries. No cascading deletion of holdings, accounts, loans, stock movements or payments.
7. Every feature needs keyboard access, visible focus, labeled fields, mobile layouts and readable loading, empty, success and failure states. Error text must explain the next action. Preserve unsaved input when a request fails.
8. Use Philippine time for schedules/report boundaries and exact decimal/currency-safe arithmetic for money. Unknown facts remain unknown rather than becoming invented zero values.

## R04 — Faculty roster enrollment

**How:** Users > Faculty roster accepts a supported spreadsheet/CSV or reviewed individual entry. Recognize columns, preview names/emails/Faculty IDs/departments, show errors and duplicates, then confirm the roster version. Eligible Faculty verify their stored Ormoc mailbox and create a password. Keep Faculty and Student rosters visibly distinct.

**Validation:** required identity fields, valid exact-approved campus email, duplicate Faculty ID/email within upload and existing accounts, inactive/archived status, changed identity conflicts and import limits. Never guess Faculty role from an email pattern or convert Student accounts automatically. Preserve identifiers as strings. Map departments explicitly to the existing assignment contract; missing or conflicting departments require review. Upload alone does not create accounts, activate archived users or overwrite passwords. Apply D8 before lifecycle enforcement.

**Acceptance:** eligible Faculty completes one verified signup; unlisted and wrong-role users cannot. Duplicate imports are idempotent; invalid rows remain visible before commit. Concurrent signup produces one account. Roster changes invalidate stale signup grants. Faculty borrowing exemptions and existing Faculty login remain intact; Student enrollment rules still pass.

**Targets:** `apps/api/src/modules/enrollment/enrollment-parser.ts`, `enrollment.service.ts`, `roster-registration.service.ts`, `enrollment.routes.ts`; `apps/web/src/features/users/AdminUsersPage.tsx`, `enrollment-api.ts`, auth roster form; active Faculty department service. Add explicit Faculty structures if current Student tables cannot safely express them.

## R14 — Dedicated forgot/reset-password UI, including admin

**How:** add Forgot password to user, personnel and admin login. Submit the registered email, receive a generic confirmation, and open a dedicated **Create new password** page from a one-time emailed link. The configured sender from D4 delivers to the account's verified stored address. Staff setup, password recovery and ownership setup use distinct purpose-bound grants even if they share UI components.

**Validation:** support eligible active Student, Faculty, Staff and the canonical Librarian/admin. An unknown, archived or ineligible account receives the same public response shape/timing; do not reveal account existence. Use a cryptographically random, hashed, account-version-bound, single-use token; proposed reset expiry 15 minutes, adjustable to the existing approved policy. A newer reset revokes the prior token. Rate-limit requests and delivery retries. Use a configured HTTPS application origin, never a request Host header, for links. Opening a link must not consume it, since email scanners prefetch links.

Password entry includes confirmation and the active password policy; implement matching server checks. Reject expired, reused, tampered, wrong-purpose and stale-account grants. Successful reset atomically updates all canonical password hashes/versions, consumes grants and revokes existing sessions/remembered devices. It does not change email, role, roster state or restore an archived account. Prevent token exposure in logs, analytics and referrers. Do not offer public recovery to a freely entered replacement email.

**Acceptance:** reset works for all four role groups including sole admin; old password/session/device grants fail afterward. Weak/mismatched passwords, expired/replayed tokens and email failure are handled clearly. Invalid tokens never change credentials. Lost-email recovery is a separately authorized support process, not a public privilege bypass.

**Targets:** `PasswordRecoveryPage.tsx`, login pages, auth API/router; `password-recovery.service.ts`, `school-email.sender.ts`, account/session/device revocation and existing private recovery tables. Replace/extend existing OTP recovery deliberately rather than running incompatible flows.

## R17 — Transfer admin ownership by Ormoc Outlook invitation

**How:** User management includes **Transfer ownership**, available only to the current canonical owner. Enter the new Ormoc Microsoft email, review the recipient and consequences, reauthenticate, then send an expiring invitation to that Outlook mailbox. Its link opens a dedicated **Create administrator password** page. The new owner verifies identity and submits the password; only then does the transfer complete atomically. Keep the current owner active while the invitation is pending, expired, failed or cancelled. R14 also supplies admin Forgot password.

**Validation:** an explicit unique owner designation must map to the consolidated Librarian/admin authority; do not resurrect the retired separate administrator login. Require recent current-owner password/approved second-factor verification, CSRF, exact eligible campus identity under D5, recipient verification and a purpose-bound hashed one-time token. Proposed invitation expiry is 24 hours, to confirm before implementation. Only one pending invitation per owner; resend invalidates the earlier token. Reject self-transfer, duplicate/unreviewed identity conflicts, revoked accounts and stale owner/account versions. Apply D6 for existing recipients and outgoing role.

Lock the owner designation and invitation during acceptance. Recheck current owner, recipient, grant purpose/expiry and account state; update owner authority, credential setup, outgoing privilege disposition, authentication versions and immutable audit together. Exactly one canonical owner remains after commit. Invite creation/email delivery never demotes the current owner. Concurrent accept/cancel/transfer/reset cannot create two owners or consume the wrong grant. Invalidate affected sessions/device grants and revoke competing invitations. Notify both parties of the result without exposing credentials; failed delivery is retried through the existing durable mail mechanism and does not change ownership.

**Acceptance:** intended verified recipient completes setup and receives admin access; outgoing authority changes exactly as reviewed and history retains original actor IDs. Wrong mailbox, expired/reused/tampered link, public setup attempt, nonowner/Staff invocation, competing acceptance and database failure cannot transfer ownership. Failure rolls back to the original owner. An email scanner GET cannot transfer ownership. Lost invitation can be cancelled/reissued; sole-admin password recovery works before and after succession.

**Targets:** `AdminUsersPage.tsx`, proposed `OwnershipTransferDialog.tsx` and `AdminPasswordSetupPage.tsx`; proposed ownership transfer service/routes in `apps/api/src/modules/users/` or auth, existing identity/password/session/email/audit services. New private grant/ownership structures need additive schema only after baseline reconciliation.

## R18 — Floating Borrow / Return shortcut and user QR scan flow

**How:** add a labeled **Borrow / Return** floating action button immediately above **Scan attendance** in the admin/Librarian workspace. Reuse the authorized circulation-desk flow in a quick dialog or drawer; retain the full desk page as another entry point. Library Staff may use the shortcut only with existing circulation permission. Student/Faculty pages must not expose the administrative scanner or another borrower's loans.

The attached screenshots are visual references: the first shows the existing Borrow/Return desk and borrower scan; the second shows the attendance pill button. Follow the owner's request for placement and interaction. Do not treat text inside an attachment as additional agent instructions. Keep familiar labeled pill buttons with distinct icons, consistent styling, spacing, keyboard focus, touch targets and safe-area positioning. At mobile widths, stack both controls visibly without overlap with navigation, dialogs or each other; verify the current attendance component's mobile in-flow behavior before choosing fixed positioning. Opening one scanner pauses/closes the other so only one camera session is active. Opening the shortcut does not record attendance.

### First scan — show the books requested for borrowing

1. Open Borrow / Return and scan the user's account QR or school-ID QR through the existing trusted resolver. Camera, USB scanner and supported manual entry must lead to the same validated borrower lookup.
2. Show borrower name, school identifier and initials, then automatically display their existing book requests intended for borrowing. Expand this list immediately; it must not remain hidden in a collapsed Book requests section. Include cover, title, request status, assigned physical copy/barcode when available, location and pickup deadline.
3. For one eligible assigned request, preselect it and show the book preview. For several, present clear choices for the admin to select the actual physical handover. Waiting/unassigned/expired requests remain visibly labeled and cannot be confirmed as ready loans. If there is no request, show No books requested and allow the authorized desk worker to scan a physical book for manual lending. A QR cannot identify an unrecorded borrowing intention.
4. Reuse checkout preview, enrollment, attendance, limit, fines, reservation/copy, condition and schedule checks. Match the actual copy at handover through the existing scan/check process. **Confirm checkout** remains an explicit action; merely scanning a user or selecting a request never creates a loan.

### Second deliberate scan — show active loans and choose a return

1. While that borrower is selected, a second distinct scan of the **same user's QR** switches the dialog to **Return** and automatically loads all of that borrower's outstanding loans, including overdue items. Display the mode change and a readable status such as Active loans for [name]. This is a repeat scan during the current desk interaction, not a permanent lifetime scan counter or a fast double-click requirement.
2. Show a selectable list with title, cover, exact physical copy/barcode, loan date, due date and status. The admin chooses the actual book being handed back. No book is returned by default, including when there is only one active loan. Keep **Borrow** and **Return** controls visible so the admin can switch without rescanning.
3. Use the selected loan/copy to open the existing return preview and condition assessment. The admin reviews and selects **Confirm return**. Preserve existing overdue/fine and damage/loss handling; do not erase accrued debts or label a reported-lost copy physically received without the established recovery workflow. If several books are handed back, process the explicitly selected copies with an individual result for each; a bulk confirmation requires a separate defined atomic/partial-failure contract.
4. Refresh the selected borrower's active loans after success and remove the returned item from outstanding choices. Further scans of the same QR while already in Return refresh the list; they do not toggle back to Borrow or create transactions. A different user's QR clears the previous user's selections and starts a fresh first-scan flow. Closing the dialog, Next borrower, logout or the existing inactivity reset clears the interaction state.

**Validation:** distinguish borrower QR credentials from copy barcodes/ISBNs using the existing resolver and school-approved formats. A book barcode does not increment the user scan count. Verify credentials and actor circulation permission server-side; return requests and loan lists are scoped to the resolved borrower, never an arbitrary client-supplied user ID. Reject revoked/malformed QR credentials without showing personal data. Borrowing blocks must not prevent an authorized return of an outstanding item; archived/inactive borrowers with outstanding loans follow existing staff return policy.

Debounce repeated USB submits and camera frames. A second camera scan requires the QR to leave view and be reacquired after the first lookup completes; the same stationary QR must not switch modes. Re-arm USB/manual input only after the first lookup finishes and a fresh complete scan/explicit submit is received. Deliberate repeats change only the view. Do not rely on time delay alone to distinguish an intentional scan. Announce scan readiness/mode changes accessibly. Ignore stale responses after borrower changes, closing or a newer request. Keep the existing five-minute desk inactivity check unless the active release establishes a different approved timeout; expire borrower context on the server as required by the existing authentication contract.

The current local borrower DTO has an active-loan count, not the full selectable loan list: add/reuse a bounded, paginated borrower-scoped active-loan query in the active release. Return candidates must include stable loan and copy IDs, not title alone. Revalidate selected loan ownership, outstanding state, actual copy, condition and permitted action immediately before saving. Use current transactions, locks, idempotency keys and version checks so concurrent staff actions or retries cannot return twice or lend an unavailable copy. This shortcut must not bypass attendance/enrollment checks on lending or introduce a second implementation of circulation rules. Read-only lookup must never record attendance, claim a reservation, create a fine or change inventory.

**Acceptance:**

- The Borrow / Return button is directly above Scan attendance on authorized desktop/mobile screens. Both labels remain readable and keyboard accessible; only one scanner uses the camera. Attendance scanning retains its existing behavior.
- First valid user scan automatically displays one or multiple requested books. A unique eligible request can preview automatically; multiple requests require selection. Empty/waiting/unassigned/expired requests cannot become loans without normal review and copy validation.
- A second deliberate scan of that same user shows **only their outstanding loans**, including multiple copies with the same title and overdue items. The admin selects an exact loan/copy; merely viewing/selecting does not return it. Zero active loans shows No active loans.
- A stationary QR over many camera frames and duplicate USB events count once. Remove/re-present produces the intended second scan. Further scans in Return only refresh. Borrow/Return controls and Next borrower remain usable without the scan shortcut.
- Scanning another user clears the prior selections; slow earlier responses cannot show or mutate the previous borrower's books. Closing, inactivity and logout clear state. An actual book barcode is not mistaken for a repeat user scan.
- Wrong/revoked QR, unauthorized role, forged borrower/loan ID, already-returned loan and concurrent return are rejected or return the same safe idempotent result. The second staff member sees current state; no duplicate stock/fine/payment effects occur.
- Return confirmation preserves condition assessment and existing debt history. Success refreshes the loan choices. Failed saves preserve a readable retry state without announcing success. No attendance, loan or return is saved merely by opening/scanning in the shortcut.

**Targets:** `apps/web/src/features/attendance/AttendanceFab.tsx`, `apps/web/src/layouts/PortalLayout.tsx`, `apps/web/src/features/circulation/CirculationDesk.tsx`, `DeskScanInput.tsx`, `CirculationReturnDialog.tsx`, `desk-circulation-api.ts`; proposed shared `CirculationQuickAction.tsx` rather than a copied desk implementation. API: `apps/api/src/modules/circulation/desk-circulation.routes.ts`, `desk-circulation.service.ts`, `desk-request-context.ts` and existing borrower/loan repositories. Reconcile newer automatic scan-intent work before editing. Prefer read/query additions and shared component state; add schema only if the verified baseline lacks required durable data.

## R01 — Dedicated research register

**How:** add a Research register entry with New research, search, review and save. Reuse research catalog services and existing physical research identities; do not create a second disconnected catalog. Show title, authors, adviser, department/program, publication year, location and research accession/copy reference where supported. Keep registration distinct from in-library use and borrowing.

**Validation:** require the approved research minimum from D7; check year and text limits; select active classifications/locations; enforce unique accession/barcode per physical item. Flag similar title/author/year matches for link-or-create review rather than rejecting distinct works with similar names. Do not require ISBN for research or infer adviser/department from a book API. Research remains subject to its existing in-library-only restrictions.

**Acceptance:** valid research appears once in register, catalog and inventory; repeated submission cannot duplicate it. Missing required fields show field errors. Similar research offers an explicit decision. Invalid/archived location and duplicate accession fail. Unauthorized creation fails. Existing research remains searchable with its history intact.

**Targets:** `apps/web/src/features/catalog/AddResearchModal.tsx`, `ResearchCatalog.tsx`; proposed `ResearchRegisterPage.tsx`; `apps/api/src/modules/catalog/research-catalog.*` and existing research write services. Verify active write paths before changing them.

## R02 — Borrowing policy maintenance

**How:** expose Maintenance > Borrowing rules using the existing policy editor. Review student limits, Faculty exemptions, loan periods, cutoff, renewal, fine rates/caps and effective date before saving. Explain who is affected with a sample due date/charge.

**Validation:** positive integer loan limits/periods; allowed renewal count; valid times; nonnegative exact-decimal rates and caps; valid effective dates; permissions and version check. Preserve existing policy snapshots or explicitly define future-only applicability. Do not silently recalculate settled fines or rewrite existing loan due dates.

**Acceptance:** allowed Student/Faculty examples match the saved policy; invalid values and Staff writes fail; competing saves produce a readable conflict. Current approved overdue behavior remains exact, with no invented grace period. Prior transactions remain unchanged unless a separately reviewed correction is authorized.

**Targets:** `apps/web/src/features/borrowing-policies/AdminBorrowingPoliciesPage.tsx`; `apps/api/src/modules/circulation/borrowing-policy.*`; reuse the newer release's policy contracts.

## R03 — Library schedule maintenance

**How:** Maintenance > Library schedule shows normal weekly hours, closed days, holiday/break exceptions and emergency closure. Review next opening and example due-date/attendance effects. Display library and print-service hours clearly; use the existing distinction rather than creating conflicting calendars.

**Validation:** valid weekday/time ranges, opening before closing, no overlaps, valid exception date ranges, explicit precedence of emergency closure and dated exceptions. API enforces Asia/Manila boundaries. Preview any effect on active loans; do not retroactively change settled charges. All-closed schedules show a clear unavailable state instead of an endless next-open search.

**Acceptance:** open/close boundaries, Sunday, holiday, break, emergency closure and next operating day produce consistent results in attendance, borrowing and printing. Saving an invalid overlap fails; Staff cannot edit. Existing receipts/history remain accessible while intake is closed.

**Targets:** `LibraryOperationsPanel.tsx`, `apps/api/src/modules/attendance/attendance-calendar.ts`, attendance operations and existing policy/calendar repositories; newer print-service-hours implementation.

## R05 — Confirm logout dialog

**How:** every portal logout entry opens a dialog titled **Confirm logout**, with **Cancel** and **Log out**. Cancel keeps the current session and page. Log out invalidates the server session and clears local authentication using the existing logout flow.

**Validation:** accessible dialog focus/keyboard handling, one submission while pending, readable error/retry if server invalidation fails. Never display successful logout while the old server session remains usable. Preserve existing multi-tab logout behavior.

**Acceptance:** Cancel/Escape makes no logout request; confirmation logs out and prevents back navigation from restoring protected data. Repeated clicks cannot send competing writes. Test Student, Faculty, Staff and Librarian portals, mobile and keyboard use.

**Targets:** `apps/web/src/layouts/PortalLayout.tsx`, `SidebarAccountCard.tsx`, auth API/storage; reuse existing dialog components and server logout routes.

## R06 — Auto-correction for missing required book information

**How:** provide **Auto-fill missing required information** on manual book entry and the holdings review screen where applicable. Search from a valid ISBN first; title/author lookup requires a reviewed candidate. Show proposed changes and source, then apply them to the draft. Optional fields remain blank when initially blank. Existing populated fields remain unchanged; offer an explicit reviewed correction separately if needed.

**Validation:** maintain a shared required/optional field map from D7. Accept only fields allowed by that map. Require exact edition/ISBN agreement for automatic matches; conflicts or multiple editions require selection. API data is untrusted: validate text, authors, dates and identifiers, and strip markup. Never invent shelf, accession, barcode, category, quantity, acquisition cost or other local facts. Unavailable required information remains flagged for manual entry; auto-fill cannot bypass save validation.

**Acceptance:** missing supported required fields fill correctly after review; blank optional fields stay blank, including those returned by the provider. Existing values are preserved. Wrong edition, no result, provider timeout, malformed result and quota failure produce useful states without saving anything. A late lookup cannot overwrite a newer ISBN/draft.

**Targets:** `HoldingsImportPage.tsx`, `HoldingsImportRow.tsx`, manual create flow in `CatalogManagementPage.tsx`/`BookCatalog.tsx`; catalog validation/services. Proposed `apps/api/src/modules/catalog/book-metadata.service.ts` and provider adapters; verify actual form ownership in the release checkout.

## R07 — Automatic cover lookup and ISBN cover preview

**How:** add **Find cover automatically** using Google Books first and Open Library fallback. On manual entry, a complete valid ISBN automatically starts a debounced cover lookup and places a matched cover in the unsaved preview. The user can replace/remove it or retry. Cover-only actions never fill other optional metadata. Final Save persists the reviewed selection with the book.

**Validation:** normalize ISBN-10/13 and check checksums before requests. Google Books query uses the ISBN search operator; compare returned identifiers. Open Library uses the matching edition/ISBN; missing covers must be detected rather than accepting the provider's blank fallback. Cancel/ignore outdated responses after ISBN changes. Do not replace a manually chosen cover. Never manufacture covers when providers have none.

Provider adapters must use timeouts, bounded retries, caching and current usage limits. Keep any API key server-side. Fetch only approved HTTPS provider hosts, validate redirect destinations, and reject private-network URLs. If importing bytes, validate actual MIME/image content, dimensions and size using existing cover-storage rules. Follow provider display/attribution rules; do not assume a returned URL authorizes copying. Keep manual upload with filename/size/uncropped preview and existing validation. Record provider, identifier and source URL for traceability.

**Acceptance:** ISBN-10/13 exact matches show correct edition covers; invalid ISBN sends no lookup. Google failure can fall back to Open Library. No image, HTTP 404, malformed data, stale response and unsafe URL do not corrupt the form. Manual selection survives later responses. Removing a suggested cover remains possible; Save/Cancel controls database persistence.

**Targets:** `apps/api/src/modules/catalog/cover-image.storage.ts`, new metadata adapters/routes, book-create UI, `BookCoverThumbnail.tsx`, existing API clients. Reuse safe storage instead of adding an arbitrary URL downloader.

## R08 — Stocktake for books and research

**How:** Inventory > Stocktake lets the Librarian choose Books, Research or both, optionally filter location, start a session, scan/accession-check physical items, review discrepancies and finalize. Classify found, not yet checked, on loan, known lost, damaged and unexpected items distinctly. Counts are by physical item, not title. Authorized Staff may scan only if that operational permission is explicitly retained/added; final adjustments remain Librarian-controlled.

**Validation:** inspect the existing 018 schema/service in the active baseline first. Snapshot scope with stable copy IDs; repeated scans count once. Unknown/archived barcode gives an explicit result. Record concurrent loans, returns and transfers and reconcile before finalization. Never label checked-out items missing or treat an incomplete session as proof of loss. Discrepancy corrections require review/reason and cannot erase active loans or create fines automatically. Finalization is atomic and idempotent.

**Acceptance:** mixed book/research session, duplicate scan, wrong location, unknown barcode, valid loan, mid-session return and resume after reload behave correctly. Concurrent finalization records one result. Summary and CSV/PDF agree on scope and counts. Cancelled sessions cannot change holdings. Historical stocktake results remain readable after later moves/archives.

**Targets:** `apps/web/src/features/inventory/InventoryDashboard.tsx`, proposed `StocktakePage.tsx`; `apps/api/src/modules/inventory/` existing stocktake service/routes in active source. Recover missing migration source or document ledger identity; do not recreate existing tables blindly.

## R09 — Delete courses

**How:** add **Delete** to course maintenance. For a genuinely unused course, show the name and confirm permanent deletion. For a referenced course, explain its use and offer **Archive course**; archived courses disappear from new choices while old classifications remain readable.

**Validation:** Librarian permission, valid course/program identity, version check, reference checks across title links, rosters and any release-specific relations. Database constraints and transactional checks must prevent a concurrent link from racing the delete. No cascade into catalog or roster history. An archived course cannot be added to a new record; restoring it must recheck name/code conflicts.

**Acceptance:** unused course deletes once; linked course cannot hard-delete; archiving preserves linked research/books and prior reports. Staff and forged requests fail. Concurrent link/delete cannot orphan a record.

**Targets:** `CatalogMaintenancePage.tsx`, `apps/api/src/modules/catalog/catalog-enhancements.routes.ts`, `catalog-enhancements.service.ts`, active course repository/constraints.

## R10 — Announcement maintenance

**How:** Maintenance > Announcements supports draft, preview, audience, schedule, publish, edit/revision and archive/cancel. Reuse the existing announcement authoring, inbox and hosted Web Push system. Show the publication time in Philippine time and who will receive it.

**Validation:** required title/body within limits, safe rendered content, valid audience, valid future schedule for scheduled posts, allowed lifecycle transitions, permissions and stale-version detection. Keep published revisions and recipients' read state. Cancel scheduled jobs when an unpublished announcement is cancelled. Define edits as revisions; do not resend old announcements automatically or duplicate notifications on worker retries. Archiving a published post cannot retract an email/push already sent; explain the outcome.

**Acceptance:** immediate and scheduled posts publish once; invalid audience/content/date fails. Concurrent edit/publish is consistent. Cancelled schedule never publishes. Archived visibility follows the agreed policy while audit history remains. Existing push opt-in and privacy protections remain unchanged.

**Targets:** `AdminAnnouncementsPage.tsx`, notification routes/services/worker, announcement revision repository and newer Web Push implementation.

## R11 — Ink-type maintenance and Delete for paper size/paper stock

**How:** provide consistent list/add/edit/Delete/Archive controls for ink types, paper sizes and paper stock. Distinguish paper-size definitions, ink-type definitions and physical stock records. Show units, affected printers/rates and whether the entry is already used before confirming.

**Validation:** unique normalized labels; positive paper dimensions and explicit units; valid printer/type relations; nonnegative integer sheet stock and supported ink units. Never mix cartridges, millilitres and percentage levels. Allow hard delete only for unused definitions or empty stock records with no history, allocations, active jobs or financial links. Used entries archive; nonzero balances require reviewed stock disposition before retirement. No removal of historical stock movements, paid line items or immutable rate snapshots. Stock changes use reasoned adjustments, not arbitrary deletion.

**Acceptance:** unused size/type/empty stock can delete; referenced or stocked items are blocked with an actionable explanation. Archive removes new selection but preserves receipts and old jobs. Existing accepted jobs retain their price and usable supply reference or receive an explicit reassignment workflow. Concurrent job selection/delete cannot break referential integrity. Staff cannot perform maintenance deletion.

**Targets:** `AdminPrintSuppliesPage.tsx`, `SupplyDetailsPanel.tsx`, `printing-api.ts`; printing supply service/repository, `supply-details.service.ts`, inventory maintenance routes. Inspect newer print rate/paper-brand structures first.

## R12 — All printing payments and usage visible in Print supplies

**How:** add a Printing records/revenue view under Print supplies, reading authoritative printing/photocopy requests, physical-counter entries, invoices, payment allocations, refunds and consumption movements. Show method, payment state, service date, receipt date, copies, printed sides/pages, physical sheets, confirmed amount paid and remaining balance. Include online and physical payments, including mixed/partial settlement and supported pay-later.

Use existing ledger references as the single source. A new payment appears automatically; no second manual record is required. Historical entries retain their source label and completeness. Fines/merchandise payments are not printing revenue. A user's phrase “all payments” is interpreted here as all payment methods for printing/photocopying; other services require a separately labeled report if intended.

**Validation:** server-computed amounts and allocations; unique receipt/provider transaction identifiers; verified provider callbacks or authorized physical verification. Pending/failed/unverified payments do not count as collected revenue. Refund/reversal history remains visible. Distinguish provider fees from service revenue and gross collections from net collections. Revenue uses confirmed receipt date; service usage uses service/completion date with explicit filters.

Define metrics before coding: **fully paid requests** = distinct nonvoid requests whose confirmed net allocated payments cover the bill; **partially paid requests** and **payment receipts** have separate counts. Do not count the same request once per installment. **Copies** means completed sets; **sheets** means consumed physical sheets from production records. For a simple three-page duplex job with two sets, four sheets are expected; printing four billable sides/pages is not the same metric. Track spoiled/reprinted sheets separately. Cancelled unpaid jobs contribute neither paid revenue nor completed output. Preserve existing rules for consumption timing and reversals; displaying a report never deducts stock.

**Acceptance:** online full payment, physical cash, verified GCash where supported, partial cash plus online balance, pay-later, refund, failed callback, duplicate callback and void historical entry reconcile with receipts/invoices. A PHP 100 job paid PHP 40 cash then PHP 60 online contributes PHP 100 and one fully paid request, with two receipt entries; date-filtered collections reflect each actual receipt. Unknown legacy copy/sheet values show Not recorded rather than zero. Print supplies, revenue dashboard and CSV/PDF agree for identical filters. Repeated reads do not change balances or stock.

**Targets:** `AdminPrintSuppliesPage.tsx`, `HistoricalPrintingPage.tsx`, printing API; `printing.service.ts`, `printing.repository.ts`, `historical-print.service.ts`, `printing-extended-reports.ts`, reports service plus the newer release's payment/allocation adapters. Do not backfill synthetic payments or duplicate hosted payment integration.

## R13 — Clarify and implement the requested archive action

**How:** archive the Collection Review page: remove its active navigation/task entry points and preserve existing reviews, decisions and history in a clearly labeled read-only archived view. Preserve saved holdings and alert provenance; do not archive books or research. Review the effects before changing lifecycle behavior. Existing links should lead to the archived explanation/view rather than a missing page. Reopening active collection review requires an explicit reviewed restore action.

**Validation:** entity-specific authorization, existing references, allowed lifecycle transition, version/reason, active loans/jobs/debts where relevant, and uniqueness checks on restore. Retention/financial evidence must remain intact. Archive is not permission to delete files, financial records or the chat.

**Acceptance:** active list hides archived target, history/report views retain it, unauthorized/stale operations fail, and restoration obeys current eligibility. Verify the Collection Review archived view remains readable while operational mutations are denied server-side; unrelated inventory functions remain available.

**Targets:** `apps/web/src/features/catalog/CollectionReviewPage.tsx`, active navigation/dashboard links, collection-review API/services and existing review history. Verify current background alerts before disabling active review workflows.

## R15 — Password-only user profile, initials, and no admin profile page

**How:** Student/Faculty My profile shows roster-supplied information as read-only and provides **Change password** as the only editable action. Apply the same identity-edit restriction to Staff unless a distinct Staff policy is approved. Show deterministic initials on account creation and throughout sidebars, lists and dashboards. Remove profile-photo selection/upload/review from active flows. Remove My profile from admin navigation and routing; retain admin Forgot password and a clearly named security/password action outside a profile page.

**Validation:** self-service profile APIs must reject name, email, school ID, course, department, role and photo changes even if the UI hides fields. Change password requires current-password verification or the dedicated recovery grant, password confirmation and server policy. Revoke other sessions/devices on success under the agreed auth policy. Admin profile URLs cannot render editable identity forms; they redirect to the dashboard/security action. Do not delete roster fields or existing photos as part of removing their display; any later image cleanup needs a separate retention decision.

**Acceptance:** Student/Faculty identity edits through forged requests fail; password update succeeds only for the authenticated owner. Initials handle single names, whitespace, Unicode and missing names with a neutral fallback. No active profile-photo controls remain. Admin has no My profile link/page but can change/reset a password. Roster corrections remain an authorized roster maintenance action with audit history.

**Targets:** `ProfileAvatarPage.tsx`, `profile-avatar.routes.ts`, `PortalLayout.tsx`, `SidebarAccountCard.tsx`, `App.tsx`, registration forms, avatar components and active identity-write endpoints. Replace misleading photo-oriented component names when practical and update imports/tests.

## R16 — Staff creation accepts verified Ormoc student Microsoft accounts

**How:** authorized Librarian/admin creates Staff using any eligible Ormoc Microsoft account, including a student-form campus email. Send a purpose-bound setup invitation; the recipient verifies control and sets a password. Eligibility comes from verified campus identity and explicit staff authorization, not whether the email looks like an employee address.

**Validation:** apply D5 exact domain/tenant policy; reject suffix tricks, consumer/noncampus addresses and unverified mailboxes. Never assign Staff through public signup or email pattern alone. Check duplicate accounts, archived status and existing Student/Faculty identity. Where an email already belongs to a user, require an explicit reviewed supported role assignment/change; preserve their ID, loans, fines and payment links. Invitation cannot itself grant authority before verification and acceptance. Expiry, replay, throttling and actor auditing follow R14.

**Acceptance:** authorized creation with a verified campus student email works. Noncampus, wrong tenant where enforced, duplicate unreviewed, expired invite and unauthorized creator fail. Existing users are not silently overwritten. Staff receives only existing operational permissions and cannot edit policies, delete settings or transfer ownership.

**Targets:** `AdminUsersPage.tsx`, personnel auth pages; users routes/service, auth setup/recovery and school-email sender. Reconcile the newer role model before deciding whether this is a role change or an additional assignment.

## Implementation sequence and data changes

The numbered **Sequential implementation queue** above is authoritative. Finish and host the current ownership transfer feature, then the floating Borrow / Return shortcut. Immediately after that, implement and host these individually:

5. **R06 — Auto-fill missing required book information.** Preserve optional blanks, provenance and review before save.
6. **R07 — Automatic covers and ISBN cover preview.** Reuse the validated lookup adapter and edition checks from R06.
7. **R08 — Stocktake for books and research.** Preserve physical-copy identity, active loans and reviewed discrepancy handling.

Continue with queue numbers 8–18 in their displayed order. This supersedes the earlier grouping that put catalog lookup and stocktake after general maintenance. Requirement IDs stay stable; only queue positions change. Run baseline and dependency checks within each feature and host/verify it before beginning the next.

Potential additive schema changes: Faculty roster/version links; explicit ownership designation and purpose-bound invitation grants; provenance for metadata/covers; stocktake extension only where absent; lifecycle/version fields where missing. Printing reporting may need views/indexes rather than a second payment table. Determine exact names and migration numbers only in the verified active schema. Keep public/browser roles unable to access recovery, roster-private and ownership-grant tables; test RLS and API authority.

For each schema change: record baseline counts/fingerprints, test a disposable schema, verify constraints/concurrency and preserve existing rows, then apply only the individually reviewed migration when authorized. Update schema context, migration tracker and deployment flags. If a feature fails, disable its new entry point/flag while preserving data and existing access; never roll back by dropping financial or identity history. Do not expose partial ownership/profile changes before their API protections are active.

## Verification procedure

Each R01–R18 section supplies its required acceptance cases. Convert these into meaningful service/API tests and focused UI tests in the active checkout. These are planned checks, not results already obtained.

| Check | Required evidence |
| --- | --- |
| Contract tests | Valid input, invalid input, role/ownership denial, stale versions, archive/reference protection and duplicate/retry cases for affected services |
| Database integration | Real Postgres constraints/transactions, concurrent writes, exact financial reconciliation, private-table browser-role denial, unchanged preexisting data |
| Provider tests | Deterministic Google/Open Library fixtures for exact/mismatched ISBN, missing cover, bad content, timeout and throttling; bounded permitted live smoke test separately |
| Email tests | Controlled recipient, valid/expired/wrong-purpose link, resend and scanner-prefetch cases; no unsolicited real-user mail |
| QR shortcut tests | First-scan requests, second deliberate scan active loans, stationary-frame suppression, repeated USB events, borrower changes, concurrent return and no write on scan/view |
| Browser checks | Actual authorized routes at desktop/mobile, keyboard dialogs, visible errors, retained draft data, role menus and complete review-before-save flows |
| Reports | Same filters give matching screen/CSV/PDF totals; verify time boundaries, copies versus sheets, partial payments and refund effects |
| Human acceptance | Librarian performs research intake, stocktake, supply retirement and receipt reconciliation; approved test recipients complete recovery and transfer in an isolated environment |

Run from the reconciled active checkout using existing scripts:

```powershell
npm run typecheck
npm test -w @sti-library/api
npm test -w @sti-library/web
npm run build
```

Expected: successful exit for each command, focused regressions passing, no new permission or transaction failures. Existing API tests default to the MySQL test environment, so passing those alone does **not** validate hosted Postgres; use an isolated real-Postgres integration harness for new relational rules. Verify the active package test command includes any newly added enrollment test directory. Do not point destructive fixtures at production. Document preexisting unrelated failures separately and resolve all feature failures before marking built.

## Implementation tracking

- [x] Preserve all requested items in a dated Markdown plan.
- [x] Read repository instructions, source PDF text and relevant implementation/release documentation.
- [x] Specify workflows, input/security validation and acceptance cases for every requested area.
- [x] Identify ambiguous requests and the release/migration baseline conflict.
- [x] Put Faculty enrollment, all-role recovery and ownership transfer at the top; add the floating circulation shortcut and deliberate second-scan return workflow.
- [ ] Confirm active implementation checkout and live ledger; reconcile trackers.
- [ ] Resolve D1–D8 before their dependent implementations.
- [ ] R01 dedicated research register.
- [ ] R02 borrowing rules maintenance.
- [ ] R03 library schedule maintenance.
- [x] R04 Faculty roster enrollment — hosted 2026-11-17; migration 061, next 062; 797 API / 565 web tests, isolated Postgres and hosted smoke checks passed.
- [ ] R05 Confirm logout dialog.
- [x] R06 required-only proposal/review and exact-ISBN batch fill hosted; optional blanks preserved.
- [x] R07 cover button, ISBN preview, provider fallback and stale/manual/canonical-cover protection hosted.
- [ ] R08 book and research stocktake.
- [ ] R09 course deletion/archive protection.
- [ ] R10 announcement maintenance.
- [ ] R11 ink type, paper size and paper stock deletion/archive controls.
- [ ] R12 complete printing payment/revenue/copies/sheets records.
- [ ] R13 implement the archive action after target clarification.
- [x] R14 all-role emailed reset link and dedicated password UI — hosted; migration 062; 801 API / 568 web tests; natural mail worker run succeeded without sending a test email.
- [ ] R15 password-only profiles, initials and no admin My profile page.
- [ ] R16 Staff eligibility for verified Ormoc student Microsoft accounts.
- [x] R17 verified, atomic admin ownership transfer — hosted; 063 applied/next064; 808 API / 571 web tests; no real ownership transfer performed.
- [x] R18 QR/School ID switch, requested-book review and selected active-loan return choices hosted.
- [ ] Required migrations, automated checks, database/browser checks and human acceptance recorded.
- [ ] Update source/schema documentation for approved policy changes; mark built only after completion and disclose remaining external trials.

## External API references

Official documentation reviewed on 2026-11-17. These support lookup behavior; they do not guarantee complete or correct metadata for every ISBN.

- [Google Books API usage](https://developers.google.com/books/docs/v1/using): ISBN search, volume identifiers and image links; configure application identification and keep keys on the server.
- [Open Library Books API](https://openlibrary.org/dev/docs/api/books): identifier-based metadata lookup; the official search result was available, but the full page fetch timed out during planning, so recheck the response contract when implementing.
- [Open Library Covers API](https://openlibrary.org/dev/docs/api/covers): ISBN/edition cover URLs and `default=false` for explicit missing-cover handling; follow the provider's public-display guidance.
- [Open Library API usage guidelines](https://openlibrary.org/developers/api): human-triggered lookups, caching, application identification and current rate limits; do not build a bulk crawler.

## Change log

| Date | Change |
| --- | --- |
| 2026-11-17 | Created the requested planning document with 17 tracked work areas, validation and acceptance checks, API sources, existing implementation targets, open decisions and release-baseline reconciliation. No application, database, email, archive, hosting or GitHub action performed. |
| 2026-11-17 | Owner follow-up: prioritize Faculty roster enrollment, forgot password for all user/personnel/admin roles, then ownership transfer. Added R18 floating Borrow / Return above Scan attendance, automatic requested-book display on first user scan and admin-selected active-loan returns after a second deliberate scan, with duplicate-frame, permission, stale-response and transaction validation. Reordered delivery and detailed requirements without changing stable IDs. Planning only. |

- 2026-11-17: Owner authorized sequential implementation and hosting before each next feature, confirmed semester-bound Faculty eligibility, removal of outgoing admin/Staff access, research-material registration, Collection Review page archival and full ink-type maintenance. Priority 1 in progress; live 060 checksum baseline verified.

- 2026-11-17: Priority 1 Faculty enrollment built and hosted as `dpl_3TLgTz317oFnf673nS3Cb9kGuHDY`; preserved 17 existing tables, applied 061/next 062. Priority 2 all-role link recovery now in progress. See active checkout Faculty roster work record.

- 2026-11-17: Priority 2 reset links hosted as `dpl_CKdzptfZiQh5wfh6Ni3ProEkAe2n`; applied 062/next 063; 23-table preservation and private queue verified. Configured sender is Gmail, and existing minute scheduler ran the new dispatch job successfully. Priority 3 ownership transfer starts next.

- 2026-11-18: Added the explicit 18-feature sequential release queue. Priority 3 ownership implementation passed initial RLS, identity, race and browser checks; final 063 migration/hosting gate pending. Recorded confirmed decisions in D1–D6/D8 and retained D7 validator reconciliation for catalog work.

- 2026-11-18: Owner moved former queue items 14, 15 and 16 immediately after item 4. New positions 5–7 are R06 required-information auto-fill, R07 automatic covers/ISBN preview and R08 stocktake. Remaining rows renumbered; active ownership work and host-before-next gate continue unchanged.

- 2026-11-18: Priority 3 hosted as `dpl_Aik6XqLSjtKfhHpRxXYg3zGqDwfw`; natural invitation-mail handler succeeded and invitation table empty. Priority 4 circulation shortcut in progress. Revised order 5–7 remains auto-fill, covers, stocktake.

- 2026-11-18: Hosted queue item 4 with explicit QR/School ID switch, requested-book review and exact active-loan return selection. ChatGPT side-panel browser and automated checks passed; release dpl_FTV9BGAXZ9w9J4zsM8Vxhpyqk69S. Proceeding to item 5.

- 2026-11-18: Item 5 hosted as dpl_ES3D9Qir6gsk4Hrmj1pFVMCqnAX8 after browser, test/build and canonical checks. Proceed to item 6 automatic covers.

- 2026-11-18: Item 6 hosted as dpl_C3a3q3KhNxtt77hPvoA8EgCD34V8 after ChatGPT browser, 586 web, 22 staged API and build/canonical checks. Proceed to item 7 book/research stocktake.

- 2026-11-18: Owner clarified R06/R07 mean batch-wide correction and cover lookup for the 1,645 pending records in the saved 1,647-entry import. Expand and host R06 then R07 before stocktake. Read-only inspection confirms all 1,645 lack category/shelf, 223 invalid ISBNs and 98 invalid years. Category/shelf cannot be inferred as physical facts: offer reviewed choices by source sheet, preserve populated fields/history, process the full list automatically through bounded resumable calls, and keep unresolved conflicts/duplicates for review.
