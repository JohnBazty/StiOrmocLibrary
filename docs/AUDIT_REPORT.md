# Full Audit Report - StiOrmocLibrary

**Date:** 2026-11-11
**Branch:** feat/durable-job-runner
**Audits performed:** Security, Database, Code Review, Test Coverage, Web Performance

---

## Executive Summary

| Audit | Status | Critical Issues | High Issues | Medium Issues | Low Issues |
|-------|--------|-----------------|-------------|---------------|------------|
| Security | ⚠️ ACTION REQUIRED | 0 | 4 | 6 | 4 |
| Database | ⚠️ ACTION REQUIRED | 1 | 0 | 1 | 0 |
| Test Coverage | ❌ BELOW THRESHOLD | - | - | - | - |
| Web Performance | ⚠️ ACTION REQUIRED | 3 | 3 | 4 | 5 |
| Code Review | ✅ APPROVED | 0 | 0 | 0 | 0 |

---

## 1. Security Audit (agent-skills:security-auditor)

### Summary
- Critical: 0
- High: 4
- Medium: 6
- Low: 4

### CRITICAL Issues
None found.

### HIGH Issues

**1. Unauthenticated Rate Limiting DoS**
- **Location:** `apps/api/src/app.js:31` and `job-runner.routes.ts:11-31`
- **Issue:** Rate limiting (30 req/min) applied before secret validation
- **Impact:** DoS through excessive job runner API calls
- **Fix:** Add secondary rate limit after successful auth

**2. Dynamic Table Interpolation (SQL Injection Risk)**
- **Location:** `/apps/api/src/modules/floor-plan/floor-plan.repository.ts:50`
- **Issue:** Table names interpolated directly in SQL UPDATE statements
- **Impact:** Potential SQL injection if validation logic changes
- **Fix:** Use whitelist validation, document as intentional pattern or use enum

**3. Session Fixation in Inventory Preview**
- **Location:** `inventory-preview.routes.ts:12-38`
- **Issue:** Creates fully authenticated admin session without CSRF validation
- **Impact:** Full administrative compromise if enabled in production
- **Fix:** Ensure `inventoryPreviewEnabled` never true in prod, add server checks

**4. Inconsistent CSRF Protection**
- **Location:** `auth.middleware.js:54-105`
- **Issue:** Hybrid JWT/session auth has untested edge cases
- **Impact:** CSRF bypass through auth confusion
- **Fix:** Add explicit tests for hybrid auth, log when both present

### MEDIUM Issues

**5. Error Messages Leak Sensitive Information**
- **Location:** `app.js:217`
- **Issue:** Full error objects logged via `console.error(error)`
- **Fix:** Implement structured error logging with sanitization

**6. CORS Configuration Unvalidated**
- **Location:** `app.js:71`
- **Issue:** `env.webOrigin` no format validation
- **Fix:** Validate origin format, use allowlist

**7. No Per-User Storage Quota**
- **Location:** `profile-avatar.routes.ts:62-97`
- **Issue:** Authenticated users can upload unlimited files
- **Fix:** Implement per-user quotas and upload rate limits

**8. JWT Token Contains Plaintext Attributes**
- **Location:** `jwt-auth.service.ts:28-36`
- **Issue:** accountId, schoolId, role in plaintext JWT
- **Fix:** Ensure 32+ char cryptographically random secret

**9. Session Cookie HTTPS Not Enforced**
- **Location:** `auth.middleware.js:130-136`
- **Issue:** HTTPS check relies only on `env.isProduction`
- **Fix:** Add explicit HTTPS enforcement checks

### LOW Issues

**10. Duplicate Password Hash Constants**
- **Location:** `auth.service.ts:16` and `jwt-auth.service.ts:16`
- **Fix:** Centralize in shared helper

**11. Missing Audit Logging**
- **Location:** Various modules
- **Fix:** Add audit logs for borrow/returns/payments

**12. Error Code Enumeration**
- **Location:** `app.js:195-200`
- **Fix:** Use opaque identifiers in production

---

## 2. Database Audit (database-reviewer)

### Summary

| Check | Status |
|-------|--------|
| Parameterized queries | ✅ |
| Transaction management | ✅ |
| N+1 patterns | ✅ None |
| Pagination | ✅ |
| Indexes on FK columns | ✅ |
| Data types | ✅ |
| **RLS on core tables** | ⚠️ ONLY JOB TABLES |

### CRITICAL Issues

**1. No Row-Level Security on Core Tables**
- **Issue:** RLS only enabled on job tables (migration 034)
- **Missing on:** `borrow_transactions`, `reservations`, `materials`, `physical_copies`
- **Fix:** Implement RLS policies:
```sql
-- Example for borrow_transactions
ALTER TABLE public.borrow_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_own_borrows 
  USING (user_id = auth.uid());
```

**2. Table Name Interpolation**
- **Location:** `floor-plan.repository.ts`
- **Issue:** Direct table interpolation in SQL
- **Fix:** Document whitelist pattern or use enum validation

---

## 3. Test Coverage Audit (agent-skills:test-engineer)

