# AI / developer helper scripts

Small helper and smoke scripts for the Supabase Postgres database.

| Script | Purpose |
| --- | --- |
| `smoke-supabase-registration.mjs` | Creates, logs in, and removes a temporary student through a supplied web address (local by default); `--printing` tests upload/staff download and `--borrow` tests cart submission/cancellation |
| `migrate-print-documents-to-supabase.mjs` | Audits legacy local print files, then uploads and verifies them in private Supabase Storage with `--apply`; preserves local originals |
| `smoke-phase1-categories.mjs` | Tests Category Add, Edit, Reassign, and Delete against Supabase inside a transaction that rolls back |
| `smoke-phase1-lost-report.mjs` | Tests student lost-book submission, Admin notification/review queue, and staff decision against Supabase inside a transaction that rolls back |
| `smoke-live-phase1.mjs` | Checks the deployed Admin clearance response and creates, reads, then removes one unassigned test category on the live site |
| `smoke-phase1-live-acceptance.mjs` | Runs controlled production reservation, borrow/lost-report review, and synthetic fine-payment flows with a disposable Student/book; removes and verifies all test rows |
| `smoke-phase1-live-categories.mjs` | Tests deployed Category Add, Edit, Reassign, and Delete with empty disposable categories; removes their test audit events |
| `smoke-phase1-browser-account.mjs` | Creates a disposable Student for manual live browser checks with `--create`; removes it afterward with `--cleanup` |

Run from repo root:

```powershell
node tools/ai/smoke-supabase-registration.mjs
# Or verify a deployed site:
node tools/ai/smoke-supabase-registration.mjs https://your-project.vercel.app
node tools/ai/smoke-supabase-registration.mjs https://your-project.vercel.app --printing --borrow
node tools/ai/migrate-print-documents-to-supabase.mjs
node tools/ai/migrate-print-documents-to-supabase.mjs --apply

# Phase 1 Supabase checks; neither commits library records:
node tools/ai/smoke-phase1-categories.mjs
node tools/ai/smoke-phase1-lost-report.mjs

# Live production check; temporarily writes one category and removes it:
node tools/ai/smoke-live-phase1.mjs

# Controlled Phase 1 production acceptance; both scripts write and clean test records:
node tools/ai/smoke-phase1-live-acceptance.mjs
node tools/ai/smoke-phase1-live-categories.mjs

# Temporary browser login; always finish with cleanup:
node tools/ai/smoke-phase1-browser-account.mjs --create
node tools/ai/smoke-phase1-browser-account.mjs --cleanup
```

Do not commit secrets. Review SQL before applying it to Supabase.
