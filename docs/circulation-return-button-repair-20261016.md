# Make the Process return action visible

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` |

## Why

The owner reports that the circulation table's Process return button appears unresponsive. Its handler selects the copy in the scan panel above the table, but neither scrolls there nor moves keyboard focus. The resulting instruction is also above the current viewport.

## How

Bring the selected physical-copy barcode field into view and focus it when a table return is requested. Show the verification instruction beside the field. Keep physical-copy verification and explicit Confirm Return as required steps; clicking a table action must not record a return. Retain the current scan-preview API, authorization and confirmation rules.

## Implementation tracking

- [x] Trace the row action and scan-panel state.
- [x] Add visible navigation and keyboard focus for the selected return.
- [x] Verify repeated selection, preview and explicit confirmation with regression tests.
- [x] Check the running browser without returning an existing loan.

## Verification

- Ten focused web tests passed across the circulation monitor, desk and new integration regression file. The integration uses the real scan input and desk with mocked APIs: the row click scrolls/focuses the correct barcode, Enter previews it, Confirm Return performs exactly one return, and reselecting the same row clears the older preview and requires verification again.
- Web TypeScript check passed.
- Running browser at `/librarian/circulation`: selected both existing table rows without verifying or confirming a real return. Each selection brought its matching barcode into the viewport and made it the active input. At a 720px viewport height, the barcode field was visible at 337–383px for the first selection and 413–459px for the second. Confirm Return remained disabled before verification. Screenshot: `output/process-return-fixed.png`.
- No existing loan, copy, fine or history was changed. Browser verification used normal personnel sign-in. No API change, migration, push or deployment was performed. Physical scanner/camera hardware and mobile devices were not tested in this focused repair.

## Change log

- 2026-10-16: Began the owner-reported return-button repair. No schema, policy, or API change is needed.
- 2026-10-16: Added explicit focus/scroll and adjacent instructions, verified repeated selection and confirmation boundaries with tests, and checked both row actions in the running browser. Repair complete locally.
- 2026-10-16: The owner requested a broader usability improvement. The subsequent [circulation redesign](circulation-usability-20261016.md) replaces the row-to-scan-panel handoff with a direct review popup and one final confirmation. This document preserves the earlier repair evidence.
