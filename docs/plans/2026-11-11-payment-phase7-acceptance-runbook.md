# Phase 7 payment acceptance runbook

| Field | Value |
| --- | --- |
| Date created | 2026-11-11 |
| Date last updated | 2026-11-11 |
| Status | `inprogress` |
| Why | Make the remaining browser, hosted Test, external callback, runner and human acceptance steps reproducible without confusing fixtures with a deployed application |
| Related work | [Implementation plan](2026-11-11-xendit-sandbox-payments.md), [release checklist](2026-11-11-payment-release-checklist.md) |

## Current evidence and boundary

**Latest local continuation (November 12):** use the
[local integration record](2026-11-11-local-payment-integration.md). The active
localhost app now uses the school database with the payment features integrated,
the restored deployed theme and cookie authentication. Start it with
`npm run dev` from `StiOrmocLibrary-main-sync`. The sample payment preview was
stopped at the owner's request. Payment-provider activation against school
records is still pending; test credentials cannot clear real bills. Isolated
automated checks use `npm run qa:payments`, not the normal dev command. Payment migrations
are now unapplied drafts 038–041; live sign-in 036 remains unchanged. Browser,
external callback and actual completed hosted capture remain separate gates.

The fresh QA chat initially returned **No browser is available**. A later continuation successfully used the supported in-app browser for the component checks recorded below. On the next turn, opening the full isolated application returned **Local browser access is unavailable for this chat**, including the supported troubleshooting call. Browser access is intermittent; do not repeat extension installation instructions or infer that the user has left a setting off. No alternate browser driver was used.

The saved `output/xendit-sandbox/phase67-hosted-payment.json` says `Not completed; session canceled or terminal`, with a null checkout URL and `publicCallback: not tested`. It does not contain a provider session ID. This is an incomplete test record, not evidence of verified capture, a local receipt or a separately rechecked provider terminal status. Preserve it. No new hosted session was created in this continuation. If a later retry is required, first reconcile its provider history through authorized access and retain the original audit; do not delete it to bypass the script's rerun guard.

The recorded 689 application tests, typecheck, build, coverage and prior inspected PDFs remain earlier evidence. The current continuation adds the full local acceptance script and corrects unapplied branding draft 033 to target `library_profile_settings`, the actual application table, instead of nonexistent `library_profiles`. This does not resolve the historical 003 live-checksum discrepancy or authorize applying any live migration.

Migration state stays: live latest **032**, pending **033–037**, next unused **038**. No live database, applied migration source, production configuration, hosting or real funds are touched.

## How: local screen inspection

### Latest ordinary localhost preview — owner correction, November 11

The owner clarified that localhost must show the newest local work, even while
production remains on an older release. Both local servers now run the payment
branch `feat/xendit-sandbox-setup` at `3d16f04` from
`C:/Users/JOHN/Documents/SSL/StiOrmocLibrary-main-sync`: web port 5173 and API port
4000. The older checkout and unrelated changes remain preserved. No push,
deployment or migration was performed.

The API reads the existing original checkout's configuration through Node's
`--env-file` runtime option; no credentials file was copied or created. This
ordinary preview retains the existing database. Enrollment and remembered-device
availability remain enabled. Xendit checkout remains disabled for this database;
the loopback-only sandbox guard was not removed. Showing the Payments page does
not certify or enable a real checkout. Student/Faculty navigation includes
Payments; a Pay now button requires an eligible unpaid charge and an enabled,
configured isolated sandbox.

To restart after stopping these local servers, use two terminals:

```powershell
# Terminal 1
Set-Location C:\Users\JOHN\Documents\SSL\StiOrmocLibrary-main-sync\apps\api
node --env-file=C:/Users/JOHN/Documents/SSL/StiOrmocLibrary/apps/api/.env src/server.ts

# Terminal 2
Set-Location C:\Users\JOHN\Documents\SSL\StiOrmocLibrary-main-sync
npm run dev -w @sti-library/web
```

Open `http://localhost:5173/`. Home, login, staff entry, the protected Payments SPA
entry and API health passed HTTP checks. Served modules contain the actual new
payment routes, payment center and navigation from this checkout. Eight payment
and navigation tests passed. Authenticated visual inspection and real provider
checkout were not performed during this server switch. Use the isolated
application instructions below for synthetic payment acceptance.

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
| Borrower payment center | `http://127.0.0.1:5174/payment-qa.html?view=payments` |

