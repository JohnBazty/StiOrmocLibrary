# Floating Borrow / Return shortcut

- Why: show a user's requested books on first QR scan and their active loans on a second deliberate scan, with staff choosing the physical copy before confirmation.
- Date created: 2026-11-18
- Date last updated: 2026-11-18
- Status: built
- Authorization: implementation queue item 4; host and verify before starting items 5â€“7 (auto-fill, covers, stocktake).
- Branch: `codex/floating-circulation-shortcut` in the active `StiOrmocLibrary-main-sync` checkout.

## How

Place Borrow / Return directly above Scan attendance for Librarian and authorized Staff. Both scanners are mutually exclusive. Keep the Student/Faculty attendance QR control unchanged. The shortcut is lazy loaded and uses a keyboard-accessible dialog with the existing scan/camera/upload component. Each accepted camera frame closes/releases its scanner, requiring an explicit new camera session to scan again; repeated frames cannot change modes.

First valid user QR loads requested books immediately. A unique ready assigned request opens the existing checkout review; several requests require selection. Waiting/unassigned items cannot be handed over. With no recorded request, staff can choose manual lending of a physical book. A QR cannot infer an unrecorded borrowing intention. Existing CirculationDesk remains responsible for checkout policy, copy matching, attendance, enrollment and final confirmation.

A second completed scan of the same user QR loads outstanding take-home loans, including overdue copies. It never performs a return automatically. Staff selects the exact loan/copy and opens the existing return/condition review. A selected expected loan ID/kind is checked against the current return preview, and the existing service rechecks assignment and idempotency on save. Further scans in Return refresh, rather than toggle to Borrow. A different user clears prior selections. Typing a new code immediately removes an old checkout review. Five-minute inactivity clears the borrower context, while an active return/checkout review cannot be discarded mid-save.

The new protected quick-borrower endpoint resolves the QR on the server and scopes active loans by that resolved user, with 50 rows/page and a bounded next-page read. Return lookup can accept a valid nonrevoked QR for an inactive account, so outstanding returns are not blocked by borrowing eligibility. No arbitrary client user ID is accepted. Queries exclude pending, returned and lost loans. Existing return-by-copy still handles other operational exceptions and in-library use.

Read-only borrower/request previews avoid running attendance-cutoff cleanup as an incidental lookup. Actual confirmation paths retain existing policy enforcement. The API's current permission/session/CSRF guards and active desk-actor checks remain in force. No new schema or migration: latest applied 063, next unused 064.

## Implementation tracking

- [x] Read current desk, QR resolver, scanner, request-preview and return contracts.
- [x] Add tests for first/second scan, duplicate in-flight events, later Return refreshes and borrower changes.
- [x] Add protected borrower-scoped active-loan query and actual Postgres-engine filtering checks.
- [x] Stack shortcut above attendance; test role restriction and one mounted scanner at a time.
- [x] Reuse checkout/return reviews, expected copy/loan identity, transaction and receipt rules.
- [x] Full API 811 passed; full web 579 passed; typecheck/build passed.
- [x] Latest focused frontend tests passed after removing stale review on new input and protecting active return review from inactivity reset.
- [x] Focused query coverage recorded; real Postgres engine verifies borrower isolation, same-title copy choices and exclusion of pending/returned/lost records.
- [x] Verified actual layout, manual/QR switch, requested-book review, first/second QR scan and nested selected-copy return review in the requested ChatGPT tab. Camera hardware remains a distinct human trial.
- [x] Final review/type/build gates passed. Feature-only staged build passed plus eight API and eight frontend tests.
- [x] Hosted dpl_FTV9BGAXZ9w9J4zsM8Vxhpyqk69S; candidate/canonical health/schema, unsigned endpoint guard and compiled shortcut/switch verified.

## Browser verification

Direct iab tab access became unavailable. Recovered testing through the native ChatGPT window using the same computer-use tool and verified the visible localhost URL. In the requested side-panel browser, checked shortcut placement, the Scan QR / Enter School ID switch, manual requested-book review, manual active-loan choice, the nested return review with the selected exact copy, and first/second QR lookup. All previews used synthetic records and no save/return was submitted. Camera hardware remains a separate human trial.

Manual School ID is an explicit alternative identity mode, never a fabricated QR. Exact case-insensitive IDs preserve leading zeros; missing, invalid, nonexistent and ambiguous IDs fail on the server. Both modes are desk-authorized and show name/School ID before confirmation. Active account is required to borrow; inactive linked accounts can return outstanding copies. Switching identity mode clears all prior context and resets Borrow; manual Return is selected explicitly. No attendance or loan is written by lookup.
The local synthetic trial is `http://127.0.0.1:5181/quick-circulation-acceptance.html`. It renders actual components with mock borrower/request/loan responses and refuses transaction writes. It contains no real account or QR secret. The source harness is temporary and must move back under ignored output before packaging.

## Change log

- 2026-11-18: Implemented item 4 after verified ownership hosting. Added protected per-borrower return choices, floating shortcut, repeated-scan navigation and shared confirmations. Automated/SQL/type/build checks passed as recorded. Browser verification remains pending due to unavailable ChatGPT browser connection; no deployment or real loan/attendance write performed.

- 2026-11-18: Owner requested a no-QR fallback and explicit mode switch. Added School ID lookup using the existing manual identity contract, matching request/return reviews, leading-zero/server-validation tests and browser acceptance. No real records changed.

### Release assembly

The active checkout contains unrelated preexisting automatic-desk-scanner and damage-choice changes. Initial candidate build identified an unavailable scanner dependency; candidate was not promoted. Reassembled the service/routes/shared desk/return dialog from the previous hosted baseline plus only this feature’s reviewed changes. Local preexisting source changes are preserved. The release manifest records assembled file hashes. Stage build and focused tests pass. No scanner detection endpoint or unrelated condition-choice redesign is included.

- 2026-11-18: Feature-only candidate passed staged build/tests and hosted checks; promoted to the canonical site. Item 4 complete. No schema migration or real attendance/loan changes. Next item 5 is required-field auto-fill.
