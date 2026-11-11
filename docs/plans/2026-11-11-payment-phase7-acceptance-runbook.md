# Phase 7 payment acceptance runbook

| Field | Value |
| --- | --- |
| Date created | 2026-11-11 |
| Date last updated | 2026-11-11 |
| Status | `inprogress` |
| Why | Make the remaining browser, hosted Test, external callback, runner and human acceptance steps reproducible without confusing fixtures with a deployed application |
| Related work | [Implementation plan](2026-11-11-xendit-sandbox-payments.md), [release checklist](2026-11-11-payment-release-checklist.md) |

## Current evidence and boundary

The fresh QA chat checked the supported browser connection once on 2026-11-11. It returned **No browser is available**. This differs from the previous chat's disabled-browser message, but still leaves no supported browser for visual or hosted-checkout acceptance. No settings loop, alternate browser driver or native Chrome fallback was used.

The saved `output/xendit-sandbox/phase67-hosted-payment.json` says `Not completed; session canceled or terminal`, with a null checkout URL and `publicCallback: not tested`. It does not contain a provider session ID. This is an incomplete test record, not evidence of verified capture, a local receipt or a separately rechecked provider terminal status. Preserve it. No new hosted session was created in this continuation. If a later retry is required, first reconcile its provider history through authorized access and retain the original audit; do not delete it to bypass the script's rerun guard.

The recorded 689 application tests, typecheck, build, coverage and prior inspected PDFs remain earlier evidence. This continuation changes QA tooling and documentation only. The affected disposable PostgreSQL acceptance and new fixture HTTP regression were run; unchanged application suites were not repeated. New visual acceptance remains **not run**.

Migration state stays: live latest **032**, pending **033–037**, next unused **038**. No live database, applied migration source, production configuration, hosting or real funds are touched.

## How: local screen inspection

The UI harness runs actual React components with synthetic API responses. It provides no real authentication, provider capture, runner cadence, external webhook delivery or complete application acceptance. Its status and settlement actions deliberately simulate outcomes.

From the existing `StiOrmocLibrary-main-sync` checkout:

```powershell
node apps/api/scripts/prepare-xendit-sandbox.mjs --credentials-file "C:/Users/JOHN/Documents/SSL/StiOrmocLibrary/docs/local/xendit-credentials-blank.md" --phase6
node --test apps/api/scripts/verify-payment-ui.test.mjs
node apps/api/scripts/verify-payment-ui.mjs
```

The first command uses the existing ignored local tool installation and private credential sheet. It makes a read-only Xendit authentication request, exercises controlled-provider SQL acceptance in a unique temporary schema and stops PostgreSQL afterward. It does not pass `--hosted-payment`. It now also saves the actual synthetic `onlinePayments` reconciliation JSON, including an unallocated captured Review row. The fixture regression starts and stops the exact temporary UI servers and checks that the three requested report kinds are not substituted.

| Screen | Local address |
| --- | --- |
| Payments, recovery and settlement | `http://127.0.0.1:5174/payment-qa.html?view=admin` |
| Online reconciliation | `http://127.0.0.1:5174/payment-qa.html?view=reports&report=onlinePayments` |
| Fine payment records | `http://127.0.0.1:5174/payment-qa.html?view=reports&report=payments` |
| Printing payment records | `http://127.0.0.1:5174/payment-qa.html?view=reports&report=printRevenue` |
| Borrower fines / printing / result | Same base page with `view=fines`, `view=printing` or `view=result` |

Report selection now serves its matching generated JSON. Unsupported report kinds return an explicit 400. The harness does not implement report filters, pagination or export downloads against a database; those interactions must pass in the full isolated app. The administrative link to the normal reports route is also a full-app check.

