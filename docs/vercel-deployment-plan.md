# Vercel deployment for STI Ormoc Smart Library

| Field | Value |
| --- | --- |
| Date created | 2026-09-25 |
| Date last updated | 2026-09-25 |
| Status | `inprogress` |

## Why

Deploy the React website and Express API at one HTTPS address while retaining Supabase Postgres as the shared database.

## How

- Build the existing API and Vite workspaces from the repository root. Vercel serves `apps/web/dist` and sends `/api/*` to `api/index.mjs`, which invokes the Express app. Other paths load the React app for deep links.
- Keep the database URL, signing keys, and server-only Supabase Storage secret in Vercel environment variables. Never upload `apps/api/.env`; `.vercelignore` excludes it. The production `WEB_ORIGIN` points to the public site. Run the API in Vercel's Seoul region (`icn1`), matching the Supabase `ap-northeast-2` database region. Vercel uses the Supabase transaction pooler on port `6543`, with one `pg` connection per function instance and a one-second idle timeout.
- Deploy a preview, verify the website and API, then deploy production and test a temporary student's registration and login against the production address.
- Background jobs started by `apps/api/src/server.ts` are not started by the Vercel Function. Print documents are stored in a private Supabase Storage bucket; staff downloads pass through the authenticated API. The deployed upload limit is 4 MB to stay below Vercel's 4.5 MB function payload limit. New book covers and floor-plan background uploads use a public Supabase Storage bucket.

## Implementation tracking

| Item | Status |
| --- | --- |
| Vercel website/API routing | done |
| Local build and preview verification | done |
| Production environment variables | done (database URL, four signing keys, site origin, Supabase Storage URL and server secret) |
| Production deployment and smoke check | done at `https://sti-ormoc-smart-library.vercel.app` |
| Serverless database connection limit fix | done; preview and production deployed, linked-student pages checked |
| Historical book covers | done; 12 original images restored as Vite public assets and verified on production |
| Admin dashboard and book-cover fixes | done; dashboard, floor plan, catalog, and image checks passed |
| Printing document uploads and downloads | done; private Supabase Storage bucket, four historical PDFs migrated, live student submission and all existing staff downloads verified |
| Borrow cart request and cancellation | done; PostgreSQL row locks corrected and live flow verified |
| New book-cover and floor-plan background uploads | done; public Supabase Storage bucket, live upload and image retrieval verified |
| Admin checkout and bulk catalog entry | done; PostgreSQL queries corrected and real-database dry runs passed |
| Announcement publishing | done; PostgreSQL parameter type fixed, rollback-only real-database publish passed, production updated |
| Deployment audit | done for 98 read-only live checks, 284 automated tests, build, access controls, assets, and current logs; role and scheduled-job gaps remain below |
| Phase 1 reported bug fixes | built; eight repairs deployed, 99 read-only production checks, controlled live writes, and student browser controls passed |
| Scheduled jobs | pending |

## Live verification

The project is linked under Vercel team `ssl19`. The initial production deployment exposed a function import error because Vercel did not package TypeScript source dependencies from a JavaScript entry point. The entry now imports the compiled API output. A subsequent preview returned healthy database readiness and expected registration validation. The production site returned HTTP 200 for `/register` and `/api/health`; a complete student registration and login succeeded, and the temporary account was removed from Supabase.

### Connection limit incident (2026-09-25)

The student dashboard and several other live pages returned HTTP 500. Vercel logs showed Supabase `EMAXCONNSESSION`: each serverless function instance could retain up to ten session-pooler connections, while Supabase allowed only 15. The Vercel preview and production `DATABASE_URL` values now use the same Supabase pooler host in transaction mode (port `6543`). The API limits Vercel instances to one connection by default and releases idle connections after one second. An explicit transaction and row-lock query passed against the transaction pooler. The new preview returned healthy database readiness; production registration, login, dashboard, catalog, notifications, borrowing history, reservations, attendance pass, fines, printing requests, clearance, and floor plan all returned success for a temporary linked student, which was then removed. Follow-up Vercel logs contained no database connection failures.

