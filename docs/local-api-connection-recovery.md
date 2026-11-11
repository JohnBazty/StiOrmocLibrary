# Local API connection recovery

## Why

Borrowing history, the Librarian printing queue and floor plan, and Admin login failed locally when the API process stopped. Its log showed an unhandled `pg` Client error, `Connection terminated unexpectedly`. Empty Vite gateway responses then appeared as generic request errors or a floor-plan JSON parsing exception. After restart, the Student dashboard and clearance logs exposed intermittent DNS/timeouts and Supabase `EMAXCONNSESSION` errors from session mode's 15-client limit.

| Field | Value |
| --- | --- |
| Date created | 2026-09-28 |
| Date last updated | 2026-09-28 |
| Status | `built` |

## How

- Handle error events for both idle Postgres pool connections and checked-out clients. Keep query rejection and transaction failure semantics; do not replay writes. Let `pg` remove broken clients and acquire new connections normally. Log a connection failure without printing credentials or query values.
- Restart the local API after applying the handler. The web remains on localhost:5173 and the API on localhost:4000; Supabase Postgres remains the active database.
- After a successful transaction/row-lock check, change only the ignored local `DATABASE_URL` pooler port from 5432 (session mode) to 6543 (transaction mode), retaining the host and credentials; set `DB_CONNECTION_LIMIT=4`. Preserve the prior environment in a private local backup. Production already uses the transaction pooler; no hosted setting is changed.
- Return JSON HTTP 503 with `DATABASE_UNAVAILABLE` for recognized connection, DNS, timeout, or pool-limit failures. Keep validation, missing-schema, and programming errors distinct. Failed Admin login gateway responses show a readable service-outage message without a JSON parser exception.
- Parse empty/invalid floor-plan responses safely and provide Refresh. Offer image publication to Librarians, matching the existing API permission.
- Show unavailable values when printing, borrowing, or clearance requests fail. Do not infer paused printing, zero loan capacity, blocked clearance, zero balances, or empty history from missing data. Refresh restores normal information when the service responds.
- Verify Admin authentication returns normal JSON and check the affected authenticated read routes. No passwords, account statuses, borrowing/payment/catalog rows, schema migrations, GitHub pushes, or deployments are changed. Normal GET clearance calculation may refresh its existing cache. Supabase migration tracker remains applied through 016, next 017; MySQL reference remains 047, next 048.

## Implementation tracking

- [x] Locate the stopped API and the unhandled Client error in the process output.
- [x] Add connection error handlers and preserve failed-query behavior.
- [x] Correct floor-plan response handling and Librarian upload controls.
- [x] Correct unavailable printing/borrowing states and keep refresh recovery.
- [x] Verify regression tests, typechecks, and live affected routes locally: all 273 API tests and 100 web tests passed; both builds passed (the existing Vite chunk-size warning remains).
- [x] Verify Student dashboard, borrowing history, and clearance for all three current active Student identities with short-lived local audit tokens; every request returned HTTP 200/success. Verify Librarian floor-plan, printing summary/queue, and announcements plus Staff queue/announcements and Admin dashboard/notifications reads (all HTTP 200).
- [x] Verify actual Librarian and Staff password logins return HTTP 200. Verify the Admin login service responds with valid JSON/HTTP 401 for a deliberately invalid password, rather than an empty gateway response. No Admin password is read or changed; a successful Admin password login was not independently performed.
- [x] Recheck API health through Vite after regression tests/builds: HTTP 200, healthy. Keep both local servers running.

## Change log

- **2026-09-28:** Began the local repair after the reported borrowing, printing, floor-plan, and Admin login errors. Restarted the API with connection error handlers; health returned HTTP 200 and schema readiness is healthy. Verification continues.
- **2026-09-28:** Completed local recovery after discovering session-pooler exhaustion and transient network/DNS failures behind the newer dashboard/clearance screenshots. Validated transaction mode, updated only private local connection settings, added safe JSON outage responses and truthful unavailable states, and passed full regression/build and affected live-route checks. No migration, push, or deployment.
