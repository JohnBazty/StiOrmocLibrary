# Phase 3 — Violations records, warnings and fines

- Why: record conduct incidents fairly, show warnings before fines, and preserve a clear history for borrowers and librarians.

- Date created: 2026-11-17

- Date last updated: 2026-11-17

- Status: built

- Goal: extend Phase 3 of the library service priorities roadmap with a complete violations-records workflow.

- Authorization: owner authorized implementation and hosting on 2026-11-17. GitHub push remains unauthorized. Open school-policy decisions must be settled before enabling progression or charges.

- Architecture: existing React/Vite interface and Express modular monolith; extend the fines domain with additive Postgres records and existing notification/payment services.

- Tech stack: TypeScript, React, Tailwind, Express, pg and existing notification/job infrastructure.

## Sources and current findings

This is the November 17 service-priorities Phase 3, not the older catalog or October activity Phase 3.

- [Parent roadmap](2026-11-17-library-service-priorities.md): first warning, second warning, final third warning, then fine eligibility on the next qualifying conduct incident. Warning scope/reset remains unconfirmed.

- [Final Draft](../source/Final-Draft.pdf), PDF pages 8 and 22: behavioral infractions such as noise/eating, configurable overdue calculations, capped penalties, balances and auditable payments.

- [Administrative System Flow](../source/Admin-System-Flow.pdf), page 1, Fines Management: searchable fine records, user identity, amount, payment status and exports. Its edit/delete labels will be implemented as traceable corrections/voids, preserving financial history under current repository rules.

- Read `agent.md`, `docs/schema-context.md` and `docs/supabase-migration-plan.md` before implementation. Older tracker sections lag the Phase 1 release record.

- Current `fines.service.ts::issueInfraction` immediately inserts a positive-amount Infraction fine and linked `fine_infractions` row. It cannot represent a warning without a charge. The existing service guard permits Admin/Librarian; its name does not imply restricted Staff access.

- Existing fines, allocations, adjustments, receipts, clearance and notifications must be reused. Do not turn a warning into a zero-value fine or create a second balance ledger.

## Confirmed owner decisions — 2026-11-17

- Counts are separate for each person and violation category.

- Eligible new students (Grade 11 / first-year college entrants) have three warnings once during their stay at STI. No automatic term/year reset or new allowance on enrollment changes.

- Initial librarian review records verified entrant status and warnings already used per category. Existing students are not silently granted a fresh allowance; no source entry-year exists to infer eligibility automatically.

- Warnings alone do not restrict borrowing or clearance. After three warnings, the librarian reviews and enters the normal fine amount through the established fine process. No invented fixed tariff.

- Restricted Staff receives no new fine/policy authority. Existing Librarian authority applies. Faculty continues the normal fine process.

## Original planning questions (superseded by decisions above)

1. **Warning scope:** recommend one counter per person and violation category. Alternative: one shared conduct counter across categories. Recommendation is not approval.

2. **Reset:** recommend a new counter each academic term, preserving prior terms in history. Confirm treatment outside a term and whether counters ever carry over.

3. **Fine policy:** confirm category amounts, later-offense treatment after the fourth incident, and who can approve exceptions. No default monetary charge is invented.

4. **Standing:** confirm whether an unresolved conduct case independently blocks clearance or borrowing. A warning must not automatically become unpaid debt or a new restriction. Preserve already approved standing rules.

5. **Restricted Staff:** recommend Librarian-only recording and correction initially, matching current fines authority. Explicitly approve any Staff reporting/review workflow before adding permissions.

## How — everyday workflow

1. Open **Fines & violations → Violations records**, then **Record violation**.

2. Scan the person's school QR or search by school ID/name. Show the matched person's name and school ID; require a selection for ambiguous results.

3. Select a familiar category such as Noise or Eating/food; enter what happened. Default date/time to now in Philippine time; location can use a reusable library choice. Examples are not a final category policy.

4. Show relevant previous incidents and the proposed result automatically: First warning, Second warning, Final warning, or Eligible for fine review. Staff never types a warning number.

5. Review the person, incident, relevant warning history, proposed action and any approved amount before **Save violation**. A changed counter or policy requires a fresh review.

6. Save one incident and its warning/review event atomically. The first three qualifying incidents create warnings only. The next qualifying incident becomes eligible for librarian assessment; eligibility alone does not collect money.

