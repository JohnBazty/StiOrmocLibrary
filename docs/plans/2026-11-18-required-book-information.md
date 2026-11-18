# Missing required book information

- Why: reduce manual catalog entry without inventing facts or populating optional blanks.
- Date created: 2026-11-18
- Date last updated: 2026-11-18
- Status: built
- Queue: item 5, follows hosted shortcut dpl_FTV9BGAXZ9w9J4zsM8Vxhpyqk69S. Host before item 6.

## How

Reuse protected ISBN/title lookup providers. Show candidate source and exact values before applying to an unsaved draft. Preserve populated values, including edits during lookup. Manual book creation requires title, author, ISBN, category, managed shelf and number of copies. Only title/author/ISBN are provider-fillable; staff supplies local category/shelf/count. Holdings imports require title, author, copies, category and managed location; ISBN is optional and stays blank. Publisher/year/edition/pages/cost/funding/cover remain unchanged by the required-information action. Existing save validators remain authoritative.

Use an explicit reusable review button in manual creation and import-row editing. Valid ISBN lookup requires the provider's exact identifier. Without a valid ISBN, staff chooses a title/author candidate; never choose the first similar edition automatically. Show edition clues and preserve any conflicting existing values for human resolution. Bulk import filling only applies missing required title/author from valid ISBNs, preserving server provenance and version checks; title-only rows use the row-level reviewed candidate chooser. Find book details remains a separate explicit bibliographic research tool.

No new schema; applied 063 / next unused 064. Existing dirty source must be preserved; assemble feature-only changes on verified release staging. No operational catalog writes for acceptance.

## Implementation tracking

- [x] Read required field validators and existing ISBN/import lookup paths.
- [x] Add reusable required-field proposal/review and integrate both drafts.
- [x] Restrict automatic import fill to required fields and exact ISBN; retain version/provenance gates.
- [x] Verify preservation, provider errors, candidate ambiguity, stale responses and save validation.
- [x] Browser acceptance, type/build and tests passed.
- [x] Hosted dpl_ES3D9Qir6gsk4Hrmj1pFVMCqnAX8. Candidate/canonical health/schema, unsigned provider-route guards and compiled review/import controls verified.

## Change log

- 2026-11-18: Started after shortcut hosted. Current lookup fills optional metadata and overwrites entered manual values; explicit required-only proposal flow replaces that behavior for this action.

- 2026-11-18: Reusable proposal review integrated into manual creation and import-row drafts. Exact-ISBN batch fill now leaves optional fields blank and preserves server provenance/version guards. ChatGPT side-panel browser verified conflict warning, only missing author applied and explicit edition choices. Full web 583 passed; build/type pass. API suite and hosting gates underway.

- 2026-11-18: Full API 811 passed, full web 583 passed. Latest focused API seven passed, including mismatched ISBN, conflicting existing facts, markup, optional blanks and version-protected concurrent edits. Feature-only staged frontend fourteen passed and production build passed. Final candidate additionally skips batch conflicts for explicit row review. No catalog records changed by testing.

- 2026-11-18: Final candidate promoted and canonical checks passed. No schema change or catalog mutation. Proceed to queue item 6.
