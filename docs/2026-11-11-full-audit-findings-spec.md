# Full Audit Findings - Action Required

**Status:** Open questions & action items
**Date:** 2026-11-11
**Branch:** feat/durable-job-runner

## Problem Statement

Multiple audits revealed critical issues requiring Ethan's go-ahead before proceeding.

## Audit Results Summary

### 1. Security Audit (agent-skills:security-auditor)
**Score:** ⚠️ HIGH issues: 4, MEDIUM: 6, LOW: 4
**Critical finding:** No RLS on core circulation tables

### 2. Database Audit (database-reviewer)
**Critical:** RLS only on job tables, NOT on borrow_transactions, reservations, materials

### 3. Test Coverage
**API:** 69.82% statements
**Web:** 56.76% statements
**Requirement:** ≥80%

### 4. Web Performance
**CRITICAL:** No route code splitting, large pdfjs-dist (6.4MB), images without dimensions

### 5. Code Review
**Verdict:** ✅ APPROVE (job runner implementation is solid)

## Findings Requiring Ethan's Go-Ahead

### P1 - CRITICAL (Must fix before push/PR)

1. **RLS Missing on Core Tables**
   - Tables: borrow_transactions, reservations, materials, physical_copies
   - Current: RLS only on scheduled_job_state and scheduled_job_runs (migration 034)
   - Fix: Add RLS policies with auth.uid() pattern
   - Location: database/supabase/ - need new migration

2. **Unauthenticated Rate Limiting DoS**
   - job-runner.routes.ts validates secret AFTER rate limit check
   - Fix: Move rate limit inside auth validation
   - Location: apps/api/src/app.js:31

3. **Session Fixation in Inventory Preview**
   - Creates full admin session without CSRF
   - Risk: Full admin compromise if enabled
   - Fix: Kill endpoint or add production guard

### P2 - HIGH Priority

4. **Route-Level Code Splitting**
   - App.tsx imports 51 routes synchronously
   - Impact: 200-400KB bundle bloat, delays LCP
   - Fix: lazy() + Suspense boundaries

5. **pdfjs-dist Not Code-Split**
   - 6.4MB minified, loaded on initial bundle
   - Fix: dynamic import when PDF preview opened

6. **Missing Test Coverage**
   - 0%: AdminPages.tsx, StudentPages.tsx, dashboard-api.ts
   - 48%: users.repository.ts
   - 33%: printing.repository.ts
   - Fix: Add tests to reach 80% minimum

### P3 - MEDIUM Priority

7. **Images Missing Dimensions**
   - Catalog covers, floor plans, avatars cause CLS
   - Fix: Add width/height or aspect-ratio CSS

8. **1-Second Polling Degrades INP**
   - useLiveQuery: 1s polling interval
   - Fix: Increase to 30-60s minimum

9. **Table Name Interpolation**
   - floor-plan.repository.ts interpolates table names
   - Fix: Add whitelist validation or enum

## Decisions Needed from Ethan

1. Should RLS be added to ALL tables or just user-data tables?
2. Should inventory preview endpoint be removed or hardened?
3. Is dynamic import for pdfjs-dist acceptable (changes user experience for PDF viewing)?
4. What is the priority for bringing test coverage to 80%?

## Open Questions

- PGlite devDependency for real-SQL RLS test (Ethan's call)
- Migration 035 renumbering for sign-in hardening