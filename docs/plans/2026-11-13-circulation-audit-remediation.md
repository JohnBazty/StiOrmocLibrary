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
- [x] Reservation open-day deadline regression and repair
- [x] Hide ineffective policy controls, or make them functional through reviewed integration
- [x] Review/integrate renewal PR 13 locally against approved rules
- [x] Review/integrate book-price PR 27 and its damage-case prerequisite locally
- [x] Port/test long-overdue logic against existing 017 schema
- [x] Correct signed-out visitor wording
- [x] Separate claims-returned and found-book refund plans
- [x] Read-only production scheduler verification and exact remaining activation steps
- [ ] Tests, typecheck, build, coverage, combined review and local source integration
- [ ] Owner-approved GitHub/production actions, if still required

## Change log

- 2026-11-13: Owner adopted the audit. Fetched current remote main, confirmed Manila fix 2dacbde. Created isolated fix branch without touching dirty checkouts. Confirmed PR 27's base is damage-cases. Owner approved the claims-returned review/fine rule above. No live data changed.

## Evidence and review

- Isolated branch tests: 506 API + 293 web passed; typecheck and production build passed. Build reports an existing large-bundle warning.
- Coverage command passed; overall coverage remains below 80% (API lines 72.47%, web lines 64.18% on the first complete run). This is a remaining repository-wide test gap, not a claim of complete coverage.
- Combined correctness/security/React review: checked owner-scoped renewal access, DB-confirmed staff roles, bounded input and idempotent decisions, locked checkout/renewal/return paths, case permissions, borrower-safe summaries, refund/payment preservation, and responsive wrapping. Repairs include actual Librarian/Staff roles, preserving the recorded Manila due clock, blocking damaged/repair copies, role-correct follow-up links, active-case summary precedence, return-driven case closure, paginated follow-ups and event/focus refresh without clearing typed notes.
- Database review: no schema or dependency-lock changes. Applied 017_loan_renewals.sql, 018_loan_renewal_hardening.sql and 017_circulation_cases.sql checksums match the live public ledger. No writes, migration or operational smoke scripts were run against school data. Existing unique constraints prevent duplicate renewal decisions and duplicate long-overdue cases. Long overdue is a review, never an automatic Lost declaration or replacement bill.
- Lost charge: known book price takes precedence over quotation. PR 27 retains its reviewed quotation fallback only when the title has no price; damage write-off requires a reasoned entered price when none exists. Existing old charges are preserved; there is no historical repricing.
- The original legacy renewal-plan cutoff text is historical. Current owner-approved same-clock loan behavior controls the new extension; existing recorded loans are never reset to 8:59 AM.

## Production scheduler finding (read only)

On 2026-11-13, smartlib-jobs-all is absent from cron.job; there are no corresponding run records, no last successful runner executions, and neither required Vault secret name exists. Both cron client-role usage checks are false. Required job/case tables are present with RLS enabled.

The API forces Node's Manila calendar, but current_setting('TimeZone') on the hosted pooled connection returned UTC. Therefore do not rely on the session startup option as proof of Manila time. New deadline logic uses explicit Manila conversion; case timestamps use explicit AT TIME ZONE where added. Broader legacy NOW()/wall-time normalization remains a separate migration/review concern.

Remaining activation steps follow docs/runbooks/durable-job-runner.md: verify the current production health and deployed runner secret, obtain exact approval to save the URL/secret into Vault, verify net is not Data-API-exposed, then obtain separate approval to create the single named Cron schedule. Verify only read-only run metadata afterward. Do not activate a local timer against the live database.

## Separate plans

- 2026-11-13-claims-returned-plan.md: approved Librarian review, continuing fines, no claim-driven Lost status.
- 2026-11-13-found-lost-book-plan.md: physical recovery, unpaid charge cancellation proposal and verified refund workflow; charge policy still requires approval.
- 2026-11-13-loan-notice-plan.md: email outbox and day-level notices; levels and rollout still require approval.

## Pending release actions

The renewals and book-price PRs were merged into the isolated local audit branch only. No remote merge, push, deployment, real email, loan, fine, refund or scheduled-job execution is included. Keep this document inprogress until local integration verification and individually approved release actions finish.
