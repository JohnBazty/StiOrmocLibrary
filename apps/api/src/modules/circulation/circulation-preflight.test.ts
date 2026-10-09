import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import {
  assertTokenMatchesEvaluation,
  evaluateCheckoutRules,
  signPreflightToken,
  verifyPreflightToken,
  type CheckoutEvaluationContext,
} from './circulation-preflight.ts'

function baseContext(overrides: Partial<CheckoutEvaluationContext> = {}): CheckoutEvaluationContext {
  return {
    flow: 'walk_in',
    borrower: {
      found: true, userId: 7, schoolId: 'STI-7', name: 'Test Borrower', role: 'Student', accountStatus: 'Active',
    },
    copy: {
      found: true, physicalCopyId: 20, barcode: 'BOOK-20', accessionNumber: 'ACC-20', title: 'Clean Code',
      condition: 'Good', availability: 'Available', lifecycleStatus: 'Active', materialId: 30, materialType: 'Book', titleId: 10,
    },
    openLoan: null,
    queueHead: null,
    selectedReservationId: null,
    studentActiveTitleCount: 0,
    targetTitleAlreadyActive: false,
    borrowerActiveOrOverdueCount: 0,
    borrowedAt: new Date(2026, 7, 24, 14, 0),
    closedDates: new Set(),
    ...overrides,
  }
}

test('active student and available Good copy produce Ready', () => {
  const result = evaluateCheckoutRules(baseContext())
  assert.equal(result.decision, 'ready')
  assert.equal(result.blockers.length, 0)
  assert.equal(result.warnings.length, 0)
})

test('student at the two-book limit receives a blocker', () => {
  const result = evaluateCheckoutRules(baseContext({ studentActiveTitleCount: 2 }))
  assert.equal(result.decision, 'blocked')
  assert.equal(result.blockers[0]?.code, 'STUDENT_LIMIT')
})

test('faculty bypasses the student limit', () => {
  const result = evaluateCheckoutRules(baseContext({
    borrower: { found: true, userId: 7, schoolId: 'STI-7', name: 'Faculty', role: 'Faculty', accountStatus: 'Active' },
    studentActiveTitleCount: 12,
  }))
  assert.equal(result.decision, 'ready')
})

test('Lost copy is blocked', () => {
  const result = evaluateCheckoutRules(baseContext({
    copy: { ...baseContext().copy, condition: 'Lost', availability: 'Unavailable' },
  }))
  assert.ok(result.blockers.some((item) => item.code === 'COPY_LOST'))
})

test('Unavailable copy is blocked', () => {
  const result = evaluateCheckoutRules(baseContext({
    copy: { ...baseContext().copy, availability: 'Unavailable' },
  }))
  assert.ok(result.blockers.some((item) => item.code === 'COPY_UNAVAILABLE'))
})

test('archived copy is blocked', () => {
  const result = evaluateCheckoutRules(baseContext({
    copy: { ...baseContext().copy, lifecycleStatus: 'Archived' },
  }))
  assert.equal(result.blockers[0]?.code, 'COPY_NOT_FOUND')
})

test('For Repair copy is blocked', () => {
  const result = evaluateCheckoutRules(baseContext({
    copy: { ...baseContext().copy, condition: 'For Repair' },
  }))
  assert.ok(result.blockers.some((item) => item.code === 'COPY_FOR_REPAIR'))
})

test('Damaged and Available copy requires confirmation', () => {
  const result = evaluateCheckoutRules(baseContext({
    copy: { ...baseContext().copy, condition: 'Damaged' },
  }))
  assert.equal(result.decision, 'confirmation_required')
  assert.equal(result.warnings[0]?.code, 'COPY_DAMAGED')
})

test('Fair copy creates an alert', () => {
  const result = evaluateCheckoutRules(baseContext({
    copy: { ...baseContext().copy, condition: 'Fair' },
  }))
  assert.equal(result.decision, 'ready')
  assert.ok(result.alerts.some((item) => item.code === 'CONDITION_FAIR'))
})

test('another user’s pending claim is blocked', () => {
  const result = evaluateCheckoutRules(baseContext({
    openLoan: { transactionId: 1, userId: 99, status: 'Pending', reservationId: null, requestGroupId: null },
  }))
  assert.ok(result.blockers.some((item) => item.code === 'COPY_PENDING_OTHER'))
})

test('reservation queue priority is enforced', () => {
  const result = evaluateCheckoutRules(baseContext({
    queueHead: { reservationId: 5, userId: 99, status: 'pending' },
  }))
  assert.ok(result.blockers.some((item) => item.code === 'QUEUE_PRIORITY_LOCKED'))
})

test('final borrowing slot creates an alert', () => {
  const result = evaluateCheckoutRules(baseContext({ studentActiveTitleCount: 1 }))
  assert.ok(result.alerts.some((item) => item.code === 'FINAL_SLOT'))
})

