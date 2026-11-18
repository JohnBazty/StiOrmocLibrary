# Merge fines and borrowing policies into main

## Why

Integrate the owner-requested feat/fines-and-borrowing-policies branch while preserving the latest main workflows and fixing integration errors before publication.

**Date created:** 2026-11-18
**Date last updated:** 2026-11-18
**Status:** built

## How

Merge the branch with history preserved. Keep main's Book Reports position, Maintenance location, operations-only alerts, refresh recovery, and current theme colors. Add restored borrowing policies, Fine rules, and 12-hour schedule formatting. Combine both branches' regression tests. Remove the obsolete archived borrowing-policy page now that its editor and protected API are restored.

Inspect fine calculations, due-date policy selection, route authorization, and migration expectations. Verify migration records read-only; no live database mutations are part of this integration. Run type checks, API/frontend tests, and production build, then commit and push main after checks pass.

## Implementation tracking

- [x] Fetch and compare both branches.
- [x] Resolve the seven conflicting files without dropping either branch's behavior.
- [x] Verify migration requirements and protected fine/policy behavior.
- [x] Resolve integration conflicts; both branches' behavior and tests pass.
- [x] Complete type checks, 517 API tests, 383 frontend tests across 90 files, and production build.
- Merge commit and remote main are verified after this document is committed.

## Change log

- 2026-11-18: Owner authorized conflict resolution, integration fixes, and merge into main. Began integration at main 1f30126 and feature branch ca63695.

## Verification evidence

- Both workspaces passed `npm run typecheck`; `npm run build` passed with Vite's large-chunk advisory.
- `npm test` passed with `ENROLLMENT_ROSTER_ENABLED=false` in the test process, matching the enrollment-independent fixtures; application settings were not edited.
- API tests cover Librarian-only fine/policy access, rejected roles, validation, scheduled rules, transaction rollback, due-instant rule selection, closing-time limits, closed days, midnight transitions, and caps.
- Combined frontend tests retain navigation order, operations alerts, refresh recovery, restored policy controls, fine-rule review, and 12-hour schedule formatting.
- Read-only configured-database checks verified ledger entries for 038 and 040 and exact checksum matches, `change_reason`, all three fine-policy constraints, RLS enabled, and no anon/authenticated table access. Monday–Saturday are 08:00–17:00; Sunday stays closed.
- Applied migration bytes remain untouched. No live database writes, publishing of rules, or migration execution occurred.
- Latest applied migration is 040; 039 remains reserved; next unused is 041. Corrected stale tracker headings and retained historical records.

- 2026-11-18: All integration checks passed. Seven conflicts were resolved by combining behavior and tests; the obsolete archived-policy page was removed as requested by the restored editor. Temporary files remain local.
