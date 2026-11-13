# Circulation audit remediation

Why: follow the owner's adopted November 13 groupmate audit while preserving unfinished payment work and real school data.

Date created: 2026-11-13

Date last updated: 2026-11-13

Status: inprogress

## How

Build on current origin/main (2dacbde) in an isolated ordinary clone, branch fix/circulation-audit-remediation. Both existing checkouts are dirty; do not switch, stash, reset or delete them. Integrate verified source changes into the running local checkout with explicit per-file three-way comparison, retaining payment modifications. No new application instance, copied secrets or live data mutations.

Follow audit order: reservation pickup = one open day with configured closures; hide inactive renewal/long-overdue settings until integration; inspect and locally integrate PR 13 and PR 27 with their actual dependencies; port only relevant long-overdue logic from 6dd0c64 in Postgres-only form. Preserve applied migration filenames/bytes. Do not port deleted MySQL files. Record future claims-returned and found-book refund plans separately. Verify the runner rather than duplicate or blindly activate it. Job activation, migrations and deployment retain their exact-step authorization requirements.

The owner approved this claims-returned planning rule: Librarian reviews; fines continue until physical return is confirmed; a claim alone never marks the book Lost. This is a plan task, not authorization to guess the remaining lost/refund policy.

Remote inspection: PR 13 is open, mergeable and targets main. PR 27 is open and targets feat/damage-cases, not main; its dependency must be included/reviewed before any merge proposal. No GitHub mutation is authorized merely by reading those findings.

## Implementation tracking

- [x] Read audit, repo rules and current branches; protect dirty work
- [ ] Reservation open-day deadline regression and repair
- [ ] Hide ineffective policy controls, or make them functional through reviewed integration
- [ ] Review/integrate renewal PR 13 locally against approved rules
- [ ] Review/integrate book-price PR 27 and its damage-case prerequisite locally
- [ ] Port/test long-overdue logic against existing 017 schema
- [ ] Correct signed-out visitor wording
- [ ] Separate claims-returned and found-book refund plans
- [ ] Read-only production scheduler verification and exact remaining activation steps
- [ ] Tests, typecheck, build, coverage, combined review and local source integration
- [ ] Owner-approved GitHub/production actions, if still required

## Change log

- 2026-11-13: Owner adopted the audit. Fetched current remote main, confirmed Manila fix 2dacbde. Created isolated fix branch without touching dirty checkouts. Confirmed PR 27's base is damage-cases. Owner approved the claims-returned review/fine rule above. No live data changed.
