# Local payment integration and live-theme preservation

| Field | Value |
| --- | --- |
| Date created | 2026-11-11, Asia/Manila |
| Date last updated | 2026-11-12, Asia/Manila |
| Status | `built` — local integration verified; external/device acceptance remains separate |
| Why | Make the latest local payment work usable, reconcile the reviewed safety changes and preserve the interface already used by the live site |

## Approved scope

**Owner correction, November 12:** keep one ordinary local system connected to
the existing school database. The earlier sample preview is stopped and is no
longer the normal startup. `npm run dev`, `npm run dev:stable` and
`npm run dev:payments` now start the same latest application through
`tools/dev-local.mjs`. It reads the owner's existing private configuration
without copying it; API port 4000, website port 5173. The integrated payment
screens remain present. Xendit Test credentials cannot clear real school bills;
online checkout remains disabled pending separately reviewed activation. The
isolated acceptance commands and sample preview records below are historical QA
evidence, not a replacement for the user's database.

Verification of this correction: ordinary health, enrollment availability,
remembered-device availability, catalog options and catalog list all return HTTP
200. Enrollment is enabled/required/open, and the catalog returns 21 matching
public entries. Eight affected authentication/payment tests pass. No migration,
live configuration, real account or financial record was changed. The screenshot's
registration error was caused by enrollment being disabled in the sample app;
the school database itself was reachable.

John requested a working local payment integration and an explanation/repair of
the local/live interface difference. This authorizes local source integration,
isolated database preparation and sandbox testing. It does not authorize a push,
hosted deployment, live migration, real payment or changes to school records.

## How

Preserve the payment branch and unrelated local work. Integrate the reviewed main
runner, audit/lazy-route changes, pinned real-SQL test helper and cookie sign-in
locally. Keep one scheduler; move payment recovery and status into it. Preserve
the already applied 036 source and renumber only conflicting, unapplied payment
drafts after checking remote reservations. Update payment requests to cookie/CSRF
authentication with ownership and idempotency protections intact.

The ordinary local preview uses the school database and currently disables
online payments. A working sandbox must instead use the dedicated loopback
database and Test credentials, with clearly identified synthetic accounts and
charges. Make that setup reproducible, retain test evidence and distinguish real
Xendit Test confirmation from simulated callbacks. Do not remove the database or
credential guards to make a button appear.

Compare the original checkout's verified deployed UI source with the payment
checkout. Bring over its presentation changes while preserving new payment,
security and runner behavior. A theme synchronization must not replace newer
business logic with the older deployed implementation.

## Implementation tracking

- [x] Preserve current work; integrate reviewed local branches and resolve conflicts.
- [x] Reconcile unapplied migration identities and references; preserve applied bytes.
- [x] Test cookie payment requests and one-runner payment recovery.
- [x] Restore deployed theme without losing new routes or controls.
- [x] Prepare a reproducible isolated local payment application.
- [x] Verify full/partial payments, cash races, confirmation, receipts and ownership.
- [x] Run regression, typecheck and build; attempt browser access and record its limitation.
- [x] Leave a usable local preview and document exact startup, evidence and limits.

## Result and integration details

Local-only branch: `codex/payment-local-integration` in
`C:/Users/JOHN/Documents/SSL/StiOrmocLibrary-main-sync`. Local merge commits retain
the reviewed main runner, sign-in branch, audit/lazy-route branch and pinned
PGlite helper. GitHub draft PRs were not merged or updated by this task. The
original checkout's unrelated edits and private configuration remain preserved.

- Cookie sign-in and CSRF now cover payment quotes, checkout, cancellation,
  recovery and settlement. No JavaScript-readable JWT was restored. A real
  cookie-authenticated payment write without CSRF returns 403.
- Payment recovery is one `payment-recovery` job in the durable 019 runner. The
  old runner and duplicate payment scheduler endpoint are removed. Its status
  uses `scheduled_job_state`, and local shutdown drains an active run. The
  dashboard calls it **Payment confirmation checks**.
- Applied 036 remains byte-identical to the reviewed checksum. Only unapplied
  payment drafts were renamed: 034 foundation to 038, 035 gateway to 039, 036
  counter to 040, and 037 reconciliation to 041. Code/script references and the
  current tracker were updated. Branding 033, runner 034 and circulation RLS 035
  remain unapplied; next local number is 042. No live migration ran.
- The live source had theme and catalog changes missing from the payment
  checkout: primary `#0b5ea2`, sidebar `#132a3f`, charcoal dark surfaces, research
  covers and mobile catalog treatment. These are restored locally, while
  payment routes/navigation, accessibility labels, cookie authentication,
  scheduled-job status and lazy loading remain. Theme source parity is checked;
  no new browser screenshot or visual sign-off is claimed.

## Earlier isolated payment-test evidence

```powershell
cd C:\Users\JOHN\Documents\SSL\StiOrmocLibrary-main-sync
npm run qa:payments
```

