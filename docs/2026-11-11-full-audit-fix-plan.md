# StiOrmocLibrary Full Audit Fix Plan

**Status:** Draft — awaiting Ethan's approve/decline
**Date:** 2026-11-11
**Branch:** feat/durable-job-runner

---

## 1. Intent and Why

This plan documents all findings from 5 parallel audits (security, database, code review, test coverage, web performance) and provides actionable fixes. The changes address CRITICAL security vulnerabilities, bring test coverage to 80% minimum, and improve web performance metrics (LCP, CLS, INP).

---

## 2. Goals, Non-Goals, Anti-Goals

### Goals
- Fix all CRITICAL and HIGH severity findings
- Bring test coverage to ≥80% statement coverage
- Achieve Core Web Vitals: LCP ≤2.5s, CLS ≤0.1, INP ≤200ms
- Document architectural decisions for RLS strategy

### Non-Goals
- Do NOT push to live database without Ethan's go-ahead
- Do NOT merge to main without PR approval
- Do NOT deploy to Vercel without Ethan's go-ahead

### Anti-Goals (What Would Make This a Failure)
- Leaving RLS unimplemented on core tables
- Pushing untested code to production
- Missing the 80% coverage requirement
- Ignoring authentication vulnerabilities
- Incomplete CSRF protection on session-based endpoints
- Missing hybrid auth edge case tests

---

## 3. Constraints

- **Database:** Supabase Postgres only (MySQL retired 2026-11-10)
- **Branch policy:** One branch per change from `main` (`feat/<slug>`, `fix/<slug>`)
- **Test requirement:** 80% minimum coverage before PR
- **Review requirement:** security-reviewer + database-reviewer (if migrations) before each PR
- **Live systems:** No db:supabase, migrate-* without Ethan's go-ahead

---

## 4. The Parts of the How (Decisions Made)

### 4.1 Security Harden Fixes (fix/security-harden)

#### Fix 1: Move Rate Limiting Inside Auth Validation
**File:** `apps/api/src/app.js`
**Lines:** ~31-35
**Change:**
```javascript
// BEFORE: Rate limit before secret validation
const rateLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
});
app.use('/api/job-runner', rateLimiter, validateJobRunnerSecret);

// AFTER: Validate secret first, then rate limit
app.use('/api/job-runner', validateJobRunnerSecret, rateLimiter, (req, res, next) => { /* */ });
```

#### Fix 2: Kill or Guard Inventory Preview Endpoint
**File:** `apps/api/src/modules/inventory/inventory-preview.routes.ts`
**Lines:** 12-38
**Options:**
- **Option A:** Remove endpoint entirely (break if used)
- **Option B:** Add `if (env.inventoryPreviewEnabled !== 'true') return 404;` guard

#### Fix 3: Sanitize Error Logging
**File:** `apps/api/src/app.js`
**Lines:** 217
**Change:** Replace `console.error(error)` with structured sanitizer:
```javascript
import { cleanJobError } from './utils/error-sanitizer.js';
logger.error({ 
  message: error.message, 
  stack: cleanJobError(error).stack,
  requestId: req.id 
});
```

#### Fix 4: Validate CORS Origin
**File:** `apps/api/src/app.js`
**Lines:** 71
**Change:**
```javascript
// Add validation before using env.webOrigin
const validateOrigin = (origin) => {
  try { return new URL(origin).origin === env.webOrigin; }
  catch { return false; }
};
```

#### Fix 5: Add HTTPS Enforcement Check
**File:** `apps/api/src/modules/auth/auth.middleware.js`
**Lines:** 130-136
**Change:** Add explicit HTTPS check when `env.isProduction === true`:
```javascript
if (env.isProduction && !req.secure && req.header('x-forwarded-proto') !== 'https') {
  return res.status(403).json({ message: 'HTTPS required' });
}
```

#### Fix 6: Add Hybrid Auth Audit Logging
**File:** `apps/api/src/modules/auth/auth.middleware.js`
**Lines:** 54-105
**Change:** Add logging when both JWT and session auth present to detect/auth-confusion:
```javascript
if (req.headers.authorization?.startsWith('Bearer') && req.session?.user) {
  logger.warn({ 
    message: 'Hybrid auth detected',
    requestId: req.id,
    hasJwt: true,
    hasSession: true
  });
}
```

#### Fix 7: Minimize JWT Payload Claims
**File:** `apps/api/src/modules/auth/jwt-auth.service.ts`
**Lines:** 28-36
**Change:** Only include essential claims in JWT, remove schoolId if not needed for client:
```typescript
// BEFORE: Full user data in JWT
const payload = { 
  accountId, 
  schoolId, 
  role, 
  userId 
};

// AFTER: Minimal claims
const payload = { 
  userId,
  role 
};
// Derive accountId/schoolId from database when needed
```

### 4.2 Database RLS Policy Implementation (feat/rls-policies)

