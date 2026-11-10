# Public Sign In and Sign Up dialogs

| Field | Value |
| --- | --- |
| Date created | 2026-10-11 |
| Date last updated | 2026-10-11 |
| Status | `built` |

## Why

The owner requested modern pop-up Sign In and Sign Up interfaces on the public catalog.

## How

Reuse the existing login/registration forms in a native modal dialog over the public catalog. Add STI branding, segmented navigation, rounded panels, a blurred backdrop, responsive dimensions and light/dark styling. Close, Escape and Back to browsing restore the prior public catalog URL/filters. Direct login/register URLs also open the dialog; borrowing selection survives switching forms. Native modal behavior traps focus and makes the catalog inert; lock page scrolling and prevent dismissal during requests. Password recovery and personnel login retain their current pages. School-email OTP, approval and authentication remain on the existing API.

## Implementation tracking

- [x] Add shared modal shell and reuse existing forms.
- [x] Preserve catalog return location and selected-book continuation.
- [x] Verify navigation, login/OTP state, keyboard/modal handling and responsive layouts.
- [x] Record local acceptance and screenshots.

## Verification

- Web production build passed (existing bundle-size advisory remains).
- 13 focused tests passed across four files: modal navigation/dismissal, pending-request protection, registration OTP/approval and catalog continuation.
- Browser checks passed at the default desktop viewport and 390 × 844: opening from the catalog, switching forms, scrolling the registration dialog to its submit/return controls and Escape returning to browsing.
- Native modal focus and initial input focus checked; background stays inert while the dialog is open.
- Preview screenshots saved locally as `sign-in-popup.png` and `sign-up-popup.png` in the Windows temporary directory. No real login or registration was submitted during visual checks.

## Change log

- 2026-10-11: Owner authorized pop-up redesign; implementation started locally. No database change, push or deployment. Postgres next 025 / MySQL next 048 unchanged.
- 2026-10-11: Completed and verified the responsive dialogs, existing OTP/approval flow and catalog return navigation. Local development server remains running.
