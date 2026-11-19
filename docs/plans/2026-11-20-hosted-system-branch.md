# Hosted whole-system branch

**Why** — Preserve the whole-system source actually serving on Vercel in one dedicated branch.

**Date created** — 2026-11-20

**Date last updated** — 2026-11-20

**Status** — `built`

## How

Branch: `chore/hosted-system`. Snapshot parent: main at `d3e5fe3663f11c4112088383ea37b5465d79667d`. Source of truth: the Vercel public alias https://sti-ormoc-smart-library.vercel.app, deployment `dpl_8SSF1zDLKLbi4y6tHoKBB4nkSVe5` (candidate host https://sti-ormoc-smart-library-ki46kqdve-ssl19.vercel.app).

The branch contains all **1184 deployed source files**, each verified against Vercel's source SHA-1 before storage. One added documentation file records this provenance. Generated bundles, dependencies, environment/credential files, local Vercel linkage and runtime uploads are excluded; no such files were present in the selected deployed source set. Source snapshots preserve repository file modes where already known. No tracked ignored file was force-added.

This includes the whole deployed web/API system and its deployed schema source, including migration073. It is not a database backup and does not include library records or server secrets. Credentials remain in the existing local/hosting environment. Existing personal data is not copied into this document.

Reference snapshot: three-digit DDC local bulk assignment with 53 English/Tagalog subject rules. Unfinished local Cutter/entry/category extensions and newer local dashboard work are excluded because they are not in this deployment. The complete reference includes 1,000 positions, not universal title-understanding coverage.

## Verification and boundaries

All selected source file hashes match the deployment. The release previously passed candidate typecheck/build, 19 API tests, focused coverage and 6 UI tests. Public health/schema/access checks passed; nine operational tables were verified unchanged by migration073. This branch creation changes no application behavior, so those release checks were not rerun merely to save the same bytes. Broader existing project checks and human acceptance limitations remain documented in the release record.

No checkout switch, worktree, reset, stash, push, merge, redeployment or live database write was performed to create this branch. The existing shared index and all ongoing working changes are preserved. The branch is local until a separate push is authorized. Use the branch as the starting point for a future reviewed production release; updating it does not itself authorize deployment.

## Implementation tracking

- [x] Inspect the current public deployment and retrieve its source manifest.
- [x] Verify all deployed source bytes and exclude secrets/runtime/generated paths.
- [x] Create the dedicated branch from main using an isolated temporary index.
- [x] Verify committed tree contents without switching the shared checkout.

## Change log

| Date | Change |
| --- | --- |
| 2026-11-20 | Owner requested a branch for the whole hosted system. Saved the exact verified deployed source plus this provenance document locally. |

## Wiki handoff

Configured Ethan vault unavailable. Proposed dated note for wiki/hot.md Active Threads and wiki/entities/StiOrmocLibrary.md: 2026-11-20 — Created chore/hosted-system with all 1,184 exact Vercel source files from dpl_8SSF1zDLKLbi4y6tHoKBB4nkSVe5 plus a provenance document. Existing checkout unchanged; no push. Migration073 applied, nextunused074. Next: use this snapshot as the base of a separately reviewed production change.
