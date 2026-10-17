# User printing page-count recovery

- **Why:** A selected PDF or DOCX could remain without a count when printing availability/history loading failed, requests were paused, Copies was empty, or a previous quote failed temporarily.
- **Date created:** 2026-09-28
- **Date last updated:** 2026-09-28
- **Status:** built

## How

- Load printing availability and histories independently so a payment-history error does not disable an otherwise working form.
- Count selected files independently of availability and valid copy entry. Use one copy to inspect a document while Copies is empty or invalid; hide its price and prevent submission until a valid quantity is entered.
- Preserve a confirmed count for the selected file while recalculating another quantity. Prices are displayed only for the exact current file, quantity, print type, and paper size.
- Allow the read-only quote API while requests are paused. Submission still checks availability, active account, actual document pages, document hash, pricing, and quantity on the server.
- Add Retry page count and make Refresh retry the selected file. Show automatic-count guidance and reading progress.
- Reject empty or incomplete API responses with a readable error so they can be retried instead of storing a missing quote.

## Implementation tracking

- [x] Reproduced live local PDF quote: 3 pages, 60 copies, 180 sheets, correct cost.
- [x] Reproduced live local DOCX conversion and quote: explicit two-page document counted as 2 pages.
- [x] Update the form and read-only quote behavior.
- [x] Verify 21 API printing tests and 14 web tests; API and web type checks pass.
- [x] Restart the local API and verify updated quotes through the Vite proxy: PDF 3 pages × 60 copies = 180 sheets / PHP 360; DOCX 2 pages × 1 copy = 2 sheets / PHP 4. API health returns 200. Sample quotes create no requests or payment records.

No migration is required. Supabase remains through 016, next 017; MySQL rollback reference remains 047, next 048. No push or deployment is included.

## Change log

- **2026-09-28:** Started local page-count recovery after the user reported failures with both PDF and DOCX. Both live document readers currently pass; corrected form gating and failure recovery without changing upload limits, price rules, or paused-submission checks.
- **2026-09-28:** Completed 35 focused tests, both type checks, API restart, and live PDF/DOCX quotes. The user's particular files were not supplied; their exact failure was not reproduced. Fixed the confirmed blank-count and retry paths in the form. All changes remain local.