Report selection now serves its matching generated JSON. Unsupported report kinds return an explicit 400. The harness does not implement report filters, pagination or export downloads against a database; those interactions must pass in the full isolated app. The administrative link to the normal reports route is also a full-app check.

Stop only this harness:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:47145/qa/stop
```

Verify ports 47145 and 5174 are no longer listening and `apps/web/payment-qa.html` and `apps/web/.payment-qa.tsx` are absent. The integration test checks the report contract, not the rendered screen. Do not run it while someone is reviewing the harness; it refuses occupied ports.

### Visual and keyboard matrix — scoped component evidence

Use 1440×900 desktop and 390×844 mobile viewports, both light and dark themes. Also check 320 CSS-pixel width and 200% text/zoom. Record actual viewport, browser, theme, screenshot name and outcome for each check. Browser emulation does not satisfy physical-device acceptance.

| Area | Required observable outcome | State |
| --- | --- | --- |
| Recovery | Pause explanation, four readable counts, worker date, waiting/review details, busy state and recovery result | Component PASS: 1440×900 light and 390×844 dark. Checking… and success observed. Error rendering not rechecked visually |
| Settlement dialog | Reference, cost, Philippine date/time, net and saved evidence | Component PASS: entered QA-UI-SETTLEMENT, PHP 1.40 cost, PHP 41.40 gross and PHP 40 net. Synthetic save/read passed. 390×844 dark evidence readable |
| Keyboard | Focus, modal boundary, Escape and opener restoration | PARTIAL: native date entry, report keyboard scroll and Escape/opener restoration observed. Full Tab/Shift+Tab trap remains inconclusive; do not claim a complete keyboard pass |
| Reports | Three matching titles/columns and separate financial totals | Component PASS: fine/printing/reconciliation selected separately. Reconciliation showed PHP 730 successful principal, PHP 22.30 fees, PHP 752.30 gross and PHP 92.90 captured-review excluded from successful principal |
| Narrow reports | Contained horizontal preview and readable wrapping | PARTIAL: 320×740 dark report, keyboard ArrowRight moved the focusable preview; preview client width 253px vs 2481px contents. Outer harness stayed within 320px, with scrollbar allowance. Physical touch untested |
| Dark mode / zoom | Contrast, responsive inputs, focus and messages | PARTIAL: dark recovery/settlement/report and light partial-payment review inspected. Fine review showed PHP 40 principal + PHP 1.40 fee = PHP 41.40, PHP 60 remaining. 200% browser zoom not run |
| Full application | Login, permissions, navigation, real filters, pagination, protected PDF/CSV downloads and receipt links work through the normal routes | Not run |

No warning/error console entries were captured in the controlled component tab. JPEG evidence is retained in ignored `output/xendit-sandbox/`: `phase7-mobile-recovery-dark.jpg`, `phase7-mobile-settlement-dark.jpg`, `phase7-mobile-partial-review-light.jpg`, `phase7-report-320-dark.jpg` and `phase7-desktop-print-report-light.jpg`. These do not validate full application authentication, real settlement, actual touch input or provider checkout.

### Full local application acceptance

`node apps/api/scripts/verify-payment-app.mjs` creates a complete synthetic application schema in the existing guarded loopback database, exercises the normal application and cleans it afterward. `--cadence` additionally observes three minute runs, restarts the same worker and observes a fourth. `--serve` leaves it available for up to 15 minutes. To stop politely, create `output/xendit-sandbox/phase7-app-stop`; do not kill PostgreSQL.

The script refuses occupied web/API ports, nonempty public/storage schemas, wrong database/host/role and nonignored private paths. It records hashes for selected SQL sources. It excludes the old 002 migration and hosted advisor administration files. Four reviewed normalized catalog table definitions live in a dedicated fixture; no historical backfill or old trigger is replayed. Storage bucket metadata is a local stand-in, not Supabase Storage. Schema creation is transactional; after a committed test, cleanup rechecks the exact database/host, drops only the schemas this run created from empty and stops this cluster gracefully. The preexisting `xendit_sandbox` setup fixtures remain.

Normal `createApp()` serves all real routes on 127.0.0.1:47146; the existing production web build and same-origin API proxy use 127.0.0.1:4174. Production environment values are blanked before app imports. Four random-password synthetic accounts use the actual password, OTP hashing/verification, session and authorization services. Only OTP delivery is replaced with a private local sink; it sends no emails and adds no HTTP login bypass. Private password/code state is ignored and removed at shutdown. Enrollment is off in this test; semester enforcement is not accepted by these results. New online checkout stays paused, and no provider capture is fabricated.

This is a local application-required schema, not a checksum-matched replica of Supabase or a production installation procedure. Hosted advisor policies, Storage delivery, external mail and deployment infrastructure are outside its coverage.

Passed: healthy schema and API, all four sign-ins, anonymous/Student/Staff restrictions, other-borrower printing ownership denial, Librarian recovery access and all three real report reads/CSV/PDF exports. A PHP 40 cash payment left PHP 60, same-key retry kept one receipt, another borrower was forbidden from that receipt and its owner downloaded the PDF. Rendered receipt/report PDFs were visually inspected; optional renderer font substitutions did not show clipped or missing content. See ignored `phase7-app-schema.json`, `phase7-app-acceptance.json` and local worker observations for actual timestamps. Browser inspection of these full routes remains blocked by the renewed connection failure. Public callback delivery, deployed scheduler cadence, actual sandbox capture and human/device acceptance remain open.

Final cadence run: 19:48:38, 19:49:38, 19:50:38 and 19:51:39 Asia/Manila on 2026-11-11. The fourth followed a stop/restart of the same worker; zero recorded failures, roughly 60–61-second gaps. `stop()` now awaits its active operation before pool closure. Confirmed loopback listeners 4174/47146/55438/47145/5174 stopped and exact temporary HTML/TSX/private code files removed. Regression **412 API + 278 web = 690**, typecheck, build, fixture HTTP regression and syntax/diff checks passed. Existing bundle-size advisory remains. A later browser inventory retry still returned no browser connection; no settings changes or new provider session were attempted.

Borrower-center continuation: full app acceptance also exercises an owner QR quote/prepare, scoped pending/terminal lists, provider-off historical reads and cancellation before provider creation; no provider money is fabricated. QRPH capture/duplicate confirmation is tested separately with the controlled provider. Current regression is 701 tests. Build first, then run the full-app verifier; do not serve its production assets while the build replaces them. Browser visual and actual hosted QR/callback gates remain pending.

## Full isolated application setup to complete locally before exposure approval

The standard `prepare-xendit-sandbox.mjs` fixture alone is **not** a complete application database: it installs small reference tables and its service verifier drops a minimal temporary schema. The dedicated `verify-payment-app.mjs` now constructs the separate full local app described above. The application health check inspects `public` explicitly; pointing the ordinary API at the minimal service schema cannot pass full application acceptance.

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

The dedicated full-app verifier now implements the bounded local setup above; its results are recorded separately from the component fixture. It found a draft branding table-name defect and an active-worker shutdown race, both repaired and locally verified. Restore stable supported browser access and review this complete stack before proposing public access. No public callback origin or hosting provider has been selected or enabled.

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
- [x] Build the full isolated local application stack; verify normal sign-ins, role/ownership guards, schema health and real report exports. Complete the additional acceptance assertions before claiming their result.
- [ ] Complete supported browser, physical-device and configured-method acceptance.
- [ ] Obtain separate approved public origin, external webhook/runner delivery and observed deployed cadence.
- [ ] Obtain Librarian usability feedback and explicit sign-off.

## Change log

2026-11-11 — Supported browser access briefly worked. Recorded scoped desktop/mobile/dark component evidence, recovery busy/success, synthetic settlement and financial report separation. Access failed again on the full app; no repeated installation requests. Built a loopback-only full application verifier and found/fixed pending 033's incorrect table name. Normal four-role sign-ins and report reads/exports passed; live data and applied migration history stayed untouched.

2026-11-11 — Fresh chat found no available supported browser. Preserved the incomplete hosted audit and corrected the report fixture's substitution of fine records for reconciliation. Added a failing-then-passing HTTP regression and regenerated matching controlled SQL evidence. Defined the remaining full-app, visual, external and human acceptance steps without marking them passed.
