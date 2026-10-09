# Rename the System to STI College Ormoc ILMS

## Why

The public product name must match the capstone's approved identity while existing technical identifiers remain stable for compatibility.

| Field | Value |
| --- | --- |
| **Date created** | 2026-10-09 |
| **Date last updated** | 2026-10-09 |
| **Status** | `built` |

## How

Public web, document, database-profile, Android, and active documentation labels use **STI College Ormoc Integrated Library Management System**. Compact surfaces use **STI College Ormoc ILMS**. Internal `SmartLib` identifiers, package names, API routes, storage keys, download filenames, database names, and the Android application ID remain unchanged.

Existing database profile rows are renamed only when the stored name is exactly the previous default. MySQL migration `20261009_045_rename_system_brand.sql` and Supabase migration `015_rename_system_brand.sql` make that update and set the new default without changing the schema shape.

## Implementation tracking

- [x] Update web titles, metadata, authentication screens, dashboards, and navigation.
- [x] Centralize API branding and update generated report and receipt headings.
- [x] Update the active Android launcher, splash, authentication, and accessibility labels.
- [x] Add MySQL and Supabase branding migrations and update baseline defaults.
- [x] Update active product, setup, architecture, and migration documentation.
- [x] Verify old-name matches and run project tests, type checks, and builds.

## Change log

| Date | Change |
| --- | --- |
| 2026-10-09 | Implemented the approved public-brand rename while preserving all technical identifiers and compatibility contracts. |