### Historical book covers (2026-09-25)

The MySQL-to-Supabase migration preserved `titles.cover_image_path` for 12 books but had not migrated the image bytes. The original files were found in the earlier local project checkout and copied into `apps/web/public/api/assets/covers/`. Vite includes them in the static site build; Vercel serves those files before applying the `/api/*` rewrite. All 12 recorded image paths returned HTTP 200 with an image content type and the expected byte length on production. This restores the existing covers without changing database rows. New cover and floor-plan background uploads now use the public Supabase `book-covers` bucket, so they remain available across Vercel deployments.

### Admin dashboard and floor plan (2026-09-25)

The admin dashboard failed with PostgreSQL error `42846` because its peak-hour query cast a `TIME` column to `TIMESTAMP`. The shared `hourOf` helper now extracts the hour directly from either type. The admin floor-plan query used unquoted mixed-case aliases; PostgreSQL folded them to lowercase, leaving `coverPath` and other fields absent from the API response. Those aliases are now quoted and were checked against both PostgreSQL and MySQL. The admin catalog search also omitted cover paths; it now returns them, and the management table displays book thumbnails. The production admin dashboard, floor-plan book list, and catalog search all returned HTTP 200. All 26 floor-plan book copies and all 12 catalog books included cover paths, and a sampled image returned HTTP 200 with an image content type.

### Printing and borrow cart (2026-09-25)

The admin supplies query compared a PostgreSQL timestamp with formatted text and returned HTTP 500. It now compares against the start of the month as a date. Student print submissions wrote files to ephemeral Vercel disk; they now upload to the private `printing-documents` Supabase Storage bucket, and authorized staff downloads retrieve the bytes through the API. The Supabase secret remains in server environment variables. A temporary student submitted a PDF on production, and an admin downloaded it successfully; the test request, account, and object were removed. All 17 read-only admin printing endpoints, including PDF reports, returned HTTP 200.

Four historical print requests still pointed at local PDFs. The source files were present on this computer. `tools/ai/migrate-print-documents-to-supabase.mjs` uploaded them to the private bucket, verified the uploaded bytes, and changed each database path only after verification. The local originals remain intact. The production staff download endpoint returned HTTP 200 and identical bytes for all five retained print documents.

Borrow cart submission also returned HTTP 500 because PostgreSQL cannot lock the nullable side of an outer join with unrestricted `FOR UPDATE`. The cart, cancellation, and checkout queries now lock only their required non-null tables on PostgreSQL. A temporary student submitted and cancelled a borrow request on production; the test transaction and identity were removed, and the copy was released.

### Admin circulation checkout and bulk book entry (2026-09-25)

The admin circulation screen loaded, but confirming a student's pending claim failed because PostgreSQL does not support `MAX(boolean)`. The capacity check now uses a PostgreSQL aggregate filter. The exact pending claim shown in the report completed a dry run against the real database with its transaction rolled back, so the student's loan was not changed. Bulk book entry failed because it tried to lock the nullable shelf side of a left join; PostgreSQL now locks only the category row. A two-copy bulk entry completed a rollback-only real-database dry run. The production endpoint returned the expected ISBN conflict response instead of a server error, proving that it passed the former lock failure. A production background-image upload returned a public Supabase URL and the image fetched successfully; the test image was removed.

Production is served at <https://sti-ormoc-smart-library.vercel.app>. The repository is not connected for automatic Git deployments; this release was sent from the local checkout with the Vercel CLI. Future changes require another deployment or a Git connection after the code is committed and pushed.

### Remaining runtime work

The web/API deployment is functional for registration, login, and database-backed requests. Vercel Functions do not keep the continuous reservation, overdue, and notification workers running. Vercel Hobby cron is limited to daily runs, which does not match these one-minute workers. Larger print files need a direct-to-storage upload flow to exceed Vercel's 4.5 MB function payload limit.

### Full deployment audit (2026-09-25)

