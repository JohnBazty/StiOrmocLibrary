# Revision Phase 2 — Enrollment validation and registrar imports

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `inprogress` |

## Why
The owner authorized the previously deferred Revision Phase 2 from Revisions.pdf: use official semester enrollment evidence for Student registration and continued borrowing eligibility, with reviewed account changes and retained history.

## Confirmed scope and pending inputs
- Reuse academic_terms, custom account registration/email verification/approval, account lifecycle events and the current borrowing services.
- Users retain control of personal details. The owner previously approved reviewed registrar updates to official program/year/borrowing fields. School ID and email stay fixed.
- Supplied workbook: `C:/Users/JOHN/Downloads/ENROLLMENT-LIST-26-27-1ST-SEM-2.xlsx`. Read only; do not commit or import actual student records during development.
- The Student_Information sheet provides Student ID, Last Name, Suffix, First Name, Middle Name, Sex, Program, Level and Campus Email Address. It provides no enrollment status, section or explicit term/date columns.
- Pending owner confirmation: whether all listed rows are officially enrolled, whether this is a complete school roster, official semester dates, and the continued-borrowing policy for unmatched students.
- Keep existing accounts and temporary active-account borrowing policy working while those inputs are unresolved. Never derive enrollment or term dates solely from a filename.

## How
1. Recognize the supplied registrar layout automatically. Preserve leading-zero school IDs; map only fields needed by library enrollment. Ignore sex and other unused personal fields.
2. Provide upload, preview, row-level errors and explicit confirmation. Recognize split names, program and year automatically; ambiguous numeric IDs, duplicates, missing fields and unknown status meanings require review. Files without statuses require an explicit registrar-enrolled declaration; partial files never imply non-enrollment for omitted IDs.
3. Add private versioned import batches and immutable approved rows, reusing academic terms. Record source fingerprint, scope, as-of date, actor and time. Reimports are idempotent. No real roster is imported as a development seed.
4. Provide a Librarian-only Enrollment page for term setup, roster previews and semester review. Staff and borrowers cannot access roster contents. Official account-field changes and activation/deactivation require a clear reviewed selection, with before/after audit and session invalidation for status changes.
5. Recheck approved current-term evidence on Student registration and account approval, and on new requests/checkout once the approved enrollment policy is activated. Faculty follows its current approval workflow. Returns and retained account history remain accessible.
6. Validate parser, private routes, import rollback/idempotence, wrong/stale/partial terms, account-history preservation and enrollment gates in disposable fixtures. Apply any additive schema only after isolated acceptance and private backup.

## Implementation tracking
- [x] Read revision, repository authority, existing registration/lifecycle/academic-term contracts and supplied roster layout.
- [ ] Confirm enrollment declaration, roster completeness, term dates and borrowing-policy decision.
- [ ] Build and test the registrar-file recognition/validation layer.
- [ ] Build private staging/import and term management.
- [ ] Build reviewed account changes and registration/circulation gates.
- [ ] Build nontechnical Librarian UI and verify role/direct-URL/API boundaries.
- [ ] Record isolated acceptance, migration status, runtime verification and remaining activation inputs.

## Migration tracker
Applied Postgres 027; next unused 028. MySQL rollback reference 048; next 049. No Phase 2 migration applied yet.

## Change log
- 2026-10-16: Owner started Revision Phase 2 and supplied the registrar workbook. Inspected the file read-only and requested the missing enrollment declaration, completeness, dates and borrowing policy before dependent behavior changes. Began independent recognition and validation work.

## Runtime checkpoint — owner requested running the project

The owner confirmed every listed student is enrolled and the file is the complete SY 2026–2027, first-semester roster. Students without confirmed enrollment should be blocked from new borrowing while retaining account/history/return access. Exact semester dates are not available; support manual selection without inventing December dates.

Phase 2 is unfinished. Parser, private service/routes and migration 028 are drafts; 028 has not been applied. Runtime enrollment hooks were removed from the active registration/circulation paths so the current project can run against applied schema 027. Their draft copies are saved under ignored `output/phase2-inprogress-runtime-hooks/` for selective reintegration after completing review, UI and isolated acceptance. No real roster has been imported and no enrollment/account status changed. Next work includes integration, lock-order review, input/status normalization, partial/stale import tests, nontechnical UI, and controlled migration/activation. This checkpoint is not a Phase 2 completion claim.
