# October 17 revisions — Phase 3 activity and notifications

| Field | Value |
| --- | --- |
| Why | Give the Librarian a readable view of library activity and actionable alerts without treating every visit as an unread notification. |
| Date created | October 22, 2026 |
| Date last updated | November 10, 2026 |
| Status | `built` |
| Approved scope | Phase 3 of `revision oct 17.md`. The owner deferred all of Phase 2 (Dewey) and approved proceeding directly here. |

## How to use

Open **Librarian > Notifications**:

1. **Alerts & reminders** opens first. New print requests, overdue follow-ups and reservation pickup notices use the existing personal inbox. Marking read changes that recipient's state only.
2. **Recent library activity** shows the latest 50 committed events. Choose borrowing, reservations/carts, attendance or printing. Related-record links carry the relevant borrower filter; attendance also carries the actual visit date. Returned-book events open the returns report because they no longer belong in the open-loan counter.
3. **Account reviews & activity** retains registration/picture approvals and account changes. The existing pending-review indicator remains independent of the unread bell count.

Click the header bell in the Student, Faculty, Staff or Librarian workspace to preview the five latest inbox notices. Select a notice to open its related page, use the checkmark to mark it as read, or choose **See all** for the full inbox. **Delete all** in the inbox clears the preview and unread badge after the server confirms the deletion. Account and library activity logs use separate views.

The activity screen and inbox reuse Phase 1's shared one-second visible reads. They retain existing content on errors, pause when hidden/offline and avoid overlapping reads. Reads neither submit operations nor renew idle sessions. Routine activity never increases the unread count. Opening an activity link does not confirm a checkout or return.

## Source coverage and transaction boundaries

| Event | Authoritative source | Behavior |
| --- | --- | --- |
| Confirmed borrowing, returns, newly detected overdue loans | Existing `admin_notifications` entries written by circulation transactions | Read committed events only; no new loan inferred from cart/reservation activity. |
| In-library handback exceptions and returned-copy assessments | Existing administrative event entries | Link to in-library records; attendance exit never counts as a book return. |
| Reservation progression, readiness and expiry | `book_request_events` | Source/event ID is stable. Readiness and expiry also write a personal Librarian alert within the existing request transaction. |
| Available-book cart sent to the desk | `book_request_events` with `CartHandover` and `received` | Explicitly labelled awaiting handover; opens Borrow & return. Other cart status entries are not mislabelled reservations. |
| Attendance entry and exit | One entry and one exit derived from each `attendance_logs` visit | Stable `entry:`/`exit:` identities. Repeated reads create no events or alerts. |
| Printing submission and status changes | `print_status_history` | Existing committed status history; submission adds a Librarian alert in the same transaction. |
| Printing payments and recorded reversals | `print_payment_receipts` | Received and reversed timestamps remain separate. No new payment, invoice or revenue is created. |
| Account registration, picture review, profile/status updates | Existing account-review endpoint and event ledger | Existing approvals and account history remain accessible. |

The activity endpoint is read-only: **GET `/api/v1/notifications/activity?category=all`**. It accepts a fixed category allowlist, takes no SQL or arbitrary paths, and limits each source and the overall response. It returns up to 50 latest records plus `hasMore`; reports retain access to older history. It exposes person/name/ID, resource, reference, event time and an internal related-record link. It excludes credentials, QR contents, contact emails, file storage paths, raw errors and verification codes. Links open filtered source records rather than automatically starting a transaction.

## Alert delivery and recovery

- Reuse `notifications` and its existing unique `(user_id, dedupe_key)` constraint. There is no second read-state store.
- Recipients come from distinct active Librarian account/profile pairs. Student, Faculty, Staff and archived accounts do not receive global operational alerts. Multiple accounts for the same user do not duplicate delivery.
- Stable keys: `library:print:<id>:pending`, `library:loan:<id>:overdue`, and `library:reservation:<id>:<status>`.
- The existing minute notification job recovers **currently overdue, unreturned, not-confirmed-lost loans**, **pending print jobs**, and **ready reservations**. It also covers actionable work already present before the release. Expiry alerts originate from the committed request event; historical expired reservations are not bulk-notified.
- Job retries use conflict-ignore, never update read/deleted flags, and cannot recreate dismissed alerts. Read-all/delete-all remain owner-scoped.
- Printing submission and reservation readiness/expiry alert inserts share the original transaction. Rollback removes the alert too. Existing borrower emails remain governed by the existing request outbox; this feature adds no new email, SMS or browser push recipient.
- Routine borrowing, returns, attendance and payment changes appear as activity. They do not produce an alert per event. A read alert remains read while the underlying task is still outstanding; it is not a task-resolution control.
- Visible polling uses the one-second cadence. Scheduled overdue/recovery notice creation uses the existing **minute** worker, followed by the next inbox poll; a one-second deadline-detection guarantee is not claimed.

## Timestamp contract

