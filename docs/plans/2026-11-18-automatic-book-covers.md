# Automatic book covers

- Why: attach an ISBN-matched cover to an unsaved manual book entry, with an explicit retry control.
- Date created: 2026-11-18
- Date last updated: 2026-11-18
- Status: built
- Queue: item 6, follows hosted required-field release dpl_ES3D9Qir6gsk4Hrmj1pFVMCqnAX8. Host before stocktake.

## How

Extend the existing protected cover service and selected-file preview. Google Books exact ISBN match first; Open Library ISBN cover fallback. Bound time, redirects, content type, signature and streamed bytes. Never accept arbitrary client URLs. Find cover automatically only changes the cover draft. Valid ISBN entry starts the existing debounced lookup and cover preview; even missing bibliographic metadata can try its cover. Manual uploads win; changing ISBN invalidates old pending results; removal stays removed until retry or another ISBN. Existing catalog titles retain their canonical cover rather than replacing it while adding copies. Final Save persists the reviewed image through existing storage/validation.

No schema migration. Latest applied 063, next unused 064. Sources: https://developers.google.com/books/docs/v1/reference/volumes and https://openlibrary.org/dev/docs/api/covers (Open Library documentation fetch timed out; existing adapter plus response tests remain the verified contract).

## Implementation tracking

- [x] Read existing provider/image/preview/save contracts.
- [x] Add explicit lookup/loading/failure/retry behavior and stale-response protection.
- [x] Enforce provider order, bounded download and redirect allowlist.
- [x] Verify manual-cover priority, ISBN change/removal races, optional-field preservation and image rejection.
- [x] ChatGPT side-panel browser verified valid ISBN preview, filename/size and explicit retry. Full web 586 passed, provider API 16 passed, production/type builds passed.
- [x] Hosted dpl_C3a3q3KhNxtt77hPvoA8EgCD34V8; candidate/canonical health/schema, protected cover endpoint and compiled button/canonical-cover guard verified.

## Change log

- 2026-11-18: Started after item 5 hosting. Existing automatic cover path is already present; extend it without replacing canonical existing-title images or entered metadata.

- 2026-11-18: Implemented cover retry/loading/missing-result controls, manual-cover priority, invalidation on ISBN edit/removal/unmount, and save guard while lookup is processing. Google-first image retrieval now validates redirect hosts and streamed byte limits. No real catalog writes during synthetic browser acceptance. Hosting gate underway.

- 2026-11-18: Staged 22 API provider/route/permission tests and production build passed. Final canonical-cover guard added; focused frontend 13 passed again. Feature hosted before stocktake. No real catalog writes.
