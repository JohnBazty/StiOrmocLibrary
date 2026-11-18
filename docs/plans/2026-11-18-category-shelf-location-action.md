# Classification directory: use Edit category for shelf changes

## Why

Keep category details and shelf assignment in one dialog. The owner confirmed that a separate Edit shelf location action duplicates the existing Edit category flow.

Date created: 2026-11-18  
Date last updated: 2026-11-18  
Status: built

## How

- Classification directory retains **Edit category** as the editing action. Remove the separate shelf action and its shelf-only dialog mode.
- Edit category continues to show category name, description, shelf, column, and row. It uses the existing category update transaction and assignment synchronization.
- Retain corrected guidance pointing to Category Management or Maintenance → Locations when no shelf exists. Saving requires a selected managed shelf.
- Shelf naming and lifecycle maintenance remain under Maintenance → Locations. No API or schema change.

## Implementation tracking

- [x] Owner approved removing the redundant action.
- [x] Remove the action, icon, editor state, and unused dialog option.
- [x] Update tests to edit shelf assignment through Edit category.
- [x] Focused tests: 8 passed, covering category details, shelf updates, failed saves, cancellation, valid position limits, and unavailable shelves.
- [x] Final checks passed: 728 API tests, 495 web tests, type checking, build, and diff whitespace validation.
- [ ] Browser inspection remains blocked by Computer Use's browser URL confidence check.

## Change log

- 2026-11-18: Initially added a separate shelf-only action. The initial version passed 728 API tests, 495 web tests, type checking, build, and coverage. Browser inspection was blocked before application interaction.
- 2026-11-18: Owner chose to remove the redundant action because Edit category already includes shelf assignment. Removed the shelf-only mode and adapted regression tests to the existing dialog. All eight category tests pass. Work remains local and uncommitted on `codex/category-shelf-location`; pre-existing payment changes are preserved.

- 2026-11-18: Re-ran the full test suite after removing the action: all 1,223 tests passed. Type checking and production build also passed. Browser inspection remains unavailable from the earlier URL safety block.
