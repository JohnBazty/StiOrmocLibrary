# Merge the hosted whole system into main

**Why** — The owner requested merging the hosted branch into main with the complete hosted Student/user, Faculty, Librarian, Staff and Admin versions.

**Date created** — 2026-11-20

**Date last updated** — 2026-11-20

**Status** — `built`

## Approved scope

The owner explicitly selected **all changes from the hosted version** after being told that newer local admin/dashboard changes were not hosted. The runtime source is the complete `chore/hosted-system` snapshot `0b16dd691894fcc27d8303dcf90c616ca113fd6b`, deployment `dpl_8SSF1zDLKLbi4y6tHoKBB4nkSVe5`. Newer unhosted UI changes are excluded.

Target main baseline: `75e0052ab4f2a2067fbf5061b544f91f7713d75d`. The integration branch is `chore/merge-hosted-system`. A two-parent merge commit preserves both histories and is constructed on that branch, then advances main without a force push. No direct development commit is made on main. The shared working checkout and its index remain untouched.

## Source reconciliation

- All **1,092 hosted application paths** are included. **1,084** are byte-identical to the hosted snapshot; the remaining **8** are test-only corrections described below. Runtime pages, APIs, layouts, role routing and permission checks match the hosted version.
- **423** repository-only paths from main are preserved, including skills and tools. Main-only retired application files are excluded from the integrated application tree, while existing environment templates are preserved without reading/copying their contents. No filesystem deletion or worktree operation is used.
- Every existing main Supabase SQL filename and blob is preserved byte-for-byte. Hosted additional SQL sources are retained; no migration is applied by this merge. Twenty-eight apparent migration changes were only line endings; migration033 also differed on the profile table name, so main's existing source is preserved rather than silently rewriting history. Historical duplicate-number filenames already present across these histories are not executed or renumbered. The repository supports reviewed single-file migrations, not whole-directory replay.
- Latest applied database migration is **073**, next unused **074**. No database or hosting mutation is performed by the merge commands. The migration/hosting work was already separately approved and verified in the DDC release.
- Environment files, server credentials, database records and runtime uploads are not imported into Git.

## Review and verification

The source-equality review covers Student/Faculty shared user dashboard, Admin account dashboard, Librarian dashboard, Staff dashboard, portal navigation, ProtectedRoute and server library permissions. All five role route sets retain hosted authority boundaries. Combined security/correctness/React review confirmed that no new runtime behavior is introduced relative to the selected hosted version. Database review confirmed preservation of all existing main SQL blobs and no live SQL application.

The first full test run exposed three API failures that reproduced on the original hosted source. Updated two disposable printing fixtures to include current document-retention columns and corrected the disabled optional-push expectation. These are test-only repairs; no service checks were weakened.

Full web testing initially found seven stale expectations: old password-code flow versus current email reset links, old collection-review wording, supplier-file upload versus amount-only quotations, an obsolete upload-confirmation click, old dashboard ordering and an absent roster filter argument. Updated five tests to exercise the actual hosted contracts. Password recovery coverage still asserts no recovery secrets in session storage, proper request payload, readable failure/retry and cooldown preventing duplicate requests. Quotation/upload assertions retain amount, permission and retry checks. No runtime component is changed.

Verification results:

- API coverage run: **1,107 passed, 0 failed**; **80.45%** total loaded-file line coverage.
- Web coverage run: **715 passed, 0 failed**, 156 files; **72.86%** lines.
- Focused login/role/dashboard checks: **22 passed**; affected web tests **16 passed**; affected API tests **7 passed**.
- Typecheck and production build passed. The final source tree has no unresolved merge stages; all hosted runtime paths and existing main SQL blobs were verified.
- Initial root test/coverage failures and interrupted duplicate web runs are recorded in local logs. Final API and web coverage runs each executed the entire corresponding suite successfully. An uncommitted temporary Vitest config allowed the isolated candidate to access the existing shared node_modules directory; it is not part of this merge and changes no production configuration.
- Authenticated visual acceptance was not rerun for unchanged runtime pages. This verifies complete selected hosted source and automated checks, not every live user interaction.

## Implementation tracking

- [x] Clarify exact hosted source versus newer unhosted development.
- [x] Reconcile current main with the complete hosted application and preserve repository-only files.
- [x] Preserve existing migration bytes and review database boundaries.
- [x] Verify all role paths, run required checks and correct stale test fixtures.
- [x] Construct a two-parent integration commit for the owner-authorized main merge.

Remote push/merge result is independently recorded in local verification evidence `tmp/host-merge-result.json`; verify GitHub main before reporting completion. The owner authorized this merge; no PR creation or redeployment is required by this source integration.

## Change log

| Date | Change |
| --- | --- |
| 2026-11-20 | Owner requested main integration and selected the complete hosted version. Reconciled application source, preserved repository tooling and historical SQL, repaired stale tests and passed API/web coverage, build and typecheck. |

## Wiki handoff

Configured Ethan vault unavailable. Proposed note for wiki/hot.md Active Threads and wiki/entities/StiOrmocLibrary.md, 2026-11-20: Integrate chore/hosted-system into GitHub main via chore/merge-hosted-system, preserving the current hosted runtime for all roles and main-only tools. All 1,107 API and 715 web tests pass after eight test-only updates; build/typecheck pass. Existing migration bytes preserved, 073 applied/next074. No new deployment or database write. Shared checkout remains on its development branch. Remote merge verification is in tmp/host-merge-result.json.
