# Undo the fines and borrowing policies merge

## Why

The owner requested undoing merge d3e5fe3 after deployment to Vercel.

**Date created:** 2026-11-18
**Date last updated:** 2026-11-18
**Status:** inprogress

## How

Revert merge d3e5fe3 against its first parent using a new commit, preserving main's earlier updates and Git history. Work in an isolated checkout to leave unrelated enrollment planning untouched. Restore the archived borrowing-policy page and prior fine calculator, navigation, and schedule formatting.

Keep already-applied SQL migrations 038 and 040, their ledger facts, and historical implementation records. Do not reverse database schema/data or replay migrations. Latest applied 040, 039 reserved, next unused 041.

Verify code against pre-merge main, run checks, push the revert to main, then deploy its clean source to Vercel and verify the public URL.

## Implementation tracking

- [x] Isolate and prepare the inverse merge changes.
- [x] Preserve applied migration files and factual database records.
- [ ] Pass automated checks.
- [ ] Push the revert commit to main.
- [ ] Publish and verify Vercel rollback.

## Change log

- 2026-11-18: Resumed the interrupted rollback after the owner's repeated undo instruction. No database writes are authorized or needed for this application rollback.
