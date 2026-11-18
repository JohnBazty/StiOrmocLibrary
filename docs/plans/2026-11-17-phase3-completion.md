# Phase 3 completion: exact overdue fines and urgent cases

- Why: finish the remaining urgency settings and dashboard/inbox integration without changing debts.
- Date created: 2026-11-17
- Date last updated: 2026-11-17
- Status: built
- Authorization: owner requested complete Phase 3 and hosting. No GitHub push.

## How

Extend the existing fines module, school-email sender and durable notification job. Three optional thresholds (outstanding amount, complete days since return deadline, complete days since charge assessment) match independently. Blank disables a trigger; no amounts, deadlines or penalties are invented. Settings use a reviewed version and audit events. Current cases derive from actual fines, confirmed replacement assessments, accepted printing charges and other service charges, less real allocations/adjustments. Practice payments never settle school debt. Partial payment never resets age. Resolved/waived/voided/paid cases disappear on the next read; original events remain.

Notifications use one durable key per recipient/source/settings version and generic text, without personal/financial details in email or lock-screen previews. Email is optional, uses the existing sender, and is bounded to one attempt per scheduled pass with retry backoff. SMTP delivery can be retried after an ambiguous send result; no exactly-once email claim is made. Dashboard and Fines management show current cases and last-notified time. No second scheduler.

Lifetime conduct warnings and reviewed replacement costs remain as built. Exact overdue accrual retains approved operating-calendar rates/caps and never waits for conduct warnings.

## Implementation tracking

- [x] Settings, current obligations and notice deduplication
- [x] UI review and dashboard worklist
- [x] Migration privacy/preservation and SQL verification
- [x] Automated tests/typecheck/build
- [x] Host and verify canonical health/assets/protection
- [x] Record signed-in acceptance coverage and limits

## Change log

- 2026-11-17: Started remaining Phase 3 implementation at owner request. Migration 056 is the baseline; new additive migration 057, next unused 058 after application.

## Verification so far

770 API tests and 543 web tests pass. Typecheck and production build pass. The new real-SQL test verifies remaining-balance calculation, partial payment age, notice deduplication, initial configuration, stale version rejection, paid-case removal and browser-role denial. Existing exact-due-time, closed-day and cap tests remain green, with an added before/at/one-millisecond-after due boundary test.

Migration 057 is applied after verifying the deployed 056 checksum. Nine existing financial/account/loan tables match their pre-migration fingerprints. New settings, events and notices enable RLS and deny browser-role grants, including their sequence. Existing configuration starts with all three triggers disabled and optional email off; the school chooses thresholds through the reviewed form.

Native browser exercised the actual new component against synthetic local responses: expand configuration, review the proposed thresholds, save, and confirm the success message. This is a local interface acceptance check, not a signed-in production transaction or a real-device mobile check. No real student incident, fine or mail was created for acceptance.

## Hosted release

- Deployment `dpl_DQ84RhHxHCWQJcZaaqiHQhigsx7v`, promoted to https://sti-ormoc-smart-library.vercel.app after candidate health and access checks.
- Canonical API health is healthy with a ready schema. Unsigned urgent-case requests return 401. Dashboard and fines routes and the published urgent-case component return 200.
- Runtime package: `C:/Users/JOHN/AppData/Local/Temp/sti-vercel-phase3-28bb8bdc`, based on the previous deployed violations release. Hosted-only payment-preview readiness remains preserved.
- All Phase 3 implementation work is delivered. The separate human production/device trial is not claimed: browser acceptance used synthetic local responses, while production was checked through HTTP, schema readiness, permissions and published assets. This limitation does not represent an unimplemented feature.
- Coverage was run for the new API and interface modules. No production financial writes or external test mail were needed. No GitHub push.
- Initial alert thresholds and optional email are off until the librarian saves approved school values in Fines management > Set urgent alert rules. No school threshold, debt deadline or additional penalty has been invented.