#### Migration: 035_rsl_hardening.sql
**Location:** `database/supabase/`

**Policies to create:**
```sql
-- Table: borrow_transactions
ALTER TABLE public.borrow_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user owns their borrows" ON public.borrow_transactions
  USING (
    user_id = auth.uid() 
    OR (SELECT role FROM users WHERE user_id = auth.uid()) IN ('librarian', 'admin')
  );

-- Table: reservations
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user owns their reservations" ON public.reservations
  USING (
    user_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM borrow_transactions bt 
      WHERE bt.physical_copy_id = reservations.physical_copy_id 
      AND bt.user_id = auth.uid() 
      AND bt.transaction_status = 'Borrowed'
    )
    OR (SELECT role FROM users WHERE user_id = auth.uid()) IN ('librarian', 'admin')
  );

-- Table: physical_copies (via borrow_transactions or reservations)
ALTER TABLE public.physical_copies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user can see assigned copy" ON public.physical_copies
  USING (
    EXISTS (SELECT 1 FROM borrow_transactions bt 
            WHERE bt.physical_copy_id = physical_copies.physical_copy_id 
            AND bt.user_id = auth.uid()
            AND bt.transaction_status = 'Borrowed')
    OR EXISTS (SELECT 1 FROM reservations r 
               WHERE r.assigned_physical_copy_id = physical_copies.physical_copy_id
               AND r.user_id = auth.uid()
               AND r.reservation_status = 'Active')
    OR (SELECT role FROM users WHERE user_id = auth.uid()) IN ('librarian', 'admin')
  );
```

### 4.3 Test Coverage Expansion (feat/test-80-percent)

#### Critical Files Needing Tests
1. `apps/web/src/pages/AdminPages.tsx` - 0% coverage
2. `apps/web/src/pages/StudentPages.tsx` - 0% coverage
3. `apps/api/src/routes/dashboard-api.ts` - 0% coverage
4. `apps/api/src/modules/users/users.repository.ts` - 48.73%
5. `apps/api/src/modules/printing/printing.repository.ts` - 33.98%

#### Test Files to Create
```bash
apps/web/src/pages/AdminPages.test.tsx       # React Testing Library
apps/web/src/pages/StudentPages.test.tsx     # React Testing Library
apps/api/src/routes/__tests__/dashboard-api.int.test.ts  # supertest
apps/api/src/modules/users/__tests__/users.repository.test.ts  # node:test
apps/api/src/modules/printing/__tests__/printing.repository.test.ts  # node:test
```

### 4.4 Web Performance Optimization (feat/web-performance)

#### Fix 1: Route-Level Code Splitting
**File:** `apps/web/src/App.tsx`
**Also:** Create centralized icons component to prevent lucide-react bloat

```tsx
// BEFORE: All routes sync imported
import StudentDashboard from './features/dashboard/StudentDashboard';
import AdminDashboard from './features/admin/AdminDashboard';
// ... 49 more imports

// AFTER: Lazy loading
import { lazy, Suspense } from 'react';

const StudentDashboard = lazy(() => import('./features/dashboard/StudentDashboard'));
const AdminDashboard = lazy(() => import('./features/admin/AdminDashboard'));

// In routes:
<Route path="/student/dashboard" element={
  <Suspense fallback={<LoadingSpinner />}>
    <StudentDashboard />
  </Suspense>
} />
```

**Additional:** Create `apps/web/src/components/icons.tsx` that imports only needed lucide icons, re-exporting them as components.

#### Fix 2: Dynamic PDF Viewer Import
**File:** `apps/web/src/components/SelectedFilePreview.tsx`

```tsx
// Already uses lazy() - verify it's correctly implemented
const PdfViewer = lazy(() => import('./PdfFilePreview'));

// Ensure Suspense boundary wraps it
<Suspense fallback={<PDFLoader />}>
  {file.type === 'pdf' && <PdfViewer file={file} />}
</Suspense>
```

#### Fix 3: Add Image Dimensions
**Files:** Multiple catalog/image components
**Fix:** Add `width` and `height` props or CSS `aspect-ratio`:

```tsx
// Catalog cover example
<img 
  src={coverUrl} 
  alt={`Cover of ${title}`} 
  width={150} 
  height={200}
  className="object-cover"
/>

// OR CSS aspect-ratio
<div className="aspect-[3/4] w-full">
  <img src={coverUrl} alt="" className="object-cover w-full h-full" />
</div>
```

#### Fix 4: Increase Polling Interval
**File:** `apps/web/src/hooks/useLiveQuery.ts`
**Line:** 3
**Change:**
```javascript
// BEFORE
LIVE_REFRESH_MS = 1_000

// AFTER
LIVE_REFRESH_MS = 30_000  // 30 seconds minimum
```

### 4.5 Floor Plan Table Interpolation Fix (fix/floor-plan-safety)