7. For an approved fine, show the amount and reason before **Issue fine**. Link exactly one existing-domain fine to the incident. Keep payment and receipt actions in the established fines/payment flow.

8. Notify the person with a link to their own record. Record delivery attempts separately; notification failure must not lose or duplicate the incident. A delivered message is not proof it was read.

### Records and details

Use a searchable, paginated table with Person / School ID, Incident date, Violation, Action taken, Case status and Recorded by. Filter by date/term, category, warning stage, case status and person. Use explicit text; amber warnings, blue information, green success, red errors.

The details drawer shows incident facts, warning sequence, staff identity, policy version, correction history, notices and linked fine/balance when present. Keep case status (Recorded, Under review, Resolved, Voided) separate from action (warning/fine) and financial status (unpaid/partially paid/paid/waived). Paying a fine does not erase the incident or reset the warning counter.

Student/Faculty **My violations** shows only their own incidents, warnings, reasons, review outcomes and linked balances. Provide a clear way to ask the librarian for review without promising a new messaging feature. Do not expose another person's records or internal sensitive notes.

Corrections require a reason and retain original values. Void an incorrect record rather than delete it. If a correction changes which incidents qualify, require librarian review of affected later stages; never silently issue, waive or refund money. Backdated incidents keep both incident time and recording time, and require explicit sequence review rather than automatically changing past warnings.

## Data and API design

Proposed additive records, with final names checked against the live schema before SQL authoring:

- `conduct_incidents`: stable person link, category, incident time/location/details, recording actor/time, policy version, scope key, action/case state, optimistic version and optional unique fine link.

- `conduct_incident_events`: append-only warning, review, correction, resolution, void and fine-link events with actor, reason and before/after facts.

- `conduct_policy_versions`: approved category/rate, counter scope/reset and effective date; retain historic versions. Use existing policy storage instead if its contract safely supports these rules.

- A scoped counter/lock record or equivalent database serialization point keyed by person, category/group and term/reset period. Concurrent incidents must not receive the same next warning. Counters are rebuildable from authoritative events.

- Actor-scoped request keys and payload identity: replaying the same request returns its saved result; reusing a key for different facts fails. One incident cannot produce two fine assessments.

Proposed API operations within the fines domain: preview incident outcome; create incident using reviewed version; list/detail incidents; append correction/void/review events; approve linked fine; list/detail own incidents. Follow existing route conventions and apply API permissions, owner scope, pagination and validation. Preview is read-only; saving recomputes trusted policy and stage within the transaction.

Enable RLS and revoke direct browser-role access to new tables/sequences. Use server-side authorization, parameterized SQL, exact money arithmetic, UTC instants with Asia/Manila presentation, foreign keys and relevant person/date/scope indexes. No incident facts or financial details in public push/lock-screen text.

### Legacy records and migration

Preserve existing `fines` and `fine_infractions`, payments, adjustments and receipts unchanged. Show them as **Historical infraction fine** with source links; do not fabricate warnings or count them toward new progression without an approved transition policy. New warning rules apply prospectively from their effective date.

The Phase 1 release record documents applied Postgres `053_printing_analysis_and_service_setup.sql`, next unused `054`; this checkout only contains product files through `032`. Verify the actual build checkout, hosted ledger, intervening sources and checksums before reserving a number. Phase 2 may consume `054`; do not reserve it for Phase 3 now. MySQL rollback reference remains `20261009_048_rename_system_brand.sql`, next `049`. No SQL is authored or applied by this plan.

## Remaining Phase 3 integration

- **Overdue books:** no conduct warnings or grace period. Calculate from the exact saved due instant using approved operating days, rates, units and caps. Delayed/repeated jobs catch up without adding a day or double charging. Confirm rounding with the existing approved policy rather than inventing a new rule.

- **Lost/beyond-repair books:** librarian assessment follows circulation case records, separate from conduct counters. Phase 4 owns condition/disposition changes.

- **Urgent priorities:** configurable overdue/unpaid age and outstanding-balance thresholds use current balances and original deadlines/assessment times. Partial payments do not reset age. Deduplicate notices through existing workers; resolved/voided cases leave the active worklist but retain history. No extra late-payment penalty.

- **Clearance:** inspect `clearance.service.ts` and fine refresh paths; calculate approved standing consistently after valid charges, payments and corrections. Do not block from a warning merely because a record exists.

