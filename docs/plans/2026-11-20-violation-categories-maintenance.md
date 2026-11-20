# Violation rules maintenance, automatic progression, and Fines tabs cleanup

- **Date created:** 2026-11-20
- **Date last updated:** 2026-11-20
- **Status:** inprogress
- **Branch:** `feat/violation-categories-maintenance`, stacked on `feat/stocktake-webcam-scan` (33 commits ahead of `origin/main`; the current Fines UI only exists there)
- **Migration:** `074_violation_categories.sql`, **applied to live Supabase 2026-11-20**
- **UI skills at build time:** `sti-vaadin-design-system` + `sti-ux-qa-critic` (audit below)

## Why

1. On Fines → Violations, the categories (`Noise`, `Eating or food`, `Other conduct`) are hard-coded in `conduct.service.ts`, `ViolationsRecords.tsx` and the `CHECK` constraints in `056_conduct_records.sql`. The librarian cannot add or retire a category, or set its fine.
2. The **Normal fine amount** is a free-text input that is always visible. Staff have to remember the rule and type the money each time. Ethan wants the system to work out the step automatically from the person's history and **show** the amount owed, not ask for it.
3. Progression should be **1st offense = 1st warning, 2nd offense = 2nd warning, 3rd offense = fine**. The code today allows three warnings and fines only on the 4th offense.
4. The Fines management tabs are noisy. Header buttons apply to only one tab, there are duplicate Refresh buttons, setup forms sit inside daily screens, styling is inconsistent, and it is not clear what each tab is for.

## What exists today (findings)

| Area | Today |
|---|---|
| Overdue fines | **Already automatic, no change.** The `circulation-overdue` job (`job-runner.jobs.ts` → `escalateOverdueTransactions`) marks loans Overdue and creates or updates an `Overdue` fine (`Accruing`). It charges hourly on the due date, then per library day, capped, skipping closed days. Rates come from **Library setup → Fine rules** (`fine_policy_versions`). |
| Violation progression | Automatic from saved history: `conductAction(count)` gives 0 → First warning, 1 → Second warning, 2 → Final warning, 3+ → fine eligible. Faculty count as 3, so they go straight to a fine. Only the **amount** is manual. |
| Categories | Hard-coded list plus DB `CHECK` constraints. |
| Fine amount | `<input name="amount">` is always shown and typed by hand. The server requires it only at the fine step. |
| First record per category | A collapsed "review lifetime warning history" panel (prior warnings 0–3 plus a reason) is always rendered. It is needed only when no saved history exists. |

## How

### 1. Data: migration `074_violation_categories.sql`

```sql
CREATE TABLE violation_categories (
  category_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 2 AND 80),
  description TEXT CHECK (length(description) <= 300),
  warnings_before_fine INTEGER NOT NULL DEFAULT 2 CHECK (warnings_before_fine BETWEEN 0 AND 3),
  fine_amount NUMERIC(10,2) NOT NULL CHECK (fine_amount > 0 AND fine_amount <= 999999.99),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by_account_id BIGINT REFERENCES accounts(account_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO violation_categories(name, warnings_before_fine, fine_amount, sort_order)
VALUES ('Noise',2,<amount>,1),('Eating or food',2,<amount>,2),('Other conduct',2,<amount>,3);
-- Replace the fixed-list CHECKs on conduct_incidents/conduct_students with an FK to violation_categories(name).
-- Keep 'Final warning' valid in conduct_incidents.action for old rows. New rows use First/Second warning or Fine issued.
ALTER TABLE conduct_incidents ADD COLUMN source TEXT NOT NULL DEFAULT 'Recorded' CHECK (source IN ('Recorded','Paper log'));
-- A paper-log row is always a warning, never a fine: CHECK (source = 'Recorded' OR fine_id IS NULL).
-- RLS on; REVOKE from PUBLIC/anon/authenticated, as in 056.
```