The production announcement failure was PostgreSQL `42P18`: the value inside `CONCAT('announcement:', ?)` lacked a type. The immediate fan-out query now casts that parameter to text; the scheduled worker uses the same cast on PostgreSQL. A real Supabase transaction created an immediate announcement and its notification fan-out, then rolled back; a follow-up count confirmed no test announcement remained. The notification, reservation-expiration, and overdue workers also completed rollback-only runs against the hosted schema. No announcements are scheduled or overdue, no ready reservations are past pickup, and no borrowed transactions are currently past due.

The API suite passed 218 tests, the web suite passed 66 tests, and both production builds succeeded. `tools/ai/audit-live-routes.mjs` checked 98 production GET paths after deployment: student and Admin pages, legacy Admin catalog APIs, printing, circulation, fines, attendance, clearance, reports and PDFs, sample asset codes, and every stored book-cover path. All returned HTTP 200 with expected media types where applicable. Anonymous access to Admin announcements returned 401, a Student token returned 403, and an invalid Admin announcement POST returned 422. `/api/health` reported a ready schema. The current production deployment is `dpl_BAYz1VRyzrg9QgWLM3neMfCLSpV4`.

The current deployment's log entries tagged `error` during these GETs are Node `DEP0169` deprecation warnings; the associated requests passed. The preceding deployment's actual 500 was the announcement parameter failure, and older deployment 500s were the already corrected dashboard, checkout, and bulk-entry PostgreSQL incompatibilities. A valid announcement POST was not sent to production during this audit because it would notify all active users; the rollback-only database run exercised that SQL. Faculty and Librarian GET routes were not exercised with those roles because there are no active linked accounts for them in the hosted database. Vercel still does not run the three one-minute workers, so future scheduled announcements, reservation expiration, and overdue processing require a durable scheduler before full production use.

### Phase 1 reported bug fixes (2026-09-25)

Preview `dpl_6ccdS3jPEJcGVRvA4p4V7R4nNnnj` built successfully. Its public route audit was redirected by Vercel Deployment Protection; the authenticated Vercel health request returned `healthy` with a ready schema. Production `dpl_8eun22ar9fxWWAjC4z8ExTy68Q2Z` is aliased at `https://sti-ormoc-smart-library.vercel.app`. The production read-only audit passed all 99 routes and assets, including attendance, clearance, fines, reservations, printing, and borrowing history. Its request logs showed no HTTP 500 at the time of verification. Three entries labeled `error` were Node `DEP0169` deprecation warnings on successful GETs, not failed requests.

The API and web tests passed 218 and 71 cases respectively, and both builds passed. Reserve, cash payment, and lost-book reporting reached their expected results against Supabase in rollback-only transactions; no test writes remained. Controlled live write/read acceptance on dedicated test records and browser interaction checks are still needed before calling Phase 1 fully verified.

### Phase 1 Category and lost-report follow-up (2026-09-26)

The Category management error came from PostgreSQL-incompatible mutations: an untyped nullable name-check parameter, MySQL-only joined update syntax for shelf synchronization, and unrestricted row locks on nullable joins. These queries were corrected without a schema change. An Admin clearance worklist now displays pending student lost-book reports and links each to borrower review; pending reports say that the charge awaits review.

Rollback-only Supabase checks exercised Category Add, Edit, Reassign, and Delete, plus student lost-book submission, Admin notification, queue and detail visibility, and staff rejection. The updated API suite passed 221 tests, the web suite passed 72, and type checks and the build passed. Preview `dpl_Ekkbq8UZxqkVj6QPDvR1JJbbQgJv` built and returned healthy schema readiness through an authenticated health request. Production `dpl_HeWNpvJoHBopjLB1DtQ1empYZmUk` is aliased at <https://sti-ormoc-smart-library.vercel.app>.

The public production API returned the new Admin queue field. One uniquely named, unassigned test category was created, read, and removed successfully. The read-only production audit passed all 99 routes and assets. Logs inspected at that point contained no HTTP 500; two error-level lines were Node `DEP0169` URL parsing deprecation warnings on successful requests. That initial deployment check committed no lost-book report, loan change, or Category reassignment. The remaining acceptance was completed in the next check.