- **Reports:** show warnings/incidents separately from assessed amounts and confirmed collections. CSV/PDF share the same filters and permissions. Phase 7 provides final cross-module export acceptance.

- **Phase 2 dependency:** use its final charge/payment allocation contract when available. Planning Phase 3 does not approve or bypass Phase 2.

## Implementation tracking

- [x] Read current roadmap, authority documents and relevant existing fines code.

- [x] Save Phase 3 violations plan and link it from the parent roadmap.

- [x] Confirm counter scope/reset, fine rules, standing and permissions.

- [x] Obtain build authorization and reconcile active checkout/schema/payment dependencies.

- [x] Add focused policy tests, then implement stage calculation and stale-preview handling.

- [x] Create/test additive migration in a disposable schema; check RLS, browser denials and retained-data fingerprints.

- [x] Implement transaction-safe incident/event APIs and retire the immediate-fine bypass for new conduct incidents.

- [x] Build Librarian table, review dialog and own-record views with loading, empty, retry and permission states.

- [x] Integrate existing fines/payment/clearance and notification services.

- [x] Regression-check existing overdue/fine behavior; preserve existing deduplicated worklists. New urgency-threshold configuration remains outside this records delivery.

- [x] Run focused suites, affected full checks, typecheck, build and deployed HTTP/schema/assets checks.
- [ ] Human signed-in desktop/mobile workflow acceptance (no personnel credentials were available for the native browser trial).

- [x] Update schema context, migration tracker and implementation evidence after authorized work.

- [x] Complete technical release and record remaining human acceptance explicitly.

## Verification targets

1. Incidents 1–3 create first/second/final warnings and no charge; incident 4 requires reviewed assessment. Later incidents follow the approved policy.

2. Category, term change, out-of-term incidents and effective dates follow the confirmed scope/reset rule. Payment never resets warning progression.

3. Duplicate submissions, concurrent staff actions, stale previews and worker retries create one authoritative result. Changed payloads cannot reuse a request key.

4. Backdating, corrections and voids preserve originals and surface affected-stage review. Existing fine receipts and balances remain unchanged unless explicitly adjusted through their normal service.

5. Unauthorized roles, cross-user reads, guessed IDs and direct browser database access fail. Archived account history remains readable under authorized access.

6. Exact before/at/after-due instants, closed days, Manila/UTC conversion, delayed jobs, caps and rounding match approved overdue rules.

7. Own-record pages, notices and CSV/PDF distinguish warnings, cases, debt and collected money. Filtering applies before pagination/export; retries do not duplicate notices.

8. Failed notification delivery leaves a valid saved incident recoverable. Failed financial transactions leave no half-saved fine/counter/clearance state.

9. Desktop/mobile flows support keyboard use, readable validation, clear person identification and review before saving.

Likely verification commands: `npm test -w @sti-library/api`, `npm test -w @sti-library/web`, plus the repository's current typecheck/build commands after checking workspace scripts. Run focused conduct/fines/overdue/clearance tests first. No application tests are needed for this documentation-only change.

## Implementation targets

Existing API: `apps/api/src/modules/fines/{fines.routes.ts,fines.controller.ts,fines.service.ts,fines.validation.ts}`, `apps/api/src/modules/circulation/circulation-overdue.service.ts`, `apps/api/src/modules/clearance/clearance.service.ts`, notifications and live reports modules.

Proposed API: focused `conduct-policy.ts`, `conduct.repository.ts`, `conduct.service.ts` and their tests under the fines module. Reuse established controller/service boundaries.

Existing web: `apps/web/src/features/fines/AdminFinesPage.tsx`, `StudentFinesPage.tsx`, `apps/web/src/App.tsx` and `apps/web/src/layouts/PortalLayout.tsx`. Proposed `ViolationsRecordsPage.tsx`, `RecordViolationDialog.tsx`, `MyViolationsPage.tsx` and focused API/types/tests under `features/fines`. Inspect actual dashboard priority components in the active checkout before choosing integration files.

## Implementation evidence

Runtime work is in `C:/Users/JOHN/Documents/SSL/StiOrmocLibrary-main-sync`, preserving hosted Phase 2. Migration `056_conduct_records.sql` adds lifetime per-category initial reviews, incident records and append-only events. No original loans, fines, payments or receipts are rewritten. Student own-record APIs remain scoped to the signed-in person; Librarian endpoints retain library.manage authorization.