**File:** `apps/api/src/modules/floor-plan/floor-plan.repository.ts`
**Lines:** 50, 92, 96

**Option A: Whitelist validation**
```javascript
const ALLOWED_TABLES = ['physical_copies', 'materials', 'research_inventory', 'categories'];

function updateTableLocation(table, oldLabel, newLabel) {
  if (!ALLOWED_TABLES.includes(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  return c.execute(`UPDATE ${table} SET shelf_location=? WHERE shelf_location=?`, [newLabel, oldLabel]);
}
```

**Option B: Enum type** (if TypeScript allowed)
```typescript
type InventoryTable = 'physical_copies' | 'materials' | 'research_inventory' | 'categories';
```

---

## 5. Work Breakdown

### Phase 1: CRITICAL Security (ETA: 1-2 hours)
- [ ] Fix rate limiting order in job runner (app.js:31)
- [ ] Add auth guard to inventory preview or kill endpoint
- [ ] Sanitize console.error logging
- [ ] Verify no other unauthenticated endpoints

### Phase 2: Database RLS (ETA: 2-3 hours)
- [x] Create migration `035_rls_circulation_hardening.sql` (pending review, not applied; Part C sign-in hardening moves to `036`)
- [x] borrow_transactions, reservations, physical_copies: RLS on, `anon`/`authenticated` revoked, no user policies (the API's owner connection is the only reader, as in `034`; the `auth.uid()` policies in 4.2 are not used because the app does not sign users in through Supabase Auth)
- [x] Test RLS with PGlite: `apps/api/src/modules/circulation/rls-circulation-hardening.migration.test.ts` (runs twice, grants gone, owner still reads)
- [ ] database-reviewer pass before PR

### Phase 3: Test Coverage (ETA: 4-6 hours)
- [ ] Create AdminPages.test.tsx with 80%+ coverage
- [ ] Create StudentPages.test.tsx with 80%+ coverage
- [ ] Create dashboard-api.int.test.ts
- [ ] Add missing users.repository.ts tests
- [ ] Add missing printing.repository.ts tests
- [ ] Run coverage: ensure ≥80% statement coverage

### Phase 4: Web Performance (ETA: 2-3 hours)
- [x] Convert all route imports to lazy() + Suspense
- [x] Add width/height to all images (pdfjs-dist, SelectedFilePreview, DashboardQrPass, FloorPlanImagePage)
- [ ] Implement srcset for catalog covers
- [x] Increase useLiveQuery polling to 30s
- [ ] Test performance (bundle analyzer)

### Phase 5: Code Quality & Security Fixes (ETA: 2-4 hours)
- [x] Fix floor-plan table interpolation (SHELF_UPDATE_TABLES whitelist)
- [x] Centralize duplicate DUMMY_BCRYPT_HASH constant (env.js export)
- [ ] Add audit logging for borrow/returns/payments operations
- [ ] Add opaque error codes in production mode
- [ ] Validate CORS origin format
- [ ] Add HTTPS enforcement check for session cookies
- [ ] Add hybrid auth audit logging
- [ ] Minimize JWT payload claims (remove schoolId)
- [ ] Add per-user storage quotas for uploads
- [ ] Document RLS strategy decision

---

## 6. Verification

### Before Merge Checklist
- [ ] All CRITICAL findings fixed
- [ ] All HIGH findings fixed
- [ ] Test coverage ≥80% (run `npm run coverage`)
- [ ] Build passes (`npm run build`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Security reviewer approves diff (`git diff main...HEAD`)
- [ ] Database reviewer approves any migrations
- [ ] Run `npm test` - all tests pass

---

## 7. Questions for Ethan

1. **RLS Strategy:** Should RLS be added to ALL tables, or just user-data tables (borrow_transactions, reservations, physical_copies)?
2. **Inventory Preview:** Should we remove it entirely or add a production-only guard?
3. **Test Coverage Priority:** Focus on 0% files first, or spread evenly across all modules?
4. **Migration 035:** Should sign-in hardening move to this same migration, or keep separate?
5. **PGlite RLS Test:** Should we add PGlite devDependency for real-SQL RLS testing in CI?
6. **Audit Logs:** Should we add audit logging for all sensitive operations (borrow/returns/payments)?
7. **HTTPS Dev Setup:** How should HTTPS enforcement be handled in local development?
8. **Icon Management:** Should we create a centralized icon component to prevent lucide-react bloat?
9. **JWT Claims:** Should we minimize JWT payload to only essential claims (remove schoolId)?

---

## 8. Risks

1. **Data Loss:** RLS policies could lock out admins if misconfigured - test in staging first
2. **Breaking Changes:** Route code splitting may break existing deep links - test thoroughly
3. **Coverage Regression:** Adding tests may increase lines but should maintain coverage percentages
4. **Session Security:** HTTPS enforcement and cookie security fixes may affect dev environment setup
5. **Storage Quotas:** Adding upload limits may affect existing user files - needs migration plan