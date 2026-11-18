# Student QR roster replaces User archive

- **Why:** The owner requested a dedicated page showing students and their QR codes from the enrollment roster, replacing User archive.
- **Date created:** 2026-11-18
- **Date last updated:** 2026-11-18
- **Status:** built

## How

Admin and Librarian navigation opens Student QR roster. The previous User archive URL redirects there. Library users retains status filters and account records for deactivated and archived accounts. Notifications link to Library users.

The new page selects a semester, searches by student name or ID, and displays 24 QR cards per page with downloads. It includes all effective roster rows, including students without accounts. QR images are reconstructed from existing active credentials with a verified secret hash; no QR is issued by viewing this page. Students without accounts are labelled Registration needed. Inactive accounts and ended semesters do not expose usable passes. Accounts that have not prepared a pass are instructed to open their personal QR page.

Every successful roster upload replaces QR credentials, including an identical file. Complete and partial imports both refresh codes for registered active students in the resulting roster. Earlier students listed in that semester have credentials revoked. Re-importing an identical file retains the existing roster records while refreshing credentials. Rejected uploads roll back, retaining the previous roster and QR codes. Rotation uses the existing credential version, public ID, and secret hash, inside the import transaction. This supersedes the earlier permanent-QR wording only across roster uploads; sign-ins and services still reuse the current QR.

Both new read endpoints require current accounts.manage authority and return private, no-store responses. QR payloads and secret hashes are not included as JSON fields; images contain the existing opaque scanner credential. There are no schema changes, migrations, live imports, database backfills, or deployments. Tracker remains applied 040, reserved 039, next unused 041.

## Implementation tracking

- [x] Replace archive screen and navigation; preserve account history access.
- [x] Add searchable semester QR cards and individual downloads.
- [x] Refresh credentials on every successful upload, including duplicates.
- [x] Explain replacement before importing and after success.
- [x] Tests first: missing page/service tests failed before implementation.
- [x] Tests cover identical-file refresh, no duplicate students, read-only display, old QR rejection, and replacement acceptance.
- [x] Complete checks and browser layout verification.

## Verification

Type checking and production build pass. Initial full tests and coverage encounter nine circulation fixture failures when the local enrollment feature flag is enabled: `Unexpected SQL: SELECT started FROM enrollment_lifecycle WHERE id=1`. Running with `ENROLLMENT_ROSTER_ENABLED=false` in the test process passes the full API suite (521 tests) and web suite (91 files / 385 tests), and completes coverage successfully. The new enrollment tests explicitly enable enrollment in their mocked service scope. The final targeted API run passes all five feature tests, including authorization refusal, read-only roster display, identical-file replacement without duplicate students, and rejection of old QR codes after successive replacements.

Browser checks used a local Vite preview with six fictional roster cards and fixture-only fetch responses. Desktop (1280px) and mobile (390px) layouts were visually checked, including readable QR cards and download controls. No real student data or live import was used. Full-size live import throughput and scanner hardware acceptance remain untested. Existing production build warnings about chunks above 500 kB remain.

Implementation tracking was checked against the final diff as a separate verification step. Tests are covered by the existing workspace test globs. No migration files or tracker numbers changed. Permission checks, parameterized SQL, private responses, credential hash verification, and transactional replacement were reviewed; no unresolved security or correctness findings were identified in the scoped review.

Reproduce the passing isolated test runs in PowerShell without changing any environment file:

```powershell
$env:ENROLLMENT_ROSTER_ENABLED = 'false'
npm test
npm run coverage
npm run typecheck
npm run build
```

## Change log

- 2026-11-18: Owner requested replacement of User archive with Student QR roster.
- 2026-11-18: Owner added QR replacement on roster upload and explicitly clarified that identical-file uploads must also generate new QR codes.
- 2026-11-18: Implemented using existing schema and credentials; checks and fixture-based desktop/mobile verification completed. Configured Ethan wiki paths are absent on this computer, so no wiki mutation was attempted.

## Production release — 2026-11-18

Owner authorized pushing the dedicated branch and hosting the change live. Feature commit `1abc755` was pushed to `origin/feat/student-qr-roster`. Release preparation detected a concurrent production change and refreshed the baseline before promotion. The final release preserves live Faculty enrollment, late-enrollment review, grouped navigation, shelf-capacity changes and route error boundaries. Student-only credential replacement also covers the live duplicate complete-roster early return. Credential issuance retains the checked rotation/race handling while preserving the live inactive-return scanner option.

Combined release validation passed type checking, production build, 19 API tests (QR credentials, roster and Faculty enrollment), and 19 web tests (QR roster, enrollment, users and navigation). Candidate API health reported healthy and schema ready; anonymous QR roster access returned HTTP 401.

Deployment `dpl_FXHfzuC8JxrhvPUeNUzdzw124ie8` was promoted to https://sti-ormoc-smart-library.vercel.app. Final live checks: health HTTP 200 / healthy, Admin and Librarian QR page URLs HTTP 200, protected QR-semesters API HTTP 401, and the lazy-loaded QR page asset contains the replacement notice. No live roster upload, credential rotation, schema migration, or student-data write was performed during release verification. Authenticated production QR rendering and physical scanning remain human acceptance checks.

Source provenance and exact production integration changes are recorded in `docs/releases/2026-11-18-student-qr-roster-source.json` and `docs/releases/2026-11-18-student-qr-roster-production.patch`. The current live baseline includes unrelated releases beyond local main; the patch makes the deployed integration reproducible without importing those unrelated changes into this feature branch.
