# Payments circulation in practice mode (Pay, Add funds, Withdraw funds, Refunds)

- **Date created:** 2026-11-20
- **Date last updated:** 2026-11-20
- **Status:** built
- **Branch:** `fix/payments-circulation-flow` (from `chore/revisions-phase-3`)
- **Migrations:** None required (reuses applied `044_hosted_payment_preview.sql` and `gcash_payment_settings`; latest applied remains `086`, next unused remains `087` per `.cursor/agent-protocol.md`)

## Why

Users cannot complete payments, withdraw funds, or add/transfer funds in practice mode when running locally or when hosted practice keys lack Xendit Money-out / Balance capabilities or external checkout links:
1. Local development (`http://localhost:5173`) boots without `HOSTED_PAYMENT_PREVIEW=true` or `.env.xendit-sandbox`, leaving `localPaymentPreview === null` while live Supabase uses `hosted_payment_preview` (`044_hosted_payment_preview.sql`) instead of `online_payment_attempts`/`online_payment_fee_rules`.
2. Hosted practice mode defaults `HOSTED_PAYMENT_REFUNDS_ENABLED` and `HOSTED_PAYMENT_PAYOUTS_ENABLED` to `false` and `payoutFeeCentavos` to `null`, and fails when a Xendit development key lacks `/balance`, `/v3/payouts`, or `/v3/refunds` permissions.
3. Practice checkout requires `checkoutUrl` from `dev.xen.to`/`checkout-staging.xendit.co` and cannot complete internally when Xendit session creation is unauthorized or offline.
4. `LibraryFundsPage` and `SchoolBankManager` did not expose the one-click sample school bank action (`setupSampleBank`), `setupSampleBank` omitted `isDefault: true`, `draftWithdrawal` blocked withdrawing confirmed TopUp funds if 0 student online payments existed, `PracticeTransferDialog` received `0` instead of `data.collections.availableCentavos` when `data.balance` was null, and form dialogs lacked inline validation hints.

## How

1. **Backend Xendit status tag (`apps/api/src/modules/payments/xendit.client.ts`):**
   - Tag HTTP rejections from `api.xendit.co` with a private Symbol `XENDIT_HTTP_STATUS` without changing error messages, codes, HTTP 503 status, or JSON output.
2. **Backend ledger-backed practice provider (`apps/api/src/modules/payments/practice-provider.ts`):**
   - Implement `createPracticeProvider` backed by `hosted_payment_preview` (`attempts` + `funds`) for sessions, captures, balance, payouts, and refunds, reusing existing `businessId` values from historical `Succeeded` attempts (or `DEFAULT_PRACTICE_BUSINESS_ID`).
   - Implement `createHybridPracticeProvider` that tries real Xendit sandbox calls first when configured and falls back to `createPracticeProvider` only on HTTP `401`/`403`/`404` rejections (never on `5xx`, `429`, or network timeouts).
3. **Backend money-out & preview wiring (`apps/api/src/modules/payments/money-out.service.ts`, `payments.preview.ts`):**
   - Update `setupSampleBank` to mark the first/only active school bank as `isDefault: true` and return `isDefault`.
   - Allow `draftWithdrawal` to use `defaultBusinessId` when no prior `Succeeded` attempts exist, while still rejecting `businesses.size > 1`.
   - Support `practice_checkout: true` sessions in `payments.preview.ts` (`checkout`, `check` including `cancel` before completion, and `publicRow`).
   - Enable `configuredPreview()` in `HOSTED_PAYMENT_PREVIEW=true` (both with `XENDIT_SECRET_KEY` via hybrid fallback and without a key via practice provider) and by default in non-production local development (`!env.isProduction && !process.env.VERCEL && !env.xendit.enabled && process.env.LOCAL_PAYMENT_PREVIEW !== 'false'`), while keeping `NODE_TEST_CONTEXT` returning `null`.