The earlier interactive QA run built and started the complete application at `http://localhost:5173`, with
the API on loopback port 4000 and the dedicated local database on 55438. It does
not connect the payment app to school records. Startup refuses occupied ports,
a different database identity, or a previously populated application schema.
The normal school database's `.env` is neither copied nor used for this mode.

Open `output/xendit-sandbox/local-payment-sign-in.md` for the sample login steps.
The random sample password and local email-code inbox are in the adjacent ignored
`phase7-app-private.json`; they are never logged or served through an HTTP
endpoint. Use `QA-PAYMENT-STUDENT` at `/login` or `QA-PAYMENT-LIBRARIAN` at
`/staff`. No real OTP email is sent. The private file updates when the sample
Student requests a code. Acceptance sign-ins are revoked and their OTP cooldown
cleared before interactive testing, only in the disposable database.

The page visibly identifies itself as a local payment test with sample records.
The Student has unpaid printing and finalized fine examples. Open Payments,
choose a bill/fine and **Pay now**. GCash and QRPh have sandbox sample fee rules
of PHP 1 plus 1%; these are not approved merchant rates. Other method families
remain documented but are not claimed enabled for this merchant/test preview.
After using the Xendit Test flow, return to Payments and use Check status; the
existing runner also polls. No public callback origin or production setting is
created by this command.

Ctrl+C, or the exact ignored `output/xendit-sandbox/phase7-app-stop` stop file,
ends this preview. There is an eight-hour maximum. Shutdown first attempts to
cancel pending Test sessions through the real gateway. If provider operations
remain uncertain, it preserves the local database and records safe payment
identities in `local-preview-unresolved.json`, rather than discard evidence.
Otherwise it removes only this run's synthetic public/storage schemas and stops
the owned cluster. A later start refuses preserved uncertain data for review.

## Verification and practical limits

- Final coverage run passed **492 API + 336 web = 828 tests**. Typecheck and both
  production builds passed. API coverage is 69.80% lines; web coverage is 57.62%
  statements and 64.84% lines. The 80% target is not met.
- The isolated full app passed four real password/OTP/cookie sign-ins, payment
  CSRF rejection, role/ownership boundaries, partial cash payment/retry, private
  receipt PDF access and actual CSV/PDF exports for all three financial reports.
  All ten jobs, including payment recovery, completed through the single runner.
- Disposable real-Postgres payment acceptance passed amount/fee math, full
  printing/replacement and partial fines, controlled verified captures, duplicate
  callbacks, cancellation/cash races, outage/lease recovery, late-capture review,
  immutable receipt/settlement evidence and report/export integrity.
- Using the actual local HTTP application and existing Xendit Test credential,
  QRPh options enabled **Pay now**, a PHP 50 printing bill quoted PHP 1.50 fee,
  and checkout returned HTTP 202, `Active`, a verified sandbox checkout URL and
  PHP 51.50 total. Provider cancellation was then confirmed as `Cancelled`.
  This proves real Test session creation and cancellation, not a captured payer
  payment. The provider's read-only authentication check also passed.
- Final localhost health, test banner, deployed-theme colors and source routes
  passed. The live domain still serves its earlier `index-jVHoJkHy.js` bundle;
  nothing was published. Thirty-nine earlier/applied SQL sources, including 036,
  were checked byte for byte against the reviewed sign-in branch.
- Browser control still returned unavailable. Actual visual/keyboard/mobile
  inspection, physical QR scanning, completed hosted payer capture and external
  webhook delivery remain unverified. There is no real-money release claim.

Evidence is kept under ignored `output/`: `local-integration-regression.log`,
`local-integration-coverage.log`, `local-integration-typecheck.log`,
`local-integration-build.log`, `local-integration-provider.log`,
`local-payment-integration-final.json` and the sandbox's
`phase7-app-acceptance.json` / `local-provider-checkout.json`. These files contain
verification outcomes; the sample credential file remains separately private.

## Change log

2026-11-12 — At the owner's correction, stopped the sample preview and restored
the latest app's connection to the real school database. Added one normal local
launcher, preserving the private configuration and payment features. Standard
dev commands no longer silently use sample records. HTTP reads and registration
availability passed, with 21 public catalog entries. Payment provider activation
and hosted migrations remain outside this connection repair.

2026-11-12 — Completed local-only integration, preserved deployed styling,
renumbered unapplied payment drafts and verified the complete isolated cookie
application. Passed 828 tests, coverage, typecheck, builds, controlled capture
acceptance and real Xendit Test session creation/cancellation. Left the local
sample app running; hosted UI, live schema, real accounts and funds unchanged.

2026-11-11 — Started the owner-requested local integration. Confirmed the payment
checkout still uses the old royal-blue presentation while the verified deployed
source uses the newer theme. Kept publication and school-database changes outside
scope.