### Summary
- **API:** 69.82% statements (below 80% minimum)
- **Web:** 56.76% statements (below 80% minimum)

### Coverage by Metric

| Metric | API | Web | Requirement |
|--------|-----|-----|-------------|
| Statements | 69.82% | 56.76% | ≥80% |
| Branches | 54.22% | 54.22% | ≥80% |
| Functions | 48.62% | 48.62% | ≥80% |
| Lines | 63.26% | 63.26% | ≥80% |

### CRITICAL Gaps - 0% Coverage

| File | Priority |
|------|----------|
| `AdminPages.tsx` | CRITICAL |
| `StudentPages.tsx` | CRITICAL |
| `dashboard-api.ts` | CRITICAL |
| `invoice-api.ts` | HIGH |
| `fines-api.ts` | HIGH |

### Repository Coverage

| File | Coverage | Priority |
|------|----------|----------|
| `users.repository.ts` | 48.73% | HIGH |
| `printing.repository.ts` | 33.98% | CRITICAL |
| `invoice.service.ts` | 42.75% | HIGH |
| `notification.repository.ts` | 58.88% | MEDIUM |
| `inventory.repository.ts` | 57.32% | MEDIUM |

---

## 4. Web Performance Audit (agent-skills:web-performance-auditor)

### Scorecard
- **LCP:** not measured (source analysis only)
- **INP:** not measured 
- **CLS:** not measured

### CRITICAL Issues

**1. No Route-Level Code Splitting**
- **Location:** `apps/web/src/App.tsx:1-51`
- **Issue:** All 51 routes sync imported
- **Impact:** 200-400KB initial bundle bloat
- **Fix:**
```tsx
const StudentDashboard = lazy(() => import('./features/dashboard/StudentDashboard'))
<Route path="/student/dashboard" element={
  <Suspense fallback={<div>Loading...</div>}>
    <StudentDashboard />
  </Suspense>
} />
```

**2. Images Without Dimensions**
- **Location:** Multiple files
- **Issue:** Missing width/height causes CLS
- **Fix:** Add dimensions or CSS `aspect-ratio`

**3. Large PDF Library Not Code-Split**
- **Location:** `package.json:18` - `pdfjs-dist: ^6.4.299` (~6.4MB)
- **Fix:** Dynamic import only when PDF preview opened

### HIGH Issues

**4. 1-Second Polling Interval**
- **Location:** `useLiveQuery.ts:3`
- **Issue:** `LIVE_REFRESH_MS = 1_000` degrades INP
- **Fix:** Increase to 30-60 seconds

**5. No Srcset/Sizes on Images**
- **Fix:** Add responsive image attributes

**6. CategoryFilterSearchBar Missing Cache**
- **Location:** `CategoryFilterSearchBar.tsx:69-76`
- **Fix:** Cache in localStorage with TTL

---

## 5. Code Review (agent-skills:code-reviewer)

### Verdict: ✅ APPROVE

**Key findings:**
- 38 new tests pass
- TypeScript compiles cleanly
- Security checks verified
- No critical issues

**Optional improvements:**
1. Extract `32` to shared constant (env.js:58)
2. Document D5 24-hour print notice limit (notification.worker.ts:97-99)
3. Clarify `'cursor' in output` check (job-runner.service.ts:49)

---

## Recommended Fix Order

### Phase 1 - CRITICAL (Blockers)
1. Add RLS policies on core circulation tables
2. Implement route-level code splitting
3. Add img dimensions for CLS fix
4. Fix rate limiting order (auth before limit check)

### Phase 2 - HIGH Priority
1. Dynamic import pdfjs-dist
2. Increase polling interval to 30s
3. Add srcset/sizes to images
4. Fix session fixation in inventory preview
5. Add test coverage for 0% files

### Phase 3 - MEDIUM/LOW
1. Storage quotas for avatar uploads
2. Error logging sanitization
3. Consolidate timers
4. CORS validation

---

## Files Modified on Branch

```
.claude/agents/library-builder.md (M)
.claude/agents/plan-verifier.md (M)
.gitignore (M)
AGENTS.md (M)
CLAUDE.md (M)
.claude/agents/library-gap-analyst.md (new)
.handoff/ (new directory)
docs/rea-comparison-report.md (new)
```

---

## Summary by Team Member

> For Ethan's review: Remaining Phase 5 items need decisions before production deployment:
> 1. Audit logging for borrow/returns/payments - need Ethan's decision (Q6 in fix plan)
> 2. HTTPS enforcement dev setup - need Ethan's decision (Q7 in fix plan)  
> 3. JWT payload minimization - need Ethan's decision (Q9 in fix plan)
> 
> Fixed items awaiting Ethan's review:
> - Floor-plan SQL injection via SHELF_UPDATE_TABLES whitelist
> - DUMMY_BCRYPT_HASH centralized in env.js
> - Inventory preview hard production guard already in place
> - Rate limiting order (auth before limit check applied before secret validation)
> - Error sanitization via sanitizeStackTrace() function
> - Route-level code splitting implemented
> - Image dimensions added
> - useLiveQuery polling increased to 30s