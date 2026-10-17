# Main branch integration

- Date: 2026-10-11
- Status: built
- Why: bring `codex/library-revision-updates` up to date with `main` while preserving the current revision phases.
- Tracking: integrate `origin/main` at `befe9e5` into revision commit `94db0a1`.
- Recovery: `refs/codex/backups/before-main-integration-20261011` preserves the pre-merge commit; the earlier local-work stash also remains available.

## Implementation

Resolve overlapping login, authorization, circulation, responsive UI, and documentation changes. Preserve the current five-role permission model, email verification, account approvals, public catalog, and Phase 4/5 attendance and desk workflows. Integrate versioned borrowing policies and session invalidation from main.

- Added the Librarian borrowing-policies page and protected API, with configured limits flowing through the catalog, carts, reservations, history, and dashboards.
- Kept Phase 5 checkout gates and in-library assignment/return workflows. Added the upstream read-only take-home preflight and actor-bound confirmation support to the compatible circulation endpoints.
- Successful sign-in now invalidates prior JWT/cookie sessions. Cookie sign-in reads the user version separately from the linked account version.
- Kept current responsive screens, auth popups, role landing pages, provisioning, and phase plans. Restored Librarian authorization in clearance/fine services and floor-plan links where main's older consolidation conflicted.

Historical migration sources remain references. Do not replay either branch's migration directory or apply SQL as part of this Git merge. The applied revision sources through Postgres 024 and the MySQL reference through 048 keep their identities.

## Verification

- API isolated tests: **332 passed**, including session invalidation, divergent linked authentication versions, policy permissions, preflight, and current revision workflows. Tests use the MySQL fixture environment and do not create live database fixtures.
- Web tests: **149 passed across 54 files**.
- Type checking and production build: passed. The build retains the existing bundle-size advisory.
- Connected database: read-only schema readiness passed; policy list and active policy resolution succeeded. No migrations, data resets, or fixture writes were performed.
- All 49 Git conflict entries resolved. A normal merge commit preserves both parents; verify main ancestry and matching remote after publication.

## Changelog

- 2026-10-11: saved recovery reference and began resolving the merge.
- 2026-10-11: reconciled main features with current revision phases, archived competing SQL references, and completed the verification above.
