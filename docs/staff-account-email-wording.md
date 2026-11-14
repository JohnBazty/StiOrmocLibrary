# Staff account email wording

Date created: 2026-11-14
Date last updated: 2026-11-14
Status: built

## Why

The owner requested clearer school identification in the Staff account setup form.

## How

Use the label “STI Ormoc school email” and the helper “Use your @ormoc.sti.edu.ph email address.” Associate the helper with the email input using aria-describedby. Update the introductory wording consistently. Validation, account creation and permissions stay unchanged. This affects the shared Librarian/System Administrator form in the integration copy only.

## Implementation tracking

- [x] Update the label, introduction and accessible email helper.
- [x] Update the existing form test's label lookup; focused tests pass (2 tests).
- [x] Root tests (508 API and 329 frontend), type checks and build pass. Tests used the documented process-only WEB_ORIGIN=http://localhost:5173 override. Existing large-bundle build warning remains. Browser layout was not rechecked for this wording-only change; coverage was not rerun.

## Change log

- 2026-11-14: Owner approved the exact label and helper before implementation. No API, schema or catalog/account data changes.