Records offer person/category/date filters, pagination, original facts, correction/resolution/controlled void events and filtered CSV/PDF exports. The existing immediate-fine HTTP route now requires the reviewed conduct flow. Warnings create neither a fine nor a clearance update. Later cases cannot silently lose warning history through a void. Existing historical infractions stay in financial history.

Overdue calculation, current overdue worklists and lost/damage assessment are preserved and regression-checked; no conduct grace is added to overdue loans. New configurable cross-domain urgency thresholds from the broader parent roadmap are not part of this violations-records delivery.

## Change log

- 2026-11-17: Owner authorized implementation and hosting. Found the served checkout at `C:/Users/JOHN/Documents/SSL/StiOrmocLibrary-main-sync` includes the later Phase 2 release (055), which must be preserved. Added the policy-independent three-warning action function and two passing tests there; API typecheck passed. No routes, database changes or deployment yet. Awaiting the owner's count-scope, reset and fine/standing decisions requested during implementation. This is foundation work only, not a completed feature.

- 2026-11-17: Created the Phase 3 violations-records plan at the owner's request. Expanded the existing three-warning requirement into review, records, audit, permissions, migration and acceptance workflows. Preserved open school-policy decisions and the existing implementation authorization boundary. Documentation only.


## Release and verification — 2026-11-17

- Live: https://sti-ormoc-smart-library.vercel.app/librarian/fines (personnel sign-in required).
- Deployment: `dpl_3g8CruRi8a3QfVA4hSpvtwcp4cf9`, candidate `sti-ormoc-smart-library-qqag6hlsy-ssl19.vercel.app`, promoted to the canonical domain after candidate checks.
- Preserved baseline: hosted Phase 2 source `c6930743335c4ad3e2b832b21a3edf2770e0f108`. Runtime package: `C:/Users/JOHN/AppData/Local/Temp/sti-vercel-conduct-b3182573`. Existing hosted payment-preview schema-readiness protection was retained; the local-only exception was not published.
- Final full API run: 767 passed, zero failed. Full web run: 541 passed, zero failed; one subsequently added case-status regression also passed (final focused fines run: 10 passed). Typecheck and production build passed.
- Disposable PGlite verifies migration constraints, history preservation, owner scoping, three warnings without a balance/clearance write, reviewed fourth-incident fine, retries and changed-payload rejection, stale preview, independent category counts, correction/void constraints and browser-role denials.
- Disposable hosted Postgres schema verifies simultaneous saves from two librarians: one commits, one gets a stale-review conflict; next stage is correct. Three warnings and one fine recorded using synthetic fixtures only, then the exact disposable schema was removed. No public application rows were used for the acceptance fixture.
- Applied 056 individually after matching the deployed 055 checksum. All nine retained-table fingerprints matched. All three new tables have RLS and deny anon/authenticated access; new sequence access is also revoked. Next unused Postgres number 057; 054 remains separately reserved.
- Candidate and canonical health return healthy/ready with no missing tables or columns. Both private list endpoints return 401 when unsigned. Staff entry and student fines URLs return 200. Published AdminFinesPage, StudentFinesPage and ViolationsRecords assets return 200 and contain the new lifetime-warning interface.
- Native browser verified that the hosted Librarian fines URL redirects an unsigned visitor to personnel sign-in. A signed-in device/mobile workflow was not performed; no real violation or fine was created to test production.
- The initial broad parallel verification overloaded the local machine; reran with two workers. A syntax correction was verified by the complete final API run. A hosted UTF-8 build failure in the later status-display correction was fixed, rebuilt and redeployed before promotion.
- No GitHub push. Source changes remain in the existing local checkout alongside preserved unrelated work.

Current plan refines the original proposal: immutable initial category reviews and fixed owner-approved lifetime rules replace term-based counters or a new rate-policy editor. Corrections append facts rather than rewrite originals; dependent or financially linked voids require normal librarian/financial review. Existing overdue policy and lost/damage flows remain authoritative. Broader configurable urgency thresholds are still planned separately.


## Full Phase 3 completion update

The previously separate urgency work is now implemented and hosted. See [Phase 3 completion and release evidence](2026-11-17-phase3-completion.md). Migration 057 is applied, next unused 058; both conduct records and urgency settings/worklists are delivered. Earlier remaining-scope notes above are historical.