4. **Frontend payments & funds UX (`apps/web/src/features/payments/`):**
   - Handle `practiceCheckout` navigation in `payment-navigation.ts` and `payments-api.ts`.
   - Expose `"Use sample school bank"` in `LibraryFundsSummary.tsx`, `LibraryFundsPage.tsx`, and `SchoolBankManager.tsx`, and fall back to `data.collections.availableCentavos` in `PracticeTransferDialog`.
   - Add inline validation hints, amount trimming, default bank/Manila transfer date pre-fill, and one-click assigned wallet `"Fill"` button in `DemoWalletCheckout.tsx` (without forbidden test/demo/auth wording).
   - Fix stale `PaymentAction.test.tsx` assertion from `d066bdc` and add comprehensive backend & frontend tests.

## Implementation tracking

- [x] Create `fix/payments-circulation-flow` branch and work doc.
- [x] Add tests-first coverage (`practice-provider.test.ts`, `money-out.service.test.ts`, frontend tests).
- [x] Implement `XENDIT_HTTP_STATUS` in `xendit.client.ts` and `practice-provider.ts`.
- [x] Update `money-out.service.ts` and `payments.preview.ts`.
- [x] Update frontend components (`payments-api.ts`, `payment-navigation.ts`, `LibraryFundsSummary.tsx`, `LibraryFundsPage.tsx`, `SchoolBankManager.tsx`, `SchoolBankForm.tsx`, `WithdrawalReview.tsx`, `PracticeBankTransfers.tsx`, `DemoWalletCheckout.tsx`).
- [x] Run focused tests, typecheck, build, read-only local startup check, and combined security/correctness/React diff review.

## Verification

- **API payment & hosted config tests (`node --test apps/api/src/config/hosted-payments.test.ts apps/api/src/modules/payments/*.test.ts`):** 112 passed, 0 failed (ran after the final code edit).
- **Web payment tests (`npm test -w @sti-library/web -- src/features/payments/`):** 19 test files passed, 74 tests passed, 0 failed (ran after the final code edit).
- **Typecheck & build (`npm run typecheck`, `npm run build`):** Both exited 0 across `@sti-library/api` and `@sti-library/web` (ran after the final code edit).
- **Read-only local runtime smoke check (outside `NODE_TEST_CONTEXT`, without writing to Supabase):** Confirmed `localPaymentPreview` initialized (`previewEnabled: true`), `gcash_payment_settings` is enabled (`gcashEnabled: true`), forged webhook token to `/api/payments/xendit/webhook` returned HTTP `401`, and unauthenticated requests to `/api/v1/admin/payments/funds` and `/api/v1/user/payments/options` returned HTTP `401`.
- **Security fix applied during diff review:** Changed `syntheticPracticeConfig()` in `apps/api/src/modules/payments/payments.preview.ts` to set `webhookToken: ''` so unauthenticated refund webhooks always fail closed (`401`) in ledger-only practice mode, with regression test coverage in `apps/api/src/modules/payments/practice-provider.test.ts`.
- **Pre-existing unrelated items observed (out of scope on base branch `chore/revisions-phase-3`):**
  - Full API run before final webhookToken test addition: 1222 passed, 4 pre-existing failures (`attendance-confirmation.service.test.ts`, `paper-pricing.pg.test.ts`, `printing-cash.integration.test.ts`, `printing-deferred.integration.test.ts`).
  - Full Web run: 880 passed, 1 pre-existing failure (`src/features/shelves/MoveCopiesDialog.test.tsx`).
  - `checkSchemaReadiness()` / `/api/health` returned 503 `migration_required` for 3 pre-existing missing columns unrelated to payments (`auth_sessions.expires`, `attendance_confirmation_requests.request_id`, `attendance_confirmation_requests.log_id`).

## Change log

| Date | Change |
| --- | --- |
| 2026-11-20 | Plan approved and work doc created on `fix/payments-circulation-flow`. Status `inprogress`. |
| 2026-11-20 | Completed ledger-backed practice provider, hybrid 401/403/404 fallback, local dev practice default, UI bank/transfer/withdrawal/wallet fixes, fail-closed `webhookToken: ''`, and all payment test/typecheck/build/smoke checks. Status updated to `built`. |
