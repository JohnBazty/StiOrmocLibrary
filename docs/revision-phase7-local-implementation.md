# Revision Phase 7 — Collection review and requirements

**Why:** Identify aging books, preserve review decisions, and compare mapped holdings with traceable school-approved requirements.

**Date created:** 2026-10-12  
**Date last updated:** 2026-10-12  
**Status:** `built`

## How

- Owner-approved school year 2026–2027 uses its starting year, 2026. Copyright age >= 5 is Outdated — review required; missing/future evidence needs verification. No availability, loan, or archive changes occur from a review flag or recommendation.
- Immutable year approvals, requirement versions, and review decisions retain actor and evidence snapshots. Librarian controls configuration; Staff and borrower roles cannot access review APIs or direct pages.
- Recalculate after catalog metadata/import changes and in the durable minute worker. Deduplicated notices record threshold crossings and approved shortfalls. Reports read one consistent snapshot.
- Full book collection partitions into Updated and Exclusions, retaining archived/unheld titles and all physical-copy counts. Age-based reports are not CHED compliance certificates. Existing research/inventory exports remain available.
- Approved electronic eligibility captures the mapped file IDs checked by the Librarian. Later uploads do not silently enter an approved criterion; approve a new version after checking their license evidence. Title relevance/mapping changes are maintained by the Librarian in Maintenance.
- Collection PDF exports embed bundled Noto Sans regular/bold (SIL Open Font License) for accented and Cyrillic authors. Other reports retain their current font unless explicitly opted in. Source: https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans; license retained beside the fonts.

## Official source research — checked 2026-10-12

- [CHED CMO No. 22, s. 2021](https://legacy.ched.gov.ph/wp-content/uploads/CMO-No.-22-s.-2021.pdf), Section 4(b)(4), printed page 4: five relevant book titles per undergraduate major subject, published within the preceding five years, combining print and purchased electronic holdings. Some subjects may qualify for a recency waiver. This is subject-based, not five books for a whole program. Section 4(a)(5–6) also requires collection evaluation and weeding. Institutional totals and journals are separate requirements outside this book-only check.
- [CHED CMO No. 25, s. 2015](https://legacy.ched.gov.ph/wp-content/uploads/2017/10/CMO-no.-25-s.-2015.pdf), Section 15.2.1: computing programs have subject-level distinct-title, recent-publication, and student-to-volume criteria. This older program issuance needs school confirmation alongside the later general issuance; the app does not resolve their applicability automatically.
- [CHED CMO No. 62, s. 2017](https://ched.gov.ph/wp-content/uploads/2018/03/CMO-62-BS-Hospitality-Tourism-Management.pdf), Section 19: tourism/hospitality library holdings refer to general CHED library requirements; journal requirements are separate. No invented whole-program book minimum is assigned.
- [Official 2021 CHED index](https://legacy.ched.gov.ph/2021-ched-memorandum-orders/) confirms CMO 22. Later consultation/review evidence does not itself establish a superseding order. School applicability, approved major-course roster, licensed electronic holdings, and mappings still require verification.
- Template interpretation of five calendar publication years at reference 2026 is 2022–2026 (maximum age 4). The Librarian confirms or adjusts the window in a versioned criterion. Publication year and copyright year remain separate. No source is automatically activated for a program/course.

## Implementation tracking

- [x] Confirm owner reference year and research official CHED sources.
- [x] Add backward-safe Postgres 026 and isolated acceptance.
- [x] Add collection review, decisions, requirement versions and deduplicated notices.
- [x] Add responsive Librarian review/configuration and CSV/PDF reports.
- [x] Verify permissions, age/count boundaries, preserved records, local startup and build.

## Change log

- 2026-10-12: Owner authorized Phase 7 and chose starting year 2026. Researched official sources instead of requiring an attachment. Numeric templates remain pending school approval and mapping verification.
- 2026-10-12: Applied reviewed 026 individually after snapshot `revision_phase7_backup_20261012`. Existing accounts, catalog/metadata, copies, loans, requests and in-library usage compare identically to the snapshot. Added append-only approval/recommendation guards and RLS; active MySQL reference remains 048/next 049. Next unused Postgres 027.
- 2026-10-12: Completed isolated concurrency/year/approval/counting/preservation acceptance, role-denied route checks, 338 API tests and 152 web tests. Typecheck/build and live authenticated review/export endpoints pass. All six CSV/PDF exports verified, CSV integrity checked, PDFs rendered and Unicode author extraction confirmed. Local server restarted; no Git push or deployment performed.

## Verification and limits

- Open **Librarian → Collection review** for review, requirement versions, reporting-year approvals and notices; **Reports** for Full, Updated and Exclusions exports. Library notifications also contain threshold/shortfall notices. Staff, Student, Faculty and recovery Admin cannot access these pages/APIs.
- Current real catalog: 14 book records, all with missing copyright metadata, so Updated contains zero and Exclusions contains 14. Publication years are preserved separately and are never substituted for copyright evidence. Maintenance → Catalog information can record verified copyright and program/course links.
- No real program/course requirement has been activated. The researched source template is available; school confirmation, professional-course roster, relevant mappings and licensed electronic evidence must be entered before a scope can show an approved shortfall or meet a configured criterion. This feature does not certify institution-wide CHED compliance or evaluate journals/enrollment ratios.
- Isolated acceptance also verifies that later unreviewed digital uploads cannot inflate an approved criterion, and that approval/decision history cannot be overwritten or deleted. Refresh batches cache/notice writes so it does not issue one database update per holding every minute.
- The existing production build bundle-size warning remains. UI behavior is covered by component tests; authenticated live review/export APIs and the public browser were checked without changing login credentials or injecting a browser session.