- The name is **locked once a category has records** (`conduct_students` is append-only, so a cascading rename would fail). Description, warnings, amount and active can still change.
- There is no delete. **Retire** (`is_active = false`) hides it from the record form but keeps it in filters, history and exports.
- Changing an amount affects **new** fines only. Issued fines keep their amount, since `fines.fine_amount` is already stored per row.

### 2. API

- `GET/POST/PATCH /api/v1/admin/violation-categories` (Librarian/Admin, CSRF, validated). Each write adds an `admin_notifications` row, like fine rules.
- `GET /api/v1/admin/fines/violations/standing?schoolId=&category=` returns `{ name, role, warningsUsed, warningsBeforeFine, nextStep: 'First warning'|'Second warning'|'Fine', fineAmount, history: [{ date, step, source }] }`.
- `conductAction(count, warningsBeforeFine)`: with 2 → 0 = First warning, 1 = Second warning, 2+ = Fine. Faculty go straight to Fine.
- `conduct.service.ts`: the **server sets the amount** from `violation_categories.fine_amount`. The `amount` field is removed from the record/preview input, so the client cannot send money. The amount is part of the `reviewToken`, so a setup change during review returns 409 "rules changed, review again".
- Exceptions to the standard amount go through the existing **fine adjustment** on Fines & charges (already audited). The violation form stays read-only.

### 3. Library setup → new "Violation rules" tab

Added to `maintenanceTabs` beside `fine-rules`. It is one table (Gate 1):

| Category | Warnings before fine | Fine on next offense | Status | |
|---|---|---|---|---|
| Noise | 2 | PHP 50.00 | Active | Edit |

There is an **Add category** button (the only primary action) and an Edit dialog (name, short description, warnings 0–3, fine amount) with inline validation. Each row gets a plain summary line: "2 warnings, then PHP 50.00 on the 3rd offense." Retire/Restore are inside Edit.

The **Urgent alerts rule form** ("Review rules" in `UrgentCases.tsx`) also moves here as an "Urgent alert rules" section. It is setup, not daily work (Gate 2).

### 4. Fines → Violations: record form with automatic progression

The form asks only for facts. The system decides the step and the money.

```
┌ Record a violation ─────────────────────────────────────────┐
│ School ID [ 02000123456 ]      Category [ Noise         ▾ ] │
│                                                             │
│ Juan Dela Cruz · Student                                    │
│  ✓ 1st warning ── ✓ 2nd warning ── ● Fine                    │
│  ┌──────────────────────────────────────────────┐          │
│  │ Amount to pay        PHP 50.00                │          │
│  │ Set in Library setup → Violation rules        │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
│ When (Philippines) [11/20/2026 07:02 AM]  Where [Library]   │
│ What happened? [                                         ]  │
│                                     [ Record fine PHP 50 ]  │
└─────────────────────────────────────────────────────────────┘
```

- The progress strip (1st warning → 2nd warning → Fine) appears once the School ID and category are known. Done steps are checked and the next step is highlighted, using color, icon and text together (Gate 6).
- **1st and 2nd offense:** no money block. The strip says "This will be the 2nd warning. No charge; borrowing and clearance are not affected."
- **3rd offense (or faculty):** a read-only **Amount to pay** card shows the category's fine. There is no input field. The button says what will happen: "Record fine PHP 50.00" or "Record 2nd warning".
- Unknown School ID, inactive account or an invalid date are shown inline before submit (Gate 3). Submit stays disabled until standing loads.
- The separate "Review outcome" then "Save" steps merge: the progress strip **is** the review, and the button saves with the same `reviewToken` and request key.

#### 4a. Remove the "First record for this category: review lifetime warning history" panel

Today, the first time a student is recorded in a category, the librarian must pick "Warnings already used" (0–3) and type a reason. It always shows, it is confusing (it accepted "d" as text), and it asks staff to guess history the system cannot check.

**Redesign: the system's own records are the only history.**

- The panel, the `priorWarnings`/`reviewReason` inputs and the `CONDUCT_FIRST_REVIEW` error are **removed**. A student with no records in a category starts at 0, and the strip shows "No earlier records in this category. This will be the 1st warning."
- **Earlier warnings from the paper log** are added the normal way. The librarian records the past incident with its real date (the date field already accepts past dates) and ticks **"From the paper log"**. That record counts toward the steps, shows a "Paper log" tag in history, and never creates a fine or a notification. The tag is stored as `conduct_incidents.source = 'Paper log' | 'Recorded'` in migration 074.
- **Existing saved reviews** in `conduct_students` (append-only) **keep counting**, so nobody's history is reset. The standing endpoint returns `warningsUsed = saved prior warnings + recorded incidents`. The drawer shows them as "N earlier warnings (reviewed <date>)". New rows are no longer written; the table stays for history.
- If a librarian adds a paper-log warning by mistake, they void it with the existing Voided review note (allowed while no later incident depends on it).

### 5. Fines management tabs: less noise, clearer purpose

**Page Audit: Fines management** (`AdminFinesPage.tsx`, `ViolationsRecords.tsx`, `UrgentCases.tsx`, `ServiceChargesPanel.tsx`). Verdict: **Needs cleanup**.

- `[P1 / Gate 2]` The header shows **Export filtered PDF** (primary) and **Refresh** on every tab, but both apply only to Fines & charges. Each tab also has its own Refresh ("Refresh records", "Refresh"). **Fix:** the header keeps only the "Online payments" link. Export and Refresh move into each tab's own toolbar, one per tab.
- `[P1 / Gate 4]` Tabs don't say what they hold. **Fix:** one quiet line under the active tab:
  - Fines & charges: "Overdue fines are added automatically. Record cash payments and adjustments here."
  - Urgent alerts: "People whose balance or overdue items need follow-up today."
  - Violations: "Record library conduct. Warnings and fines follow Library setup → Violation rules."
  - Service charges: "Other one-off services. Separate from printing and fines."
- `[P2 / Gate 2]` The Violations tab has a 3-sentence policy paragraph above everything. **Fix:** replace it with the progress-strip explanation inside the form, plus a one-line caption.
- `[P2 / Gate 1]` Violations "View record" opens an inline box at the bottom of the page. **Fix:** use a side drawer (detail plus review notes). Table columns: Person, Category, Step, Date, Fine status.
- `[P2 / Gate 2]` Fines & charges shows **5** stat cards. **Fix:** at most 4. Drop "Waived" (it is available as a status filter).
- `[P2 / Gate 6]` Violations and Service charges use ad-hoc styles (`rounded-xl border`, `opacity-70`, `bg-red-700` error boxes, raw `<table>`). **Fix:** use `SectionCard`, `NoticeBanner`, `ResponsiveTable` and the `--sl-*` tokens, as on Fines & charges.
- `[P3 / Gate 6]` Tabs use `aria-pressed` buttons and aren't in the URL. **Fix:** `role="tablist"`/`tab` with `?tab=`, so a refresh keeps you on the same tab and links can open a specific one.
- `[P3 / Gate 4]` The Urgent alerts tab shows a count badge when cases exist, so staff know to look.

### 6. Fines & charges: violation fines in the table and data-driven filters

Violation fines are already saved as `fines.fine_type = 'Infraction'` with a `fine_infractions` row, and they already list in the Fine audit table. Two problems remain:

- The **Fine type** filter is hard-coded twice: in the web `<select>` (`Overdue`, `Infraction`, `Lost Book`) and in the API (`TYPES` in `fines.validation.ts`). Violation categories from setup can't be filtered, `Damage Replacement` is missing, and staff see the internal word "Infraction".
- There is no way to answer "who was fined for Noise this month?"

**Fix:**

