# Edit ink types and paper sizes

- Why: provide visible editing beside each existing printing supply.
- Date created: 2026-11-18
- Date last updated: 2026-11-18
- Status: built

## How

The stock cards have Show ink type and Show paper size dropdowns. Each dropdown filters its stock list and includes a management group for adding or editing definitions. Stock rows retain usage, restocking and Delete; editing is opened only from the dropdowns. The separate paper definition list no longer offers Delete.

Ink editing updates the reusable color/type choice and matching active stock labels in a Librarian-only transaction, retaining bottle balances, purchase costs, movement evidence and before/after audit rows. Original names detect stale edits and duplicate definitions are rejected.

Paper editing permits name and dimension changes. Existing version checks and row locks protect edits. Renaming is blocked while unfinished jobs refer to the old name; completed/cancelled job and receipt snapshots remain unchanged. Current pricing keys and supply details follow the new name in the same transaction. Size IDs, brand stocks, quantities and existing billed amounts remain unchanged.

No migration. Current applied Postgres 065; next unused 066. Owner explicitly requested hosting after implementation. Use a verified current production source snapshot plus only these changes, preserving unrelated local work. No real supply changes during verification.

## Implementation tracking

- [x] Reproduce missing row editing with failing tests.
- [x] Add protected ink edit and direct paper editing.
- [x] Complete regression, type/build and coverage checks; browser verification attempted with limitations below.
- [x] Publish verified update and check live health and guards.

## Change log

- 2026-11-18: Started owner-requested editing and hosting. Screenshot matched main-sync checkout; original workspace contains an older release. Existing edit-details metadata did not edit operational ink identity.

- 2026-11-18: Hosted dpl_75AHy9wES2mroVNdV1vLyfjBcVCs over dpl_UvnhnZLoUZFaxJdPQzT92MnVN5R3. Candidate and canonical health/schema passed; unsigned ink PATCH and paper definition GET return 401. The canonical route bundle contains both direct edit controls and the new ink review form. Cross-platform generated asset filenames differ; verified the live route-map asset directly rather than comparing Windows build filenames.
- Verification: all 829 API tests passed with the test-only environment and concurrency two. All 20 supply-page tests passed, including failed-save retry/draft retention and direct paper dimension editing. Focused real-Postgres tests and API coverage passed; ink-stock service line coverage is 100%. Focused web coverage is 88.37% lines (ink editor 93.75%). Type checks, source build, staged build and Vercel build passed. Initial parallel build exhausted local memory; controlled rerun passed. Full web regression subsequently passed: 139 files and 616 tests.
- Visual limitation: native browser inspection timed out; the in-app localhost attempt failed, and the isolated synthetic dialog preview also timed out. No real supplies, quantities or prices were changed during acceptance. No migrations, Git commits or pushes. Ethan's wiki path is absent on this host, so repository documentation records the result.

- 2026-11-18: Final full web regression passed: 616 tests across 139 files. All 829 API tests passed. Release complete; manual visual acceptance remains unverified because browser tooling timed out.

- 2026-11-18 owner correction: replace row Edit controls with a Show ink type filter and management options inside both dropdowns. Edit reusable ink definitions and matching live labels; allow paper name and dimension edits. Delete stays only on stock rows. Paper renaming is transactionally blocked while unfinished jobs use that name, preserves completed job/receipt names and billed amounts, updates current pricing keys and retains the existing size audit. No schema change or migration. Previous deployed behavior above is superseded by this correction. Verification and hosting are in progress.

- 2026-11-18 correction verification: all 848 API tests and 637 web tests passed. The 21 supply UI tests cover dropdown-based editing, ink filtering, absence of stock-row Edit, failed-save retry and Delete only in stock. Real-Postgres tests cover name conflicts, stale ink edits, role denials, unfinished-job rename rejection, preserved completed names, current pricing resolution and unchanged balances. Type checks, source build and staged builds passed. Focused API coverage reports 100% lines for the ink-definition and paper-size services; focused UI coverage passed.
- Deployment baseline changed to the stocktake release dpl_C9ZmEpfzNFp5zSWGryFRKpfT1zBt while the first candidate was building. The baseline guard stopped promotion. Rebased onto its verified clean source, preserving all 14 stocktake source files and overlaying only eight printing runtime files. Final candidate is dpl_7WBBZRooGHzhq8UWpk1wzRCLnpVw; verification is pending.

- 2026-11-18: Final candidate dpl_7WBBZRooGHzhq8UWpk1wzRCLnpVw passed candidate health/schema and protected definition-route checks. The canonical baseline guard matched the stocktake release before promotion. Promoted and verified canonical health/schema, 401 responses for both unsigned definition PATCH routes, the live dropdown-management bundle, editable paper names and absence of stock-row Edit size. Release complete. No real supply edits, migrations, Git commits or pushes.
- Visual acceptance remains limited: Chrome's old page was visible, but its sign-in session expired during reload. A hard reload reached the current personnel login. The saved-credential login click could not be completed because native geometry was unavailable. No actual editing or saving was attempted in the live browser. Automated interaction and isolated database acceptance passed.
