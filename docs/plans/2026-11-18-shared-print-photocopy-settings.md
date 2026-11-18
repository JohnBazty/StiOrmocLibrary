# Shared photocopy and online printing settings

- Why: make clear that the same acceptance schedule and image-page additions cover both photocopying and online printing.
- Date created: 2026-11-18
- Date last updated: 2026-11-18
- Status: built
- Authorization: owner requested both services and hosting after verification.

## How

The active runtime checkout is `StiOrmocLibrary-main-sync`; the original workspace retains older printing sources. Existing `printing-phase-one.service.ts` already checks the shared availability before accepting either service and applies the same image fees during staff review. Clarify the setup heading, explanatory text, accessible labels, review summary and save result. Add regression evidence for both service kinds using isolated PGlite, without changing live settings or requests. Preserve existing accepted bills and the review-before-save flow.

No schema migration or production data change is required. The active tracker records Postgres 065 applied, next unused 066; the original workspace tracker is stale. Deploy a focused snapshot of the current production source so unrelated local work is preserved.

## Implementation tracking

- [x] Locate active runtime and trace shared schedule/pricing enforcement.
- [x] Clarify that the setup and final review apply to both services.
- [x] Verify both services receive reviewed image fees and reject submissions outside the shared schedule.
- [x] Run focused frontend/API tests, typecheck, production build and screen inspection; record the full-suite limitation below.
- [x] Deploy, verify live health and published wording, and record release evidence.

## Change log

- 2026-11-18: Confirmed shared backend behavior; started wording correction and paired-service regression checks. No live settings changed.

## Verification evidence

- Focused API: all four printing Phase 1 tests passed. The isolated Postgres workflow now exercises Print and Photocopy with the same reviewed image charges (PHP 1.50 monochrome + PHP 3.00 colored across two copies = PHP 9.00 image addition) and confirms that both reject new submissions when the shared schedule has no opening.
- Focused frontend: all four printing Phase 1 interaction tests passed, including the explicit service heading, shared schedule label, review summary and saved result.
- `npm run typecheck` and `npm run build` passed in the active checkout.
- Browser: inspected the actual component in a local dark-theme harness with synthetic settings and no live writes; heading, inputs and final review rendered clearly. Initial browser attempts timed out during system load, then the completed check succeeded. This was not an authenticated production settings save.
- `npm test` was attempted but interrupted during severe system load; a completed full-suite result is not claimed. No coverage run for this wording-only change.
- Packaging: verified 1,030 source files against the hosted source manifest. Preserved the newer production printing-supply changes from `dpl_UvnhnZLoUZFaxJdPQzT92MnVN5R3`. The only runtime source difference is `PrintingServiceSetup.tsx`; regression test changes are also included. No private environment files or QA harness are packaged.

- 2026-11-18: Verified candidate `dpl_Fv5ZoETiG9c1F4saNypVHqMD6Zeh` health and all shared-service text in its protected built setup chunk. The promotion guard detected newer production `dpl_75AHy9wES2mroVNdV1vLyfjBcVCs`; candidate was not promoted. Refreshing the snapshot to retain that release’s ink-edit dialog and paper-size updates.

- 2026-11-18: Refreshed candidate `dpl_96ZmrMQxibX2KCjnwoW5D1XgRN6k` reached READY. Exact-package API tests passed 4/4 and frontend interaction tests passed 4/4 (explicit jsdom because the deployment source omits the local Vitest config). Source comparison confirms one runtime wording change and two test changes. Self-review found no data, permission or pricing-calculation changes.

- 2026-11-18: Promoted `dpl_96ZmrMQxibX2KCjnwoW5D1XgRN6k` after protected candidate health/schema/assets checks and a last-moment production-baseline check. Canonical https://sti-ormoc-smart-library.vercel.app returned HTTP 200, healthy API, ready schema and the verified shared-service wording in its referenced Library setup chunk. Previous deployment `dpl_75AHy9wES2mroVNdV1vLyfjBcVCs` is preserved. No migration, live settings/request mutation or GitHub push. Removed the synthetic QA harness and stopped its dedicated dev server. Existing development servers remain available.

## Final release

- Live deployment: `dpl_96ZmrMQxibX2KCjnwoW5D1XgRN6k`.
- Live URL: https://sti-ormoc-smart-library.vercel.app.
- Active runtime checkout: `C:/Users/JOHN/Documents/SSL/StiOrmocLibrary-main-sync`.
- Isolated deployment snapshot: `C:/Users/JOHN/AppData/Local/Temp/sti-print-photocopy-scope-20261118`.
- Scope: one runtime text-only component plus two regression-test files. Existing shared backend policy was verified, without altering accepted bills or live settings.
- Validation: exact-package API 4/4, web 4/4; active-checkout typecheck/build passed; local component browser review and candidate/canonical HTTP, schema and assets passed. Full-suite interruption remains disclosed above.