### Phase 1 final acceptance (2026-09-26)

Production `dpl_HeWNpvJoHBopjLB1DtQ1empYZmUk` passed controlled write/read checks with a disposable Student and book. Reservation creation appeared in the Student list; a duplicate was rejected; cancellation succeeded. A borrow request became an active loan at the Admin desk, the Student reported it lost, and the report appeared in the Admin clearance queue and borrower detail. Staff rejection removed it from the pending queue, and the book return completed. A synthetic infraction on the disposable account was paid through the Admin cash-payment endpoint, retrieved as a payment record, and retried with the same request key without creating a second payment. No cash changed hands. The script removed all temporary Student, book, circulation, report, fine, payment, and notification rows and verified their absence.

Two additional disposable categories passed Add, Edit, Reassign, and Delete through the public production API; their test audit events were removed. A rollback-only Supabase test exercised the same Category Edit/Reassign operations with an assigned book and copy, verifying the shelf synchronization path without moving real inventory. In the live browser, a disposable Student signed in and verified that Clearance Refresh completed with a current-records message, and that Printing Pages and Copies could each be cleared, re-entered, and recalculated from ₱2.00 to ₱12.00. The test account was signed out and removed. Automated web tests cover the Admin controls and report worklist; these Admin interactions were not manually driven in a production browser.

The current production log query found no HTTP 500. Four error-level entries inspected after acceptance were Node `DEP0169` deprecation warnings on successful GET requests. Phase 1 is marked `built` in the system plan. The deployment still needs a durable scheduler for the later reservation and attendance phases; that work is not part of the eight reported Phase 1 repairs.

## Change log

| Date | Change |
| --- | --- |
| 2026-09-25 | Started Vercel deployment configuration following the completed historical database cutover. |
| 2026-09-25 | Deployed the Vite website and compiled Express API; verified Supabase health and production registration/login. Kept status in progress for worker scheduling and durable file storage. |
| 2026-09-25 | Fixed Supabase session-pool exhaustion in Vercel with transaction pooling and a one-connection-per-instance default; verified ten linked-student pages through production. |
| 2026-09-25 | Restored all 12 historical book covers from the earlier local checkout, bundled them as static assets, and checked every live image URL. |
| 2026-09-25 | Fixed the admin dashboard's PostgreSQL time query and floor-plan book field names, added cover thumbnails to the admin catalog, and verified the live endpoints and image. |
| 2026-09-25 | Fixed admin printing supplies, moved new print documents to private Supabase Storage, and verified live submission, staff download, and printing reports. |
| 2026-09-25 | Migrated four historical print PDFs into private Supabase Storage, preserved local originals, and verified every retained staff download on production. |
| 2026-09-25 | Fixed PostgreSQL row locking in borrow cart, cancellation, and checkout queries; verified live submission and cancellation. |
| 2026-09-25 | Fixed PostgreSQL admin checkout capacity and bulk-entry row-lock queries, moved new covers to public Supabase Storage, and verified real-database dry runs and a live image upload. |
| 2026-09-25 | Fixed announcement PostgreSQL parameter typing, completed a full production route and log audit, and deployed the correction. |
| 2026-09-25 | Deployed the seven Phase 1 bug fixes; verified preview health, 99 production read-only routes, build and tests, and checked current HTTP 500 logs. Live write acceptance remains. |
| 2026-09-26 | Deployed Category mutation repairs and the Admin lost-report worklist; passed rollback-only Supabase workflows, 293 automated tests, live Category create/read/delete, 99 route checks, and a current-log HTTP 500 check. Controlled write and browser acceptance remains. |
| 2026-09-26 | Completed Phase 1 live acceptance with disposable Student/book/Category records: reservation, lost-report handoff, synthetic cash payment, Category CRUD/reassignment, and Student browser controls passed. All test records were removed; no HTTP 500 appeared in current logs. |