- New `GET /api/v1/admin/fines/filter-options` returns the fine types and the violation categories from `violation_categories`, including retired ones, so old fines stay filterable. Retired categories are labeled "(retired)". Any older free-text categories found in `fine_infractions` are grouped as "Other earlier violations".
- The filter becomes one grouped select:
  ```
  All charges
  ── Borrowing ──   Overdue · Lost book · Damage replacement
  ── Violations ──  All violations · Noise · Eating or food · Other conduct
  ```
- The API accepts `type` plus an optional `category`. It checks `category` against the table (parameterized) and filters `fi.category = ?`. The hard-coded `TYPES` set is replaced by the same list the endpoint returns.
- In the table, the "Infraction" label becomes **"Violation · Noise"** and the Reason column shows what happened. Each row links to its violation record (opens the Violations tab drawer at `?tab=violations&incident=<id>`).
- The PDF export uses the same filters and labels.
- The legacy `fines-api.issueInfraction` client call, which sends an `amount`, is removed. `POST /admin/fines/infractions` stays an alias of the violation record route, without `amount`.

**Keep intact:** CSRF, Librarian/Admin-only recording, idempotent request keys, preview-token stale checks, append-only conduct history, void rules (no void when a fine is linked or later incidents depend on it), notifications, clearance refresh on fine issue, export limits, and the fine payment/adjustment flows.

## Decisions for Ethan

1. **Fine amounts** to seed for Noise, Eating or food and Other conduct?
2. **Warnings before fine per category** (recommended), or one number for all?
3. Students who already hold a "Final warning" under the old rule will be fined on their next offense. OK?

Settled in this revision: the fine amount is **display only** (from setup), not typed or edited on the form.

## Implementation tracking

- [x] Migration `074_violation_categories.sql` + `docs/schema-context.md` + tracker in `.cursor/agent-protocol.md`
- [x] `conduct-policy.ts`: threshold parameter (tests: 0/1/2 with threshold 2, faculty, threshold 0)
- [x] Violation categories service, routes and validation (tests: permissions, validation, retire, name locked after use)
- [x] `conduct.service.ts`: DB categories, server-set amount, `amount` input removed, standing endpoint, stale token on setup change (integration tests)
- [x] Web: Library setup "Violation rules" tab + "Urgent alert rules" moved from `UrgentCases.tsx` (Vitest)
- [x] Web: Violations form with progress strip and read-only Amount to pay; record drawer (Vitest)
- [x] Remove the first-history review panel; add "From the paper log" (`source` column in 074); old `conduct_students` reviews still count (integration tests)
- [x] Fines filter options endpoint + `type`/`category` filter replacing hard-coded `TYPES`; "Violation · <category>" labels; PDF uses the same filters (tests)
- [x] Web: Fines tabs cleanup (header actions, tab captions, URL tab state, 4 stat cards, shared components) (Vitest)
- [x] Student/Faculty fines view: "warnings left" per category
- [ ] `sti-ux-qa-critic` re-audit, desktop + mobile, light + dark
- [x] Reviews: `security-reviewer` + `database-reviewer` (findings fixed, see change log)

## Pre-apply checklist (migration 074, live Supabase, with Ethan's go-ahead)

1. On live, run `SELECT DISTINCT category FROM conduct_incidents UNION SELECT category FROM conduct_students;`. Every value must be `Noise`, `Eating or food` or `Other conduct`; anything else makes the foreign keys fail.
2. Apply 074 **before** deploying this code. The code needs `violation_categories` and `conduct_incidents.source`, and `/api/health` reports migration required until they exist.
3. The migration sets a 5 second lock timeout and drops the old category checks without `IF EXISTS`, so a naming mismatch fails loudly and changes nothing.

## Change log