test('Sunday due dates are adjusted and alerted', () => {
  // Saturday 2026-08-22 -> calendar Sunday, operating Monday
  const result = evaluateCheckoutRules(baseContext({ borrowedAt: new Date(2026, 7, 22, 14, 0) }))
  assert.equal(result.dueDateAdjusted, true)
  assert.ok(result.alerts.some((item) => item.code === 'DUE_DATE_ADJUSTED'))
  assert.equal(result.dueAt.getDay(), 1)
})

test('preflight token signs and verifies with matching claims', () => {
  const secret = 'test-circulation-preflight-secret-32chars!!'
  const signed = signPreflightToken({
    accountId: 3, borrowerUserId: 7, physicalCopyId: 20, reservationId: null,
    flow: 'walk_in', warningCodes: ['COPY_DAMAGED'], secret, expiresInSeconds: 120,
  })
  const claims = verifyPreflightToken(signed.token, secret)
  assert.equal(claims.accountId, 3)
  assert.equal(claims.borrowerUserId, 7)
  assert.equal(claims.physicalCopyId, 20)
  assert.equal(claims.flow, 'walk_in')
  assert.deepEqual(claims.warningCodes, ['COPY_DAMAGED'])
  assert.equal(claims.jti, signed.decisionId)
})

test('expired and modified tokens are rejected', async () => {
  const secret = 'test-circulation-preflight-secret-32chars!!'
  const { default: jwt } = await import('jsonwebtoken')
  const expired = jwt.sign(
    { purpose: 'circulation_preflight', accountId: 3, borrowerUserId: 7, physicalCopyId: 20, reservationId: null, flow: 'walk_in', warningCodes: [] },
    secret,
    { algorithm: 'HS256', expiresIn: -10, audience: 'circulation-preflight', issuer: 'sti-ormoc-smart-library-api', subject: '3', jwtid: 'expired-jti' },
  )
  assert.throws(() => verifyPreflightToken(expired, secret), (error: unknown) => (
    error instanceof HttpError && error.code === 'CIRCULATION_PREFLIGHT_TOKEN_EXPIRED'
  ))
  const valid = signPreflightToken({
    accountId: 3, borrowerUserId: 7, physicalCopyId: 20, reservationId: null,
    flow: 'walk_in', warningCodes: ['COPY_DAMAGED'], secret,
  })
  assert.throws(() => verifyPreflightToken(`${valid.token}x`, secret), (error: unknown) => (
    error instanceof HttpError && error.code === 'CIRCULATION_PREFLIGHT_TOKEN_INVALID'
  ))
})

test('token mismatch and missing override reason stop confirmation', () => {
  const secret = 'test-circulation-preflight-secret-32chars!!'
  const evaluation = evaluateCheckoutRules(baseContext({
    copy: { ...baseContext().copy, condition: 'Damaged' },
  }))
  const signed = signPreflightToken({
    accountId: 3, borrowerUserId: 7, physicalCopyId: 20, reservationId: null,
    flow: 'walk_in', warningCodes: ['COPY_DAMAGED'], secret,
  })
  assert.throws(() => assertTokenMatchesEvaluation({
    token: signed.token, overrideReason: 'Cover worn but pages intact.',
    accountId: 9, borrowerUserId: 7, physicalCopyId: 20, reservationId: null,
    flow: 'walk_in', evaluation, secret,
  }), (error: unknown) => error instanceof HttpError && error.code === 'CIRCULATION_PREFLIGHT_TOKEN_MISMATCH')

  assert.throws(() => assertTokenMatchesEvaluation({
    token: undefined, overrideReason: undefined,
    accountId: 3, borrowerUserId: 7, physicalCopyId: 20, reservationId: null,
    flow: 'walk_in', evaluation, secret,
  }), (error: unknown) => error instanceof HttpError && error.code === 'CIRCULATION_CONFIRMATION_REQUIRED')

  assert.throws(() => assertTokenMatchesEvaluation({
    token: signed.token, overrideReason: 'short',
    accountId: 3, borrowerUserId: 7, physicalCopyId: 20, reservationId: null,
    flow: 'walk_in', evaluation, secret,
  }), (error: unknown) => error instanceof HttpError && error.code === 'CIRCULATION_VALIDATION_FAILED')

  const ok = assertTokenMatchesEvaluation({
    token: signed.token, overrideReason: 'Cover worn but pages and binding are usable.',
    accountId: 3, borrowerUserId: 7, physicalCopyId: 20, reservationId: null,
    flow: 'walk_in', evaluation, secret,
  })
  assert.equal(ok.decisionId, signed.decisionId)
  assert.ok((ok.overrideReason ?? '').length >= 10)
})
