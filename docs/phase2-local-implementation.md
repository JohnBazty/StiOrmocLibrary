# Phase 2 local implementation and release gate

| Field | Value |
| --- | --- |
| Why | Complete the admin, catalog, reservation, and finance workflows before a safe deployment test. |
| Date created | 2026-09-27 |
| Date last updated | 2026-09-28 |
| Status | `inprogress` |

## Scope and implementation tracking

- [x] A1 User management was deployed in an earlier release.
- [x] A2 Category description, ID, date, and counts are implemented locally.
- [x] A3 Current print-supply stock PDF is implemented locally.
- [x] A4 Book detail lists every active copy with barcode, availability, condition, and shelf.
- [x] A5 Staff can report a borrowed book lost from Circulation; an idle copy can be marked Lost from Inventory.
- [x] A6 New catalog entries no longer ask for purchase price. Staff can keep versioned supplier quotations in private Supabase Storage. Historical price data remains unchanged.
- [x] T1 API runner uses a bearer secret, a run lease and token, one successful run per minute, metrics, and a failure alert. It executes reservation expiration, overdue assessment, and scheduled notifications.
- [x] A7 Reservation actions follow Pending → Approved → Ready → physical desk claim; cancellation is confirmed. Each status change creates one in-app notification in its transaction. Expiration uses the runner.
- [x] A8 Staff can confirm a lost book without a quotation. It remains Awaiting Quotation with no charge, then staff can confirm the latest quotation or document a non-monetary resolution. A charge snapshots the quotation ID and amount.
- [x] A10 invoice foundation: separate invoice ledger, admin finance classification and approval gate, serial allocation, PDF download, student invoice list, and void audit are implemented in local code. Existing payment ledgers remain intact. New payment PDFs are labelled payment records, not tax invoices.
- [ ] A10 customer-facing replacement: the Printing and Fines screens still need automatic approved invoice delivery after payment. See [invoice-replacement-plan.md](invoice-replacement-plan.md).
- [x] B9 The page and API accept 1–100 copies; invalid quantities show a range message and the server computes pages/sheets/cost. Requests for 60 or more copies show a paper-stock reminder to the student and staff without changing the quoted price.
- [x] Apply reviewed Supabase migrations `012`–`014` individually to the connected project after a private snapshot; verify schema health and existing row counts.
- [ ] Provision a new 32+ character `JOB_RUNNER_SECRET` in the API environment and in Supabase Vault. Activate the one-minute Supabase Cron job **only after the new API is deployed**.
- [ ] Obtain finance-approved invoice issuer information, tax treatment per payment type, permit/authority details, serial range, and approved document layout. Keep invoice issuance disabled until then. Once reviewed, set `INVOICE_ISSUANCE_ENABLED=true` in the API deployment environment and configure the Admin invoice setup; neither step is done now.
- [ ] Exercise write flows with Student, Faculty, and Admin test accounts against the migrated database, including retries, quotation upload, invoice issue/void, and reservation expiry. Review logs and remove test data safely.
- [ ] Deploy only after the user explicitly asks. This work has not been pushed to GitHub or deployed.

## Scheduled runner activation

Vercel Hobby Cron cannot run every minute. Use Supabase Cron (`pg_cron`) and `pg_net` to POST to the API once per minute. The API requires `Authorization: Bearer <JOB_RUNNER_SECRET>` and records its own lock and outcome. Keep the URL and secret in Supabase Vault. Do not put them in this repository. After deployment and migration, use the Supabase dashboard to create secrets named `smartlib_job_url` (the deployed `/api/jobs/run` endpoint) and `smartlib_job_secret`, then review and run this SQL in Supabase SQL Editor:

```sql
select cron.schedule(
  'smartlib-operational-minute', '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'smartlib_job_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'smartlib_job_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

The job is not active while this release remains local. Verify the first execution in `library_job_runs`, Supabase Cron history, and Admin `/api/v1/admin/jobs/status`. A recent `last_success_at` and no newer `last_error_at` are the acceptance criteria. If activation must be rolled back, use `cron.unschedule('smartlib-operational-minute')`.

## Database changes

Supabase `012` creates the quotation ledger and private bucket, and extends lost reports with quotation and resolution fields. `013` creates the scheduled-run ledger. `014` creates the invoice setup and immutable-serial invoice ledger. MySQL `044`–`046` mirror the schema for rollback reference only. The active application uses Supabase Postgres.

The local Admin Fines and invoice screens retain compatibility with older schemas; the connected Supabase project now includes the required Phase 2 columns and tables. Fine payment reversals check for an invoice ledger before voiding a linked invoice. Invoice issuance remains disabled pending school finance approval.

The Admin and Student Printing payment views read `document_label` on Supabase Postgres. Migration `014` labels existing rows `Legacy Receipt` and gives future rows a `Payment Record` default. This keeps **View payment** and the student's payment history available while invoice issuance remains gated.

## Change log

- **2026-09-28:** Applied Supabase product migrations `012`–`014` after private row snapshots. Schema health is ready, the previous lost-book and payment row counts are preserved, quotation and invoice tables exist, and both new Storage buckets are private. Cron and invoice issuance remain disabled; no GitHub push or Vercel deployment.
- **2026-09-27:** Prepared the remaining Phase 2 features locally and recorded the migrations, scheduler, legal approval, and hosted verification gates. No remote database, GitHub, or Vercel change was made.
- **2026-09-27:** Repaired the local Fines list against the applied Supabase schema and made the Admin/Student invoice pages show a pending state while invoice tables are missing. A read-only live query returned 16 fine/lost-book records. Invoice replacement and issuance remain gated; no shared database, GitHub, or Vercel change was made.
- **2026-09-27:** Repaired the Admin Printing **View payment** query and Student Printing payment list against the current Supabase schema. Read-only checks found the requested payment and two records for its owner; the 242 API tests and typecheck passed. No database write, push, or deployment occurred.