Read-only inspection confirmed the hosted transaction pooler session uses UTC despite the pool's connection option. Server-generated administrative and printing-status audit timestamps are interpreted as UTC. Explicit attendance wall timestamps and Date-bound printing receipt `received_at` are interpreted as Asia/Manila. Request event timestamps already include their timezone. The feed returns ISO instants and displays Philippine time.

New operational notifications explicitly store UTC delivery/creation wall timestamps, matching the existing inbox scheduling comparisons; their creation timestamp is converted explicitly on read. Existing records are not rewritten. Older imports lacking trustworthy time provenance remain a historical-data limitation; do not silently re-date those rows.

## Permissions and schema

- Both the route and service require the current **Librarian** role for the all-library feed. Existing application JWT, active-account/session and CSRF middleware remain authoritative.
- Staff keep their existing personal notifications and operational rights; no global activity or account-management permission is added.
- Notification mutations still resolve the authenticated account's linked profile and constrain updates by that user ID.
- Live read-only inspection confirmed RLS is enabled and browser-role direct access remains revoked on `notifications`, `admin_notifications` and `book_request_events`.
- **No migration or DDC changes.** Applied product migration remains `029_october16_revisions.sql`; next unused Postgres number is **030**. Enrollment `028` stays an unapplied draft. MySQL reference **048**, next **049**, is unchanged.

## Verification

- [x] API suite: **409 passed**, zero failed (`output/oct17-phase3-api-tests.txt`).
- [x] Frontend suite: **281 passed** across 74 files (`output/oct17-phase3-web-tests.txt`).
- [x] Both API and web production builds pass (`output/oct17-phase3-build.txt`). Existing large frontend chunk advisory remains.
- [x] Focused UI tests cover category changes, Philippine dates, related links, one-second polling, content retention after failure, empty/error states, and separation from alerts/account reviews.
- [x] Service/route tests deny Student, Faculty, Staff and missing-role access before database reads; reject malformed category inputs; verify bounded safe DTOs and prepared alert values.
- [x] `node apps/api/scripts/verify-oct17-phase3.ts` passes on active Postgres using **connection-local TEMP tables**, isolated identity sequences and unconditional rollback. It verifies all source categories, stable event IDs, Philippine midnight boundaries, cart/loan separation, recipient exclusion, duplicate delivery, rollback, owner-only mutations and persistent read/delete state across retries. No school records are copied into these fixtures.
- [x] Real source queries execute successfully for all five category selections; only counts/timings were logged. Initial all-source read took 697 ms; warmed category reads took 117–212 ms. This is a local functional sample, not a campus load benchmark.
- [x] Local health returns 200; anonymous activity requests return 401. Browser tests use a disposable preview with all requests intercepted; they do not sign in as a real person or change existing loans/accounts/payments.
- [x] Desktop and 390 × 844 mobile preview checked. Mobile content width equals viewport width (390 px). Mark-all-read changed the fixture count to zero, category filtering worked, and no routine read mutated alert state.

### Evidence and limits

Screenshots: `output/oct17-phase3-activity.png`, `output/oct17-phase3-alerts.png`, `output/oct17-phase3-mobile.png`. These show disposable QA people/data and the real React components, not real authenticated school transactions. Preview files/tabs are removed after verification; screenshots/logs remain ignored local evidence.

Live-authenticated end-to-end librarian handover, real email delivery, real scanner hardware, campus concurrency and human acceptance remain separate checks. No push, deployment, migration, account reset or school holdings change was performed for this phase. The normal operational worker may produce legitimate operational notices while the development API runs.

## Change log

- **October 22, 2026:** Owner deferred Phase 2 (all Dewey work) and explicitly authorized Phase 3.
- **October 22, 2026:** Added a bounded read-only activity feed, personal deduplicated Librarian alerts, minute-job recovery and related-record filter links. Retained all existing ledgers, permissions and account reviews.
- **October 22, 2026:** Isolated database verification caught parameter type inference in an `INSERT ... SELECT DISTINCT`; explicit text/bigint bindings repaired it before completion. Timestamp inspection distinguished UTC audit fields from Philippine wall-time fields. Verified builds, tests and desktop/mobile preview; marked Phase 3 built with the limits above.
- **November 10, 2026:** Added a local bell preview backed by the existing inbox. Verified in automated tests that opening the preview preserves the current page, marking one notice read updates the badge, related notices open their pages, and deleting all notices empties the preview and badge. This update needs no database migration.
- **November 10, 2026:** Published the preview to Vercel over the existing production release (`dpl_5wxmWvLfx1yEz1dAe1TxAannGqzo`). Pushed the same feature to `codex/library-revision-updates` (`157ef36`) using that branch's existing theme and inbox layout. All 266 web tests passed in the isolated GitHub checkout. The live bundle contains the shortcut, the API health check passed, and anonymous inbox access returned 401. The deletion workflow was tested with disposable notices locally.
- **November 10, 2026:** Removed the “Search anywhere” field and sidebar collapse button from the shared portal header. All 285 local web tests passed. Verified the removal in the live Vercel build (`dpl_Gze3yAnRXe4rc6dtqJe86vFk7jV8`) and pushed the header change to `codex/library-revision-updates` (`61fe8c5`).
