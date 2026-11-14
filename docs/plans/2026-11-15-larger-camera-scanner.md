# Larger camera scanners

Why: the owner cannot position QR codes and copy barcodes reliably in the small camera UI.
Date created: 2026-11-15
Date last updated: 2026-11-15
Status: built

## How

Borrow & return opens a dedicated native camera dialog up to 896px wide, almost
the full mobile viewport, instead of the small inline camera pane. Attendance
uses the same wider maximum and a larger active preview. Scan guides use actual
video dimensions: QR stays square; copy barcodes use a wide guide. Both fit narrow
views with a margin and grow on larger screens. Video remains uncropped.
Add obvious stop/close controls and stop the stream after decoding. Ignore repeat
frames and late callbacks after cancellation. Preserve borrower QR identification,
physical-copy barcodes, manual input, saved-image preview, purpose/entry handoff,
and explicit checkout/return confirmation. No schema or dependency changes.

Final Draft pages 7/18 and Administrative System Flow page 1 retain QR identity,
barcode circulation and manual input. The cancelled barcode-only edit was fully
reverted before this branch. Latest applied migration 045; next unused 046.

## Implementation tracking

- [x] Larger responsive scanner surfaces and fitting guides.
- [x] QR/barcode sizing, close/release and duplicate-frame regression checks.
- [x] Full tests, typecheck, build and coverage.
- [x] Local synchronization, owner-authorized GitHub push and Vercel deployment.

## Change log

- 2026-11-15: owner requested larger cameras, then authorized hosting and GitHub publication after completion. Scope is camera presentation and lifecycle only; borrower QR and attendance remain intact.
- 2026-11-15: 723 API and 476 web tests passed (1,199 total), including mobile/desktop guide sizing, QR and barcode camera dialogs, stop/release and repeated-frame rejection. Typecheck and final build passed. Full coverage passed: API lines 75.21%; web lines 68.83% (statements 61.68%); repository-wide coverage remains below 80%. Initial UI check exposed a missing jsdom scroll method; optional scrolling and fresh full verification resolved it.
- 2026-11-15: synced scoped files into the existing local integration checkout without changing independent edits. Combined source review covered modal focus/escape, close and late-callback cleanup, input/image/manual compatibility, responsive geometry and existing confirmation boundaries. No API, dependency, database or migration source changed. Latest remote main is already an ancestor; no merge conflict. Source/package search contains no mysql/dbDriver references. A new authenticated visual/physical camera run was not performed; the earlier Computer Use session was stopped with physical Escape. No actual attendance, checkout, return or payment was submitted during QA. Publication follows these checks.

## Publication — 2026-11-15 (Asia/Manila)

Pushed source commit `61a89bc` to `codex/larger-camera-scanner`. GitHub main was
already included and was not changed. Vercel built a clean archive of that commit,
excluding private configuration, uploads and local output. Candidate health and
catalog returned 200; attendance/payment APIs required authentication (401).
Verified the larger attendance preview, dedicated circulation camera dialog and
uncropped video styles in the deployed bundles.

Promoted `dpl_4cHD5PuZh7quhG5uYGx8Am2gfxsx` to
https://sti-ormoc-smart-library.vercel.app. Rechecked production target, public
health/catalog, protected APIs and the exact camera JS/CSS assets on the canonical
domain. Previous deployment `dpl_B8bEQwgDAvexwAVrZ2pLxHvy8RJK` remains available for
rollback. No migration or operational write was made during release. Real camera
focus/lighting and physical scans remain device acceptance checks. Reload open
tabs before trying the updated scanner.