| Date | Change |
|---|---|
| 2026-11-20 | Plan created from code review of `conduct.service.ts`, `conduct-policy.ts`, `ViolationsRecords.tsx`, `056_conduct_records.sql` and `circulation-overdue.service.ts`. Confirmed overdue fines are already automatic. |
| 2026-11-20 | Ethan: the fine amount must be a read-only display of what to pay, not an input or an editable auto-fill. Progression stays automatic from history. Added the Fines tabs cleanup (section 5) and moved the Urgent alert rules into Library setup. Removed the "editable amount" decision. |
| 2026-11-20 | Ethan: fined students must be findable in Fines & charges filters, built from maintenance (not hard-coded), and the first-history review panel must be removed or redesigned. Added 4a (panel removed; paper-log records; old reviews still count) and section 6 (filter options endpoint, grouped type/category filter, "Violation · category" labels). |
| 2026-11-20 | Build started on `feat/violation-categories-maintenance`; status `inprogress`. Defaults used for the three open decisions (all easy to change in Library setup → Violation rules, no code change): seed fine PHP 50.00 for Noise, Eating or food and Other conduct (decision 1); 2 warnings before the fine per category, set per category (decision 2); existing "Final warning" holders become fine-eligible on their next offense (decision 3). |
| 2026-11-20 | Built backend and web (migration 074 written, not applied; tests green on PGlite). Notes: a paper-log entry made when the person is already at the fine step is saved as a "Final warning" (never a fine); faculty cannot take paper-log entries (they have no warnings); the standing endpoint also returns the `reviewToken`, which now covers person, history, threshold and fine amount (not the free-text details), so the single save button can use it; `category` filtering in Fines & charges is applied in the service after the category is checked against `violation_categories`; a threshold of 3 uses the existing `Final warning` value as the third warning. Visual re-audit in a browser (desktop/mobile, light/dark) and the security and database reviews are still to do. |
| 2026-11-20 | Review fixes. Paper log rule tightened (replaces the "final warning at the fine step" behavior): students only, category must have warnings, next step must still be a warning (409 `CONDUCT_PAPER_LOG_FINE_STEP`), dated before today in Manila, in date order, and before the person's first non-voided system record in that category (422 `CONDUCT_PAPER_LOG_AFTER_RECORDS`); standing returns `paperLogAllowed` and a reason and the checkbox is disabled with the reason beside it. Progress strip and button label come from `nextStep`. 074: `SET LOCAL lock_timeout`, case-insensitive unique index on name, CHECK drops without `IF EXISTS`; `record()` locks the actor account `FOR NO KEY UPDATE`. Category PATCH requires the `updatedAt` the client saw (409 when stale); names with `::` or `__earlier` refused. Form ignores stale standing answers and syncs the category; drawer traps focus and handles missing `?incident=`; tab arrows replace history and support Home and End. Pre-apply checklist added above. |
| 2026-11-20 | Migration 074 applied to live Supabase with Ethan's go-ahead after read-only pre-checks (ledger at 073, no existing conduct rows, constraint names matched, no long transactions). Verified: ledger row, 3 seeded categories (PHP 50.00, 2 warnings), category FKs and paper-log CHECK present, old category CHECKs dropped, RLS on, no anon/authenticated grants. Code not yet deployed. |
| 2026-11-20 | Ethan: the fine is at most four digits (PHP 9,999.99) and a category can be deleted, not only retired. Limit set in the API validation, the Library setup form (hint and inline error, `maxLength`) and migration `075_violation_fine_four_digits.sql` (written, not applied; before applying run `SELECT name, fine_amount FROM violation_categories WHERE fine_amount > 9999.99;`, which must return no rows). Delete: `DELETE /api/v1/admin/violation-categories/:id`, Librarian only, only when no record uses the category (otherwise 409 `VIOLATION_CATEGORY_IN_USE`, retire instead); runs under the same row lock a recorded violation takes, writes an audit note, and the foreign keys are the backstop for a record saved in the same instant. The Edit dialog has a red Delete category button with a plain confirmation; it is disabled with the reason when records exist. Supersedes the earlier "no delete" decision. |
