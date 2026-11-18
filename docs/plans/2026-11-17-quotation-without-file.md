# Record supplier quotations without a file

- Why: the owner requested removal of the Supplier quotation file field and its validation.
- Date created: 2026-11-17
- Date last updated: 2026-11-17
- Status: built — hosted and verified
- Branch: fix/quotation-without-file
- Authorization: remove the field and file requirement, including necessary API/schema changes and hosting under the continuing release authorization. No GitHub push.

## How

Save a quotation's replacement amount through the existing Librarian-only endpoint using JSON. Remove the chooser, file preview, upload dependency and file validations from creation. Keep valid positive money, active-book, role and CSRF checks. Preserve earlier quotation history, private attachments and their authenticated downloads. Do not create fake filenames or storage objects for new quotations.

Additive migration 059 permits null storage_path, original_name and mime_type; existing values, foreign keys, amount checks, uniqueness and access rules remain unchanged. Applied baseline is now 059; next unused is 060. Lost-book assessments continue reading the latest quotation amount and keep their review/payment rules.

## Implementation tracking

- [x] Trace UI, API, storage constraints and lost-book consumers.
- [x] Regression tests and real-SQL preservation checks.
- [x] Implement amount-only creation and retain historical downloads.
- [x] Tests, typecheck, build, review and browser verification.
- [x] Apply reviewed migration, host and verify.

## Change log

- 2026-11-17: Owner supplied the file-field screenshot and requested removal of the field and its validation. Amount validation remains in scope for preservation.

## Verification and release

- API: all 788 tests passed. Three focused UI tests passed: save amount without a chooser, retain old attachment downloads, and unchanged digital-book preview permissions. Typecheck and production build passed.
- Browser: actual modal rendered through a local synthetic harness; no file chooser, amount 250.50 saved and appeared as the current quotation. No production quotation or financial record was created. Temporary harness archived under ignored output.
- Database: applied only 059; fingerprints of 12 tables, quotation RLS and grants were identical before/after. Prior 058 source restored byte-for-byte from the hosted release to match its existing ledger checksum fc541fd10859e3cbb81973cda2920f4d766c4e57ae5ed06ffda8a177239fb1b5; 058 was not reapplied. New 059 SHA256: ad746f2b248c4aef3738c07511757e1098014ece4f5fc60d957e3ff1ab2bf75f.
- Release candidate: dpl_JDLqw16qGjPdF3XHyWgEQCkgC17o; health healthy/schema ready, unauthenticated quotation POST rejected with JWT_REQUIRED. Source manifest: docs/releases/2026-11-17-quotation-source.json. Existing sign-in fix and hosted payment readiness preserved; unrelated Phase 4 changes excluded by applying only wording edits to clearance release files.
- Local API restarted from main-sync with existing original configuration, without copying credentials. No new dependencies, GitHub push, or unrelated commit. Existing dirty work preserved. Full frontend suite and canonical promotion evidence follow below.
- Wiki handoff (configured vault unavailable): quotation file requirement removed; Postgres 059 applied, next060; existing attachments preserved.

## Hosted completion

- Full frontend suite: 127 files / 561 tests passed (thread pool, two workers). Initial fork run stalled and was stopped; the complete replacement run passed in 116.87 seconds. API 788/788, typecheck and production build passed.
- Promoted dpl_JDLqw16qGjPdF3XHyWgEQCkgC17o to https://sti-ormoc-smart-library.vercel.app. Canonical health200, healthy/schema ready; unauthenticated quotation POST401 JWT_REQUIRED. The publicly served CatalogManagementPage-Cinpu-c4.js has the amount-only message and Save quotation, without the old Supplier quotation file label. Entry asset index-Cr83Opur.js.
- Production authenticated saving was not exercised with real school data; amount-only SQL creation and historical download behavior were verified in the isolated regression test, and the actual modal was exercised with synthetic local state. No further required implementation work remains.
