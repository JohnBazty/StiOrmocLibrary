# Shared Violation Warning Rules & Year/Grade-Level Controls

- **Date created:** 2026-11-25
- **Date last updated:** 2026-11-25
- **Status:** built (code, migration `087_shared_violation_warning_rules.sql` applied to live Supabase 2026-11-25, unit/integration/web tests, typecheck and build verified)
- **Branch:** `feat/shared-violation-warning-rules`
- **Migration:** `087_shared_violation_warning_rules.sql` (**applied to live Supabase 2026-11-25**)

## Why

1. The previous violation rules counted warnings **separately per category** (for example, 2 warnings for Noise, 2 for Eating or food, 2 for Other conduct, 2 for Vandalism). Under STI College Ormoc's policy, **every violation adds to one shared offense count across all categories**: receiving one violation counts as #1, and receiving another—even in a different category—counts as #2.
2. The librarian needs the warning limit to stay **configurable** (`0` to `3` warnings before a fine) and be able to set it **for all levels** or **customize by student year/grade level** (`Grade 11`, `Grade 12`, `1st Year`, `2nd Year`, `3rd Year`, `4th Year`).
3. Violation categories should also allow choosing whether a category applies to **All levels** or only selected year/grade levels.

## How

### 1. Database migration (`database/supabase/087_shared_violation_warning_rules.sql`)

- `violation_settings`:
  - Add `warnings_before_fine INTEGER NOT NULL DEFAULT 2 CHECK (warnings_before_fine BETWEEN 0 AND 3)` — library-wide default warning limit.
  - Add `level_warnings JSONB NOT NULL DEFAULT '{}'::jsonb` — optional per-level overrides for `'Grade 11' | 'Grade 12' | '1st Year' | '2nd Year' | '3rd Year' | '4th Year'`, each an integer `0..3`.
- `violation_categories`:
  - Add `allowed_levels TEXT[] NOT NULL DEFAULT ARRAY['Grade 11','Grade 12','1st Year','2nd Year','3rd Year','4th Year']` with a check that it is non-empty and contains only valid levels.
  - Retain `warnings_before_fine` column on `violation_categories` for backward compatibility (synced to default on new creates; no longer used for counting).
- Historical `conduct_incidents`, `conduct_students`, and `fines` rows remain untouched.

### 2. Backend (`apps/api/src/modules/fines/`)

- `conduct-policy.ts`:
  - Define canonical `STUDENT_LEVELS = ['Grade 11', 'Grade 12', '1st Year', '2nd Year', '3rd Year', '4th Year'] as const`.
  - Add `normalizeStudentLevel(raw: string | null | undefined): StudentLevel | null` matching existing normalization rules (`11`, `G11`, `Grade 11`, `1`, `1st Year`, `1Y1`, etc.).
  - Add `resolveWarningsBeforeFine(settings, studentLevel)` returning the per-level override when set, otherwise the default `warningsBeforeFine`.
- `violation-categories.validation.ts` & `violation-categories.service.ts`:
  - Extend `GET/PUT /api/v1/admin/violation-categories/settings` to read and update `maxFine`, `warningsBeforeFine`, and `levelWarnings` in one atomic transaction with optimistic `updatedAt` check and audit notification.
  - Extend category `POST/PATCH` and DTO with `allowedLevels` (defaulting to all 6 levels when omitted). `warningsBeforeFine` on category create/update becomes optional and defaults to the library setting.
- `conduct.service.ts`:
  - `standingFor()`:
    - Resolve the student's year/grade level from `student_profiles.year_grade_level` / `users.educational_level` (normalized via `normalizeStudentLevel`).
    - Read `violation_settings` (`FOR SHARE` when locking) to determine `warningsBeforeFine` for that student's level.
    - Check if the chosen category's `allowed_levels` includes the student's level (when the student has a recognized level); return `levelAllowed` / `levelReason` and block `record()` with `422 CONDUCT_CATEGORY_LEVEL` if disallowed.
    - Count **all** non-voided `conduct_incidents` for `user_id` across **all categories** plus the sum of legacy `conduct_students.prior_warnings` across all categories for `user_id`.
    - Return each history item with its `category` so the UI shows which category each earlier warning was in.
    - Paper-log guard checks across all categories for the user (must precede any system-recorded incident for that person, and stay in date order).
    - Include `studentLevel`, `warningsBeforeFine`, `levelAllowed`, and `allowedLevels` in `reviewToken` so setup changes mid-review return `409 CONDUCT_STALE`.
  - `ownStanding()`:
    - Return a single shared summary `{ role, studentLevel, warningsUsed, warningsBeforeFine, warningsLeft, categories: [...] }` (while keeping `categories` for filter dropdowns and fine-amount display).
  - `event()` (`Voided`):
    - Check for any later non-voided incident for the same `user_id` across **all categories** (`incident_id > ? AND voided_at IS NULL`) because later offenses depend on the shared count.

### 3. Frontend (`apps/web/src/features/fines/`)

- `ViolationRulesPanel.tsx`:
  - Top bar shows **Warnings before fine** (plain summary + **Change warning rules** button) and **Highest fine allowed** (+ **Change limit** button).
  - **Change warning rules** dialog lets the librarian choose default `0–3` warnings and toggle between *"Same for all year and grade levels"* and *"Customize by year / grade level"* (`Grade 11`, `Grade 12`, `1st Year`, `2nd Year`, `3rd Year`, `4th Year`, each `0–3`).
  - Category table columns: **Category**, **Applies to**, **Fine amount**, **Status**, and **Edit** (removes per-category `Warnings before fine` column and repeated warning sentence).
  - Add/Edit category dialog includes **Applies to** (`All levels` toggle or checkboxes for `Grade 11`, `Grade 12`, `1st Year`, `2nd Year`, `3rd Year`, `4th Year`) and removes the per-category warnings selector.
- `ViolationProgress.tsx` & `ViolationRecordForm.tsx`:
  - Show student's year/grade level beside their name (`Name · Student · 1st Year`).
  - Show overall history across all categories (`1st warning · Noise · Nov 20`).
  - Show inline warning and disable Save if the selected category does not apply to the student's year/grade level.
- `ViolationsRecords.tsx`:
  - Replace per-category "Warnings left" grid with one clear shared status banner showing the student's level and total warnings remaining across all violation categories.

## Implementation tracking

- [x] Migration `087_shared_violation_warning_rules.sql` + `schema-readiness.ts` + tracker in `.cursor/agent-protocol.md` + `docs/schema-context.md`
- [x] Backend: `conduct-policy.ts`, `violation-categories.validation.ts`, `violation-categories.service.ts`, `conduct.service.ts` + unit/integration tests
- [x] Web: `violation-categories-api.ts`, `violations-api.ts`, `ViolationRulesPanel.tsx`, `ViolationProgress.tsx`, `ViolationRecordForm.tsx`, `ViolationsRecords.tsx` + Vitest tests
- [x] Verification: `npm test`, `npm run typecheck`, `npm run build`

## Change log

| Date | Change |
|---|---|
| 2026-11-25 | Created plan doc after Ethan specified shared cross-category violation counting with configurable warning limits and year/grade-level controls (`1st–4th Year`, `Grade 11–12`). |
