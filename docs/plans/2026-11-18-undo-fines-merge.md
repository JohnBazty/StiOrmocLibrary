# Undo the fines and borrowing policies merge

## Why

The owner requested undoing merge d3e5fe3 after deployment to Vercel.

**Date created:** 2026-11-18
**Date last updated:** 2026-11-18
**Status:** built

## How

Revert merge d3e5fe3 against its first parent using a new commit, preserving main's earlier updates and Git history. Work in an isolated checkout to leave unrelated enrollment planning untouched. Restore the archived borrowing-policy page and prior fine calculator, navigation, and schedule formatting.

Keep already-applied SQL migrations 038 and 040, their ledger facts, and historical implementation records. Do not reverse database schema/data or replay migrations. Latest applied 040, 039 reserved, next unused 041.

Verify code against pre-merge main, run checks, push the revert to main, then deploy its clean source to Vercel and verify the public URL.

## Implementation tracking

- [x] Isolate and prepare the inverse merge changes.
- [x] Preserve applied migration files and factual database records.
- [x] Pass 496 API and 373 frontend tests, type checks, and production build.
- [x] Push revert c44d5bb to main with history preserved.
- [x] Publish and verify Vercel rollback dpl_DUmFUZLVSvXciGXJyFj1Yc57fyDL.

## Change log

- 2026-11-18: Resumed the interrupted rollback after the owner's repeated undo instruction. No database writes are authorized or needed for this application rollback.

## Verification and outcome

- Runtime application files, tests, dependency manifests, and Vercel configuration match pre-merge main 1f30126 exactly.
- Shared dependency junctions in the isolated worktree caused a nonportable type path, a denied PDF worker path, and timing-sensitive frontend failures. Fresh dependencies in a clean archive resolved those checks without application edits. Frontend verification used two workers to avoid machine contention.
- The clean copy passed type checks and build; 496 API tests and 373 frontend tests passed. Vite retains its large-chunk advisory.
- GitHub main contains revert c44d5bb. Production deployment dpl_DUmFUZLVSvXciGXJyFj1Yc57fyDL was promoted to https://sti-ormoc-smart-library.vercel.app.
- Six unauthenticated public checks passed: home, login, borrowing-policy deep link, schema health, catalog read, and the JS asset with the Fine rules route absent. See [release evidence](../releases/2026-11-18-fines-rollback.json).
- No database writes, migration rollbacks, or changes to the unrelated enrollment plan occurred.
- 2026-11-18: Completed the application rollback, pushed main, promoted Vercel, and verified the public deployment.
