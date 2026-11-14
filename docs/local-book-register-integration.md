# Local integration of feat/book-register

## Why

Integrate the complete feature branch into both the original comparison and updated working copy while retaining each copy's existing behavior and design. The owner approved all branch additions on 2026-11-14 and requested local work only.

## Date created

2026-11-14

## Date last updated

2026-11-14

## Status

built

## How

Source branch: feat/book-register at 203c0c4. Both local Git heads began at 08da5c9. Integration uses Git three-way merge trees and a separate temporary index; existing branches, normal indexes and uncommitted work remain in place. The original integration remained local and uncommitted. The owner subsequently requested a local checkpoint of the updated app; it is being saved on codex/book-register-ui-integration with both the existing baseline and feat/book-register recorded as parents. No push, PR, deployment or hosted database operation is authorized.

Before integration, all 159 modified/deleted/untracked paths in the updated copy were recorded; existing source files and a binary tracked diff were saved outside the repository. Original files affected by the feature were also backed up. Private environment files were hashed for verification and were not copied or printed.

The feature adds Book Register, title/author/ISBN lookups, lookup covers and category suggestions, lookup-assisted imports, Find book details, and unsaved-change protections. All 78 incoming files were integrated into both copies. Twelve updated-copy conflicts were resolved by retaining current presentation and adding the incoming behavior. The reference friend-ui folder is outside the integration.

Preserved updated-copy behavior includes the reference shell and public styling, charcoal dark surfaces, category sorting, research filters, Staff email wording, attendance panel separation and polling intervals, and the saved-QR orientation retry. Existing circulation audit and renewal work is retained in both copies.

The incoming branch explicitly flags compatibility with lost-book charging: new copies save cost_php instead of titles.purchase_price. Clearance and circulation-case review/charging now read COALESCE(pc.cost_php, t.purchase_price), retaining legacy fallback and historical charge snapshots. A real PGlite regression proves the copy price wins when it differs from the title price.

Migration 037_book_register.sql is copied byte-for-byte from the source branch. Both local databases currently lack its six columns. Local database preparation must retain all existing records, take private backups first, and use the repository's single-file transactional migration runner. Hosted migration state reported by the incoming branch is not evidence of local application. Next unused migration number is 038; this integration adds no additional migration.

## Implementation tracking

- [x] Confirm full-branch scope with the owner.
- [x] Preserve source backups and prepare merge candidates outside both working copies.
- [x] Resolve conflicts and integrate source into both local copies.
- [x] Preserve per-copy lost-book pricing with regression coverage.
- [x] Prepare and verify local database migration 037.
- [x] Run tests, coverage, type checks and production builds for both copies.
- [x] Review new routes and forms in real browsers and verify preservation hashes.

## Change log

- 2026-11-14: Began local integration of the complete feature branch, preserving existing work and separating local schema verification from hosted state.

## Verification results

| Check | Updated copy | Original copy |
| --- | --- | --- |
| API tests | 548 passed | 546 passed |
| Frontend tests | 373 passed | 333 passed |
| Root type checks | Passed | Passed |
| Root production build | Passed | Passed |
| Root coverage run | Passed | Passed |
| Frontend statement coverage | 61.49% | 59.70% |

Tests and coverage used the documented process-only WEB_ORIGIN=http://localhost:5173 override. Both builds retain the existing large-bundle warning. The pricing regression was observed failing before the fix and passing after it; existing null-price fallback tests also pass.

Migration 037 was applied transactionally to sti_library_audit_local and sti_library_enrollment_test on localhost:55432. Custom-format private database dumps were created first. Before/after counts and hashes matched for accounts, users, borrow transactions and attendance logs, and for titles/copies with only the six new fields excluded. Both migration ledgers match the unchanged source SHA-256. Read-only register queries return 4,215 copies in each database and verify all six added columns. No hosted database connection was used.

Isolated Edge browser checks rendered the actual register, Find book details, category editor and add-book components from each running website. API responses were intercepted for component checks using a register result read from the local database. Thirteen register columns render; fund filters send the expected parameter; mobile pages fit without page overflow; light/dark previews were inspected; Keep editing retains typed input and Discard changes closes the category editor. New cost-price controls are present. These checks made no write requests and produced no browser errors. They do not claim a complete authenticated Librarian acceptance run or live Open Library/Google Books provider verification.

Both APIs were restarted to load the new code. The three websites remain available on 5173 (original), 5174 (updated) and 5175 (reference). Register endpoints return the expected 401 for unsigned requests.

Preservation verification confirms 140 unrelated pre-existing changed paths retain their exact bytes/deletion state; private configuration hashes and both Git heads are unchanged; 037 bytes match the fetched feature branch. Existing local research-filter edits, category sorting, Staff wording and QR orientation retry remain. The friend-ui source was not changed. At completion of file integration, all changes remained uncommitted. The later local checkpoint applies to the updated app only; the original comparison copy remains separately uncommitted.

Private source backups, database dumps, manifests, merge candidates, logs and browser previews are under the external STILibraryLocal/book-register-integration-2026-11-14T06-05-50-238Z folder. No private environment file was copied there.

## Integration review

Reviewed the integration for authorization, input bounds, parameterized register queries and sort allowlists, CSV formula escaping, import value preservation, provider URL restrictions/timeouts, and compatibility with existing circulation charging. The per-copy cost incompatibility was fixed in clearance and circulation cases with legacy-title-price fallback. No other blocking integration finding remains from this review. Incoming documented limits of unsaved-change detection and external lookup quotas remain.

- 2026-11-14: Completed source integration, local migration and preservation verification, tests, coverage, builds and browser checks. No push, PR, deployment or hosted database operation.

## Local checkpoint

2026-11-14: The owner requested a local commit of the combined updated app, with no upload. The checkpoint includes the visual changes, previous fixes, complete book-register integration, migration 037 and project documentation. Private environment files, runtime storage, local database files, test-account credentials and external database backups remain outside the commit. Local branch: codex/book-register-ui-integration. Book-register source parent: 203c0c4. Baseline parent: 08da5c9. The commit hash is reported after creation rather than embedded in its own source tree.