Stop only this harness:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:47145/qa/stop
```

Verify ports 47145 and 5174 are no longer listening and `apps/web/payment-qa.html` and `apps/web/.payment-qa.tsx` are absent. The integration test checks the report contract, not the rendered screen. Do not run it while someone is reviewing the harness; it refuses occupied ports.

### Visual and keyboard matrix — all pending browser access

Use 1440×900 desktop and 390×844 mobile viewports, both light and dark themes. Also check 320 CSS-pixel width and 200% text/zoom. Record actual viewport, browser, theme, screenshot name and outcome for each check. Browser emulation does not satisfy physical-device acceptance.

| Area | Required observable outcome | State |
| --- | --- | --- |
| Recovery | Pause explanation, four readable counts, worker date in Asia/Manila, waiting/review details, busy state and recovery success/error remain visible without clipping | Not run |
| Settlement dialog | Opens on a paid record; reference, cost and explicit Philippine date/time have readable labels; net matches gross minus cost; saved evidence remains readable | Not run |
| Keyboard | Tab/Shift+Tab reach actions and native selects; focus is visible; settlement focus stays inside the modal; Escape closes it when idle; focus returns to its opener | Not run |
| Reports | All three titles/columns match selection; successful principal, user fees, gross, known costs and recorded net are separate; reconciliation shows a nonzero captured-review amount outside successful totals | Not run |
| Narrow reports | Report preview scrolls horizontally using keyboard and touch without making the entire page wider; controls and totals wrap legibly | Not run |
| Dark mode / zoom | Inputs, native selects, modal backdrop, focus, error and success text retain contrast and remain usable | Not run |
| Full application | Login, permissions, navigation, real filters, pagination, protected PDF/CSV downloads and receipt links work through the normal routes | Not run |

Source inspection shows native labeled inputs/selects, a native modal dialog, a focusable report scroll container and theme classes. That is preparation only; it proves no rendered contrast, focus behavior or physical-device behavior.

## Full isolated application setup to complete locally before exposure approval

The current fixture database is **not** a complete application database. `prepare-xendit-sandbox.mjs` installs small reference tables; its service verifier builds a minimal temporary schema that it drops. The application health check inspects `public` explicitly. Pointing the ordinary API at the temporary service schema cannot pass full application acceptance.

The reviewable target is one synthetic-only local stack:

| Component | Exact boundary and preparation |
| --- | --- |
| Source | Existing feature checkout only; preserve the original checkout and its unrelated changes |
| Database | Existing PostgreSQL cluster on `127.0.0.1:55438`, database `sti_xendit_sandbox`; assert database, role and address before every setup write |
| Full schema | Inventory existing sandbox `public` objects first; build only in the isolated database. Use individually reviewed baseline/product sources, then drafts 033–037; save the selected manifest and hashes. Never replay the historical draft 002 or rewrite/checksum-waive applied 003 |
| Supabase-specific DDL | Review the `storage.buckets`, browser-role and explicit `public` dependencies in historical sources. A local metadata stand-in is not a real Storage service; synthetic uploads/downloads need the existing local file-storage path |
| App role | `sandbox_app`, with only needed table/sequence privileges and no schema administration; create structures as the local sandbox owner |
| Accounts/data | Synthetic Student, Faculty, Staff and Librarian only; random private passwords, distinct signing secrets, one full printing bill, ordinary partial fine and confirmed replacement charge; no production export or school data |
| API | Full `createApp()` on `127.0.0.1:47146`; a dedicated bootstrap must bind loopback explicitly. `src/server.ts` uses an unspecified host, so do not expose that entrypoint while preparing the isolated stack |
| Web | Normal React application production build, served on `127.0.0.1:4174`; same-origin `/api` proxy to port 47146 and SPA fallback |
| Environment | Load only the dedicated sandbox configuration before any app import. `DATABASE_URL` and `XENDIT_SANDBOX_DATABASE_URL` must match the guarded loopback URL; `XENDIT_ENABLED=true`, mode Test. Keep checkout paused until ready. Production storage, email, external document renderer and normal deployment settings must be absent |
| Authentication | Keep the normal role/session checks. Do not expose mock auth or a QA-login bypass. Exercise the configured sign-in policy with synthetic accounts; email delivery is not authorized here |
| Worker | Start `startOperationalJobWorker()` from the existing `operational-minute` module in the same dedicated API process. Do not add a second scheduler. Keep the existing authenticated `/api/jobs/run` route if the later approved host needs external invocation |
| Private state | Tool/data/config remain in ignored sandbox paths; no secrets in logs, screenshots, tracked files, responses or this runbook |

Before requesting public access approval, finish a bounded local start/stop implementation for this stack and record: healthy schema, all four role logins, forbidden-role responses, actual report reads/downloads, worker history across successive minutes, sanitized environment check and exact process/listener cleanup. None of those full-app results is claimed by the current fixture test. No public callback origin or hosting provider has been selected or enabled.

### Exposure proposal after local readiness

Present the owner with the exact temporary HTTPS hostname, selected provider/account, process/port mapping, routes exposed, access controls, duration, cost (if any), logs retained and shutdown action. One HTTPS origin should serve the web and proxy `/api`, with callback `/api/payments/xendit/webhook` and return `/payments/result`. PostgreSQL and fixture port 47145 must remain private. Keep provider keys and callback/runner secrets backend-only.

Obtain separate explicit approval for that concrete exposure and any Test-dashboard webhook configuration before acting. The owner has not authorized push, hosting, public exposure, live migrations, emails or real-money use. Browser access is an additional unresolved prerequisite, so this continuation does not request hosting approval prematurely.

## Hosted capture, external delivery and cadence evidence

After the prerequisites above and an approved origin:

1. Preserve/reconcile the earlier incomplete audit. Prepare a new bounded, append-only run record without defeating the existing rerun guard. Keep provider identities private but available for reconciliation after interruption.
2. Create one synthetic Test checkout through the actual borrower UI. Record reviewed principal, fee, gross, selected method and local attempt identity. Use the provider's current documented Test flow; never use real funds or invent capture evidence.
3. Observe a completed provider result, authenticated incoming callback and durable saved event. Record timestamps and normalized identity/state, not callback credentials or personal data.
4. Let the existing runner reconcile the saved event. Verify one receipt/allocation and the matching principal balance; a return to a success URL is insufficient. Repeat a status read/recovery and verify receipt count stays one.
5. Check the protected receipt and report totals/exports. For an ordinary partial fine, verify the remainder and overall clearance including an unreturned item. Check cash remains usable for a separate unreserved obligation.
6. Run duplicate delivery, temporarily stopped worker, restart/expired lease, delayed callback and checkout-pause cases with disposable charges. Actual external delivery must be distinguishable from controlled callback injection and lookup-only recovery.
7. Record at least three successive successful operational-minute runs, timestamps and observed gaps; stop/restart once and verify recovery. Define the acceptable gap against the selected host before acceptance. Do not infer cadence from a local manual action or deployment configuration alone.
8. Resolve all captured Review/unknown outcomes before stopping exposure. Pause new checkout while callbacks/checks/cancellation/recovery remain enabled. Retain payment and settlement evidence; actual refunds remain unavailable.

Use the saved channel reference as an inventory, not as proof of current merchant enablement or simulator success. Confirm the current Test merchant methods and official method-specific instructions at execution time. For each configured method, record hosted session, simulator used, valid/min/max total, below/above-limit rejection, completed/failed/canceled/expired outcome as applicable, callback identity, receipt count and cash coexistence. Mark unsupported scenarios with the provider's reason and source; leave unexecuted cases pending. Existing controlled GCASH examples do not accept all 12 reference method families.

## Physical device and Librarian acceptance

When the actual screens can be inspected, ask the Librarian to perform these tasks using synthetic data:

1. Find a Needs review payment and explain why cash collection must wait.
2. Run recovery and explain whether it starts another checkout.
3. Record provider settlement evidence and explain the displayed net amount and permanence.
4. Find principal, user fees and unsettled/captured-review amounts in the appropriate report.
5. Confirm the partial fine balance and locate its payment record.

Record the person's role/name only with permission, device/browser, date, task results, difficulties, requested changes and explicit accept/reject/pending decision. Ask for feedback after they can see the screens; no feedback or elapsed time is approval. Physical-device records must identify an actual phone/tablet and include touch scrolling, software keyboard, orientation and any checkout-app redirect limits. No such inspection or human sign-off occurred in this continuation.

## Implementation tracking

- [x] Recheck supported browser access once and record its actual result.
- [x] Preserve and review the incomplete hosted audit without recreating a session.
- [x] Reproduce the reconciliation-fixture substitution with a failing HTTP regression.
- [x] Save actual controlled reconciliation data and serve each requested report kind correctly.
- [x] Pass the affected PostgreSQL acceptance, HTTP regression and script syntax checks; clean temporary servers/entry files.
- [x] Document the remaining visual matrix and exact isolation/exposure prerequisites.
- [ ] Build and verify the full isolated local application stack described above.
- [ ] Complete supported browser, physical-device and configured-method acceptance.
- [ ] Obtain separate approved public origin, external webhook/runner delivery and observed deployed cadence.
- [ ] Obtain Librarian usability feedback and explicit sign-off.

## Change log

2026-11-11 — Fresh chat found no available supported browser. Preserved the incomplete hosted audit and corrected the report fixture's substitution of fine records for reconciliation. Added a failing-then-passing HTTP regression and regenerated matching controlled SQL evidence. Defined the remaining full-app, visual, external and human acceptance steps without marking them passed.
