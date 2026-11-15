# Compact administrative row actions

- Why: stacked actions make administrative tables tall and difficult to scan.
- Date created: 2026-11-15
- Date last updated: 2026-11-15
- Status: built

## How
Use the established Inventory native disclosure pattern for Book register, Categories and Printing queue. Each row has an Actions trigger with its record name for assistive technology. Actions keep their existing callbacks, payment/refund guards, disabled states and confirmation dialogs. Menus stay in table flow to avoid clipped actions on mobile, close on selection, outside pointer interaction and Escape, and return focus after selection/Escape. No database or dependency changes. Preserve the visible sidebar sections.

## Implementation tracking
- [x] Identify matching administrative action lists.
- [x] Add reusable disclosure and update the three matching tables.
- [x] Verify interactions, existing workflows, typecheck and production build.
- [x] Push the feature branch and verify the authorized hosted release.

## Change log
- 2026-11-15: Started owner-requested action dropdown cleanup. Existing Inventory actions already use a dropdown. Student borrowing controls remain outside this administrative change.

## Verification
- Full suite: 724 API and 488 web tests passed (1,212 total).
- Typecheck and production build passed.
- Native dropdown checked in Chrome at desktop and 390-pixel mobile viewport using the real shared component with synthetic records. Selection closes the disclosure and restores focus.
- No schema, payment logic, permissions or dependencies changed.
- Candidate and canonical live checks passed: shared RowActions chunk is used by all three administrative pages; catalog, research covers, scanner bundle, sidebar sections and authentication boundaries remain present. Authenticated production mutations were not executed.
- Web coverage run passed: 68.99% lines overall; the existing project-wide 80% target remains unmet.

## Release
- Branch: `codex/admin-row-action-dropdowns`; runtime source `4b73cceb7fda69f7dacb0dce6cd34b97cb9b4c78`.
- Live: https://sti-ormoc-smart-library.vercel.app
- Deployment: `dpl_EiuzaXArngCdzKkbbJmhrhrzcw1N`.
- Previous production rollback: `dpl_7f1CxEAc9uY5vHztP8Eer3zkm95a`.
- Main was already an ancestor; merging origin/main found no conflicts. Main itself was not changed.
- Local integration checkout received only the eight scoped files after checking for independent edits.
- 2026-11-15: Completed authorized release; native dropdown desktop/mobile checks and live asset/API checks passed. New disclosure has 100% line coverage.
