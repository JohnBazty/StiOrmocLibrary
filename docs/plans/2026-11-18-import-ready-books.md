# Add ready books while retaining import errors

- Why: one previously failed Ready row disables adding all other reviewed books, despite the page promising that unanswered entries can wait.
- Date created: 2026-11-18
- Date last updated: 2026-11-18
- Status: built

## How

Enable Add when there are eligible ready entries. Keep failed entries in the saved upload for correction without changing their choices or marking them imported. The server excludes stored failures from each ten-row commit and remaining count, and rechecks the error after locking a selected row. Successful review already clears the stored error, making a corrected row eligible again. Existing per-row transactions, permission checks, barcode validation and durable results remain intact. New failures still stop the current attempt for review.

No schema migration or operational import is required for this repair. Current release schema is applied 065 / next unused 066; the older checkout tracker is historical. Changes are mirrored into the current main-sync release source while retaining its newer import tools. Owner approved hosting with “host it”; deployment and canonical checks are complete.

## Implementation tracking

- [x] Trace the disabled button and server retry loop.
- [x] Reproduce with a ready book beside a saved failure.
- [x] Change frontend eligibility and server selection/count/locked-row check.
- [x] Run regression tests, type checks and builds; full-run exception recorded below.
- [x] Publish with owner approval and verify the hosted code, API health and schema.

## Change log

- 2026-11-18: Owner confirmed leaving 83 flagged books out and adding only ready copies. Earlier browser attempt disconnected before any import change. Added scoped repair without deleting, skipping or importing operational records during testing.

## Verification

- Original checkout: 27 import UI tests and two API regression tests passed; type checks and API/web production builds passed.
- Current main-sync release source: all 139 web test files / 617 tests passed, including the mixed ready/failed import regression. Type checks and API/web production builds passed.
- Full main-sync API suite: 830 passed and one printing test file failed. Its isolated rerun passed both tests. No printing code was changed; the full API run was not wholly green and was not rerun wholesale.
- Scoped review: selection and remaining count use the same saved-error exclusion; a row is checked again after locking; errors remain saved until an explicit successful review clears them. Existing authority, transactions, identifier checks and completed-row protection remain unchanged.
- No operational database writes, migration, push or deployment was performed. No live browser acceptance was performed for this code change. The earlier browser attempt disconnected before an import mutation.

- 2026-11-18: Local implementation and verification completed. Hosting and the owner's actual import remain pending; the live page still serves the prior behavior until deployment is approved and performed.

## Hosted release

- 2026-11-18: Owner explicitly authorized hosting. Verified all 1,032 baseline source files against current production dpl_96ZmrMQxibX2KCjnwoW5D1XgRN6k and changed only the two import runtime files. Both modified files exactly match the tested main-sync source.
- Candidate dpl_76TEFNKbuVUyCk7WSEeLzQ9hfC2P built READY and passed protected API health/schema and compiled import-control checks. A last-moment production-baseline guard passed before promotion.
- Promoted to https://sti-ormoc-smart-library.vercel.app. Canonical page/API returned HTTP 200, schema ready, and the referenced maintenance chunk contains the repaired import controls. Previous deployment remains available for rollback.
- No migration, operational import, book/copy mutation, Git commit or push was performed. The owner can refresh the saved upload and add ready books; flagged entries remain saved for later. Authenticated live button interaction remains unverified.
