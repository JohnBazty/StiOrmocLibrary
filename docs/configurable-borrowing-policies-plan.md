# Configurable and Versioned Borrowing Policies Plan

## Why

The STI College Ormoc Integrated Library Management System previously repeated circulation rules in application code and MySQL triggers. This feature gives authorized administrators one place to publish a complete borrowing policy with an effective date. Published versions are immutable. Every finalized loan retains the exact policy version used at checkout.

| Field | Value |
| --- | --- |
| **Date created** | 2026-10-09 |
| **Date last updated** | 2026-10-09 |
| **Status** | `built` |
| **Working branch** | `codex/configurable-borrowing-policies` |
| **MySQL migration** | `20261009_046_configurable_borrowing_policies.sql` (after branding `045`) |
| **Supabase migration** | `016_configurable_borrowing_policies.sql` (after branding `015`) |

Allowed status values: `planned` -> `inprogress` -> `built`.

## Objective

Provide one authoritative, versioned borrowing-policy service used by checkout preflight, final checkout, cart requests, reservations, dashboards, and future renewal and long-overdue workflows. The Legacy baseline seed mirrors prior hardcoded behavior so deployment does not change live loans until STI publishes a later version.

## Implementation tracking

- [x] Branch from `feat/circulation-preflight`; include branding migrations `045` / `015`.
- [x] MySQL `046` + Supabase `016`, baselines, schema-readiness.
- [x] Policy resolver and Admin API.
- [x] Replace hardcoded enforcement paths; bind policy on loans/reservations.
- [x] Admin borrowing-policies page.
- [x] Tests, docs, mark `built`.

## Change log

| Date | Change |
| --- | --- |
| 2026-10-09 | Created plan; status `planned`. |
| 2026-10-09 | Started implementation on `codex/configurable-borrowing-policies` based on `feat/circulation-preflight` plus branding SQL `045`/`015`. Status `inprogress`. |
| 2026-10-09 | Implemented schema, resolver, Admin API/UI, and enforcement wiring. Status `built`. |
