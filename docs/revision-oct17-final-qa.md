# October 17 revisions — final technical QA

| Field | Value |
| --- | --- |
| Why | Finish implementation and permitted browser verification for the approved October 17 scope. |
| Date created | October 22, 2026 |
| Date last updated | October 22, 2026 |
| Status | `built` — implementation and technical QA complete; human usability acceptance is recorded separately and is not claimed. |
| Scope | Phases 1 and 3–8. Phase 2 Dewey, CSV-only uploads and extra Personal Details fields remain deferred. |

## Completed implementation

The earlier phase records describe the built functionality. This pass completed the previously blocked browser checks and repaired defects exposed by retry, identity and keyboard testing. No additional migration was needed; applied Postgres 030 retains SHA-256 `ae78a0c5edaa666a70f145b0d9ed342cb7850bfe719663b92885b28b44e5ea32`. Next unused migration remains 031; enrollment 028 remains unapplied.

### Repairs and regression evidence

1. **Historical customer identity:** preview now resolves an optional Student/Faculty ID and shows the stored name before confirmation. Save uses the same identity. A mistyped name cannot evade duplicate detection or be silently replaced only after review.
2. **Older exact duplicates:** exact matches sort ahead of the ten similar-entry warnings. Eleven newer distinct entries cannot hide an older duplicate. Matching also recognizes the linked user ID after a name change.
3. **Interrupted stock saves:** item, category and movement forms keep one submission key throughout review/back/retry. A retry cannot become a second successful operation merely because the Librarian reopened review.
4. **Book-detail keyboard access:** the public catalog drawer now uses the existing native-dialog approach. The browser traps focus, makes the background inert, closes on Escape and restores focus to the originating book button. Live availability updates do not remount the dialog.
5. **Accurate error messages:** a failed save no longer changes a successfully loaded empty list into a false loading-failure message. Historical printing, supply details and maintained stock track list-loading failure separately.
6. **Readability and orientation:** new review/history supporting labels have readable dark-theme colors. Paper review shows paper fields and units; ink review shows ink fields. Every print-supply section retains the page heading.

The isolated database verifier contains the canonical-name and older-than-ten duplicate cases. Existing stock UI tests cover the stable retry key and absence of a fabricated loading error. Catalog tests cover native cancel cleanup; actual focus behavior was verified in the browser rather than inferred from jsdom.

## Verification results

| Check | Result |
| --- | --- |
| API suite | **415 passed, 0 failed**. |
| Web suite | **286 passed in 76 files, 0 failed**. |
| API/web production build | Passed. Existing large frontend bundle advisory remains. |
| API/web type checks | Passed. |
| Remaining-phase Postgres acceptance | Passed against the actual migration in a disposable schema; exact-schema cleanup completed and original public business-record fingerprints matched. |
| Earlier isolated Phase 1/3/4 checks | Passed in the preceding delivery; their evidence remains in the corresponding phase records. |
| Applied migration integrity | 030 checksum unchanged. No migration replay or new migration in this pass. |
| Browser sign-in | Existing Librarian login succeeded through `/staff`; no password reset. |
| Public catalog | Live title search, available copies, detail opening, modal focus, Escape and return focus verified. |
| Reports | Live applied search, empty result, disabled stale downloads, filtered PDF download and mobile local-table scrolling verified. |
| Printing history | Actual form, optional details, Philippine service date, read-only review and focused review heading verified. The example was not saved to school records. |
| Supply details | Existing supplies loaded; paper dimensions and review verified without saving. Light/dark and mobile screens inspected. |
| Maintained stock | Real components exercised with browser-only data: review, interrupted save, back/retry, one item, restock, archive/restore and retained history. No mock mutation reached the API. |
| Cleanup | Temporary web HTML/TSX and fixture tab removed. No fixture account or browser auth bypass was installed. Downloaded empty report moved to ignored evidence. |

Browser checks used the permitted in-app browser. Desktop screens and an explicit **390 × 844** mobile viewport were inspected. The report table was 1,327 px wide within a 314 px scrolling region; the mobile page itself did not overflow. Stock mobile content likewise stayed within the viewport. These are responsive browser checks, not physical phone certification.

### Local evidence

- Suite/build/type logs: `output/oct17-final-api-tests.txt`, `oct17-final-web-tests.txt`, `oct17-final-build.txt`, `oct17-final-typecheck.txt`.
- Browser screenshots and the downloaded filtered empty PDF: `output/oct17-final-qa/`.
- Isolated database evidence: `output/oct17-remaining/acceptance.json`; prior migration before/after fingerprints remain alongside it.
- Prior filtered, multipage, empty and Unicode PDF evidence: `output/oct17-phase4/`.

Evidence is ignored local output. Stock screenshots are explicitly labelled disposable UI tests. Report browser reads used the actual authorized Librarian account; no real lending, payment, supply or historical-print transaction was submitted. Normal sign-in creates its ordinary authentication session. Existing credentials were not changed.

## Human acceptance and practical limits

All approved code is implemented and technical checks are complete. The owner has not yet supplied an unaided Librarian trial or usability sign-off. The overall revision plan therefore retains `inprogress` for that acceptance gate; this is not outstanding implementation or a disabled-browser blocker.

For the trial, ask the Librarian to find/export a filtered report, review a past printing entry, edit supply specifications and maintain a sale item. Use authorized disposable records if saving; report confusing labels or steps. Human acceptance must be recorded as the person's actual feedback, not inferred from automated or agent browser checks.

Real scanner/printer hardware, real Student/Faculty email OTP delivery, campus-scale traffic and every physical phone model were not retested in this pass. Existing auth, cart, reservation, handover, return and role regressions are covered by the automated suites and earlier isolated checks. No deployment or push was performed.

## Change log

- **October 22, 2026:** Browser access became available. Completed the technical delivery, reproduced/repaired retry and identity defects, verified native-dialog keyboard behavior and responsive screens, removed disposable fixtures and retained honest human/device limits.
