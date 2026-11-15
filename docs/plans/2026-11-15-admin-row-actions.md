# Compact administrative row actions

- Why: stacked actions make administrative tables tall and difficult to scan.
- Date created: 2026-11-15
- Date last updated: 2026-11-15
- Status: inprogress

## How
Use the established Inventory native disclosure pattern for Book register, Categories and Printing queue. Each row has an Actions trigger with its record name for assistive technology. Actions keep their existing callbacks, payment/refund guards, disabled states and confirmation dialogs. Menus stay in table flow to avoid clipped actions on mobile, close on selection, outside pointer interaction and Escape, and return focus after selection/Escape. No database or dependency changes. Preserve the visible sidebar sections.

## Implementation tracking
- [x] Identify matching administrative action lists.
- [x] Add reusable disclosure and update the three matching tables.
- [x] Verify interactions, existing workflows, typecheck and production build.
- [ ] Push the feature branch and verify the authorized hosted release.

## Change log
- 2026-11-15: Started owner-requested action dropdown cleanup. Existing Inventory actions already use a dropdown. Student borrowing controls remain outside this administrative change.

## Verification
- Full suite: 724 API and 488 web tests passed (1,212 total).
- Typecheck and production build passed.
- Native dropdown checked in Chrome at desktop and 390-pixel mobile viewport using the real shared component with synthetic records. Selection closes the disclosure and restores focus.
- No schema, payment logic, permissions or dependencies changed.
- Production deployment pending below; authenticated production actions have not been executed.
