# Dedicated wallet payment and stable tab switching

Why: the owner wants a readable, dedicated number/PIN/review flow and payment entry that survives switching browser tabs.

Date created: 2026-11-13

Date last updated: 2026-11-13

Status: built

## How

The printing page currently sets its list to Loading on every focus refresh. That unmounts each PaymentAction, discarding its open dialog and entered fields. Refresh in place, share concurrent refreshes and retain the last confirmed list on errors. Keep authoritative status refresh; a completed or cancelled charge may still remove an obsolete action.

Move the fixed-fixture wallet entry to authenticated `/payments/wallet?payment=…`. Load the owned saved quote and current options once. Focus/visibility events must not recreate the form. Show library branding, merchant and total, a +63 number field, a four-digit PIN step, and final review with amount and fee. Use ordinary Payment/PIN labels and identify these as assigned library wallet credentials, without imitating GCash's credential collection. Only existing fixed fixtures may be submitted; never accept a real wallet PIN. Keep credentials in memory only, clear them on submission/back/unmount, and send none in URLs or storage. Real GCash authorization remains with the verified Xendit provider page. An entered PIN never marks a bill Paid.

Preserve ownership checks, CSRF, provider verification, request idempotency and current development-only server guards. Do not apply migrations, change real financial records, push or deploy.

## Implementation tracking

- [x] Reproduce tab-reset cause with a failing regression
- [x] Preserve printing list and payment fields through refresh/failure
- [x] Dedicated library-branded number, PIN and review page
- [x] Verify focus retention, invalid fixtures, duplicate submission and provider handoff in automated checks
- [x] Tests, typecheck and build
- [ ] Browser visual verification if supported connection is available

## Change log

- 2026-11-13: Owner requested stable tab switching and dedicated payment entry using supplied UI references. Restricted library credential entry to assigned synthetic fixtures; retained provider-only real-wallet authorization and confirmed status handling.
- 2026-11-13: Implemented full-page library branding, +63 input normalization, masked/showable four-digit PIN, separate amount/fee review, one-submit locking and idempotent retry. Reused authenticated session activity without refreshing payment inputs. Existing/expired/disabled/non-wallet attempts cannot collect credentials. No credential browser storage, URL parameters or analytics were added.
- 2026-11-13: All 564 API and 392 web tests pass (956 total); typecheck and production build pass. The tab-switch regression failed before the list repair. New number/PIN/review regressions failed against the previous inline component. Targeted payment, navigation and printing checks pass (33 tests). Localhost serves the new module and wallet route with HTTP 200. Browser inventory again reports local browser access unavailable for this chat; desktop/mobile appearance and fresh manual provider approval/return remain unverified. No workaround, push, hosting, migration or financial mutation was performed.
- 2026-11-13: Owner requested four PIN boxes. Replaced the long visual field with four responsive rounded boxes, masked dots by default and the existing Show/Hide PIN control. Kept one labeled native input over the visual slots so typing, selection, paste, backspace, numeric keyboard and assistive access retain native behavior without a custom multi-input focus controller. Decorative slots are hidden from assistive technology; focus has a visible outline and disabled state remains clear. Input accepts at most four digits. All 12 existing wallet/page regression tests, web typecheck and web production build pass. Localhost serves the four-box component (HTTP 200). Desktop/phone visual confirmation remains unverified; no browser retry was made for this small visual change. No push or hosting.

## Verification evidence and limits

Primary-action alignment (2026-11-13): the owner screenshot exposed that a shared horizontal Back/Review row centered the combined row while offsetting the primary button from the page/PIN axis. Changed the wallet actions to a centered, single-column container with the primary button on its own full-width row (maximum 24 rem). Positioned the trailing arrow independently so the label itself remains centered. Moved Back and Cancel to a separate balanced row below the trust note, retained 44–52 px controls and tightened excess PIN-step spacing. This arrangement applies at desktop and mobile widths and removes the previous narrow-screen flex reversal. All 12 existing wallet/page checks, web typecheck and production build pass; localhost serves the corrected layout. Screenshot-based visual confirmation remains pending. No push or hosting.

Design correction (2026-11-13): owner clarified that the supplied screenshot was a reference, not a request to reproduce its blue panel. Applied the UI/UX design guidance to simplify hierarchy: retained one centered PIN heading, neutral space around four centered circles, a small text-style Show/Hide control, a compact mobile-number line, one emphasized review action, and a quiet cancellation action. Removed the large blue panel, duplicate visible PIN label, rectangular group-focus frame, large visibility pill and full-width outlined cancellation control. Focus remains visible on the current/filled circles and button controls. Uses existing light/dark payment tokens and retains mobile action stacking, readable input sizes and validation. Existing 12 wallet/page checks, web typecheck and production build pass. Localhost serves the updated component; visual inspection remains unverified. No push or hosting.

Message refinement (2026-11-13): changed the invalid-number error to “Enter a valid mobile number and try again.” as requested. Only wording and the existing assertion changed; fixed-number validation, PIN protections and provider confirmation remain intact. No push or deployment.

Number-entry clarification (2026-11-13): the example number was placeholder text, but the owner reasonably interpreted it as prefilled. The input still initializes empty; replaced its numeric placeholder with “Mobile number” and its instruction with “Enter your mobile number.” PIN guidance now says “Enter the four-digit PIN for this library payment.” Existing 12 wallet/page checks pass. Credential validation and provider behavior are unchanged; no push or hosting.

PIN appearance refinement (2026-11-13): the owner supplied a four-circle reference. Replaced the previous boxes with four centered ring indicators inside a blue library-branded panel labeled “Enter your PIN.” Entered digits fill the circles; Show PIN reveals their values. The Show/Hide control sits below the circle row so it cannot offset that row's center. Preserved the one labeled native input, masking, validation, clearing, disabled state and provider-only confirmation. Kept numeric inputs at readable sizes, added wrapping for merchant details, centered mobile totals and stacked payment actions below 380 px. Existing 12 wallet/page checks pass. Visual desktop/mobile inspection remains unverified; no claim of browser measurement or physical-device testing is made. No hosting or push.

Ignored local logs: `output/demo-wallet-qa/payment-tab-before.log`, `wallet-page-before.log`, `wallet-page-targeted.log`, `wallet-page-full-tests.log`, `wallet-page-web-final.log`, `wallet-page-typecheck.log`, and `wallet-page-build.log`.

Regression checks cover retaining the exact existing printing row through a pending/failed focus refresh, retaining partly typed PIN through focus/visibility changes, fixed-number validation, mismatched PIN rejection, +63 normalization, final review before provider submission, disabled duplicate submission, stable idempotency key on retry, PIN clearing, expired/disabled/foreign-channel/paid/already-active attempts, and malformed links. Provider handoff is mocked in UI tests; no newly created external payment is claimed verified. Prior endpoint ownership, CSRF and provider verification regressions remain passing. The earlier authorized QA printing request was not duplicated, printed or modified by this task.
