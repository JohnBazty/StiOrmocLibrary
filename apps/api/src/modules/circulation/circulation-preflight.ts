import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { calculateOperatingDueDate } from './due-date.ts'
import {
  isMaterialBorrowable,
  roleBookLimit,
  type BorrowingPolicyVersion,
} from './borrowing-policy.types.ts'

export const LEGACY_BORROWING_POLICY: BorrowingPolicyVersion = {
  versionId: 1,
  effectiveOn: '2000-01-01',
  studentMaxActiveBooks: 2,
  facultyMaxActiveBooks: null,
  borrowingDays: 1,
  dueTimeCutoff: '08:59:00',
  maxRenewals: 1,
  renewalExtensionDays: 1,
  studentMaxActiveReservations: 2,
  facultyMaxActiveReservations: null,
  blockRenewalIfOverdue: true,
  blockRenewalIfUnpaidFines: true,
  blockRenewalIfReserved: true,
  longOverdueAfterDays: null,
  changeReason: 'Legacy baseline reflecting behavior before configurable borrowing policies.',
  createdByUserId: null,
  createdAt: '2000-01-01T00:00:00.000Z',
  materialRules: [
    { materialType: 'Book', isBorrowable: true },
    { materialType: 'Thesis/Manuscript', isBorrowable: false },
  ],
}

export const PREFLIGHT_PURPOSE = 'circulation_preflight'
export const PREFLIGHT_AUDIENCE = 'circulation-preflight'
export const PREFLIGHT_TTL_SECONDS = 120
export const OVERRIDE_REASON_MIN = 10
export const OVERRIDE_REASON_MAX = 500

export type CheckoutFlow = 'claim' | 'walk_in'
export type PreflightDecision = 'ready' | 'confirmation_required' | 'blocked'

export type PreflightFinding = {
  code: string
  message: string
  httpCode?: string
  httpStatus?: number
}

export type CheckoutEvaluationContext = {
  flow: CheckoutFlow
  borrower: {
    found: boolean
    userId: number | null
    schoolId: string | null
    name: string | null
    role: string | null
    accountStatus: string | null
  }
  copy: {
    found: boolean
    physicalCopyId: number | null
    barcode: string | null
    accessionNumber: string | null
    title: string | null
    condition: string | null
    availability: string | null
    lifecycleStatus: string | null
    materialId: number | null
    materialType: string | null
    titleId: number | null
  }
  openLoan: {
    transactionId: number
    userId: number
    status: string
    reservationId: number | null
    requestGroupId: string | null
  } | null
  queueHead: {
    reservationId: number
    userId: number
    status: string
  } | null
  selectedReservationId: number | null
  studentActiveTitleCount: number
  targetTitleAlreadyActive: boolean
  borrowerActiveOrOverdueCount: number
  borrowedAt: Date
  closedDates: ReadonlySet<string>
}

export type CheckoutEvaluation = {
  decision: PreflightDecision
  blockers: PreflightFinding[]
  warnings: PreflightFinding[]
  alerts: PreflightFinding[]
  dueAt: Date
  dueDateAdjusted: boolean
  pendingClaim: CheckoutEvaluationContext['openLoan'] | null
  fulfilledReservationId: number | null
  policyVersionId: number
}

type PreflightTokenClaims = {
  purpose: typeof PREFLIGHT_PURPOSE
  accountId: number
  borrowerUserId: number
  physicalCopyId: number
  reservationId: number | null
  flow: CheckoutFlow
  warningCodes: string[]
  policyVersionId: number
  jti: string
}

function finding(code: string, message: string, httpCode?: string, httpStatus = 422): PreflightFinding {
  return { code, message, httpCode, httpStatus }
}

function localDateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function nextCalendarDueDate(borrowedAt: Date, borrowingDays: number, cutoff: string) {
  const due = new Date(borrowedAt)
  due.setDate(due.getDate() + Math.max(1, borrowingDays))
  const [hourText, minuteText] = cutoff.split(':')
  due.setHours(Number(hourText), Number(minuteText), 0, 0)
  return due
}

export function sortedWarningCodes(warnings: ReadonlyArray<PreflightFinding>) {
  return [...new Set(warnings.map((item) => item.code))].sort()
}

export function decideFromFindings(blockers: PreflightFinding[], warnings: PreflightFinding[]): PreflightDecision {
  if (blockers.length > 0) return 'blocked'
  if (warnings.length > 0) return 'confirmation_required'
  return 'ready'
}

export function evaluateCheckoutRules(
  context: CheckoutEvaluationContext,
  policy: BorrowingPolicyVersion = LEGACY_BORROWING_POLICY,
): CheckoutEvaluation {
  const blockers: PreflightFinding[] = []
  const warnings: PreflightFinding[] = []
  const alerts: PreflightFinding[] = []
  const dueAt = calculateOperatingDueDate(
    context.borrowedAt,
    policy.borrowingDays,
    policy.dueTimeCutoff,
    context.closedDates,
  )
  const calendarDue = nextCalendarDueDate(context.borrowedAt, policy.borrowingDays, policy.dueTimeCutoff)
  const dueDateAdjusted = localDateKey(dueAt) !== localDateKey(calendarDue)
  const bookLimit = roleBookLimit(policy, context.borrower.role)

  if (!context.borrower.found) {
    blockers.push(finding('BORROWER_NOT_FOUND', 'The borrower account was not found.', 'CIRCULATION_BORROWER_NOT_FOUND', 404))
  } else if (context.borrower.accountStatus !== 'Active') {
    blockers.push(finding('ACCOUNT_INACTIVE', 'This account is not active and cannot borrow materials.', 'CIRCULATION_ACCOUNT_BLOCKED'))
  }

  if (!context.copy.found || context.copy.lifecycleStatus !== 'Active') {
    blockers.push(finding('COPY_NOT_FOUND', 'No active physical copy matches this barcode.', 'CIRCULATION_COPY_NOT_FOUND', 404))
  } else {
    if (context.copy.materialType && !isMaterialBorrowable(policy, context.copy.materialType)) {
      blockers.push(finding('RESEARCH_VIEW_ONLY', 'This material type cannot be borrowed under the active policy.', 'RESEARCH_VIEW_ONLY'))
    }
    if (!context.copy.materialId) {
      blockers.push(finding('COPY_NOT_LINKED', 'This copy is not linked to the circulation material ledger.', 'CIRCULATION_COPY_NOT_LINKED'))
    }
    if (String(context.copy.condition) === 'Lost') {
      blockers.push(finding('COPY_LOST', 'This physical copy is marked Lost and cannot be checked out.', 'CIRCULATION_COPY_UNAVAILABLE'))
    }
    if (context.copy.availability === 'Unavailable') {
      blockers.push(finding('COPY_UNAVAILABLE', 'This physical copy is unavailable for checkout.', 'CIRCULATION_COPY_UNAVAILABLE'))
    }
    if (String(context.copy.condition) === 'For Repair') {
      blockers.push(finding('COPY_FOR_REPAIR', 'This physical copy is marked For Repair and cannot be checked out.', 'CIRCULATION_COPY_FOR_REPAIR'))
    }
  }

  const pendingClaim = context.openLoan?.status === 'Pending' ? context.openLoan : null
  if (context.openLoan && !pendingClaim) {
    blockers.push(finding('COPY_ALREADY_BORROWED', 'This physical copy already has an active borrowing transaction.', 'CIRCULATION_COPY_ALREADY_BORROWED'))
  }
  if (pendingClaim && context.borrower.found && Number(pendingClaim.userId) !== Number(context.borrower.userId)) {
    blockers.push(finding(
      'COPY_PENDING_OTHER',
      'This copy is held for another user’s pending claim request.',
      'CIRCULATION_COPY_PENDING_FOR_ANOTHER_USER',
    ))
  }
  if (context.flow === 'claim' && !pendingClaim) {
    blockers.push(finding(
      'PENDING_CLAIM_NOT_FOUND',
      'This borrower and barcode do not match a pending counter claim.',
      'CIRCULATION_PENDING_CLAIM_NOT_FOUND',
    ))
  }
  if (context.flow === 'claim' && pendingClaim?.reservationId && (
    !context.queueHead
    || Number(context.queueHead.reservationId) !== Number(pendingClaim.reservationId)
    || context.queueHead.status !== 'ready_for_pickup'
  )) {
    blockers.push(finding(
      'RESERVATION_CLAIM_NOT_READY',
      'The linked reservation is not ready for physical pickup verification.',
      'CIRCULATION_RESERVATION_CLAIM_NOT_READY',
    ))
  }
  if (context.queueHead && context.borrower.found && Number(context.queueHead.userId) !== Number(context.borrower.userId)) {
    blockers.push(finding(
      'QUEUE_PRIORITY_LOCKED',
      'This title is reserved for the first user in the waiting queue.',
      'CIRCULATION_QUEUE_PRIORITY_LOCKED',
    ))
  }
  if (context.selectedReservationId && (
    !context.queueHead || Number(context.queueHead.reservationId) !== context.selectedReservationId
  )) {
    blockers.push(finding(
      'RESERVATION_NOT_FIRST',
      'The selected reservation is not currently first in the queue.',
      'CIRCULATION_RESERVATION_NOT_FIRST',
    ))
  }
  if (context.borrower.found && bookLimit !== null
    && context.studentActiveTitleCount >= bookLimit && !context.targetTitleAlreadyActive) {
    blockers.push(finding(
      'STUDENT_LIMIT',
      `Transaction Blocked: ${context.borrower.role} cannot exceed ${bookLimit} books`,
      'STUDENT_BORROW_LIMIT_REACHED',
    ))
  }

  if (blockers.length === 0 && context.copy.found
    && String(context.copy.condition) === 'Damaged'
    && context.copy.availability === 'Available') {
    warnings.push(finding('COPY_DAMAGED', 'This copy is marked Damaged. Confirm that it is safe to lend.'))
  }

  if (blockers.length === 0 && context.copy.found && String(context.copy.condition) === 'Fair') {
    alerts.push(finding('CONDITION_FAIR', 'Copy condition is Fair.'))
  }
  if (blockers.length === 0 && context.borrower.found && bookLimit !== null
    && !context.targetTitleAlreadyActive
    && context.studentActiveTitleCount === bookLimit - 1) {
    alerts.push(finding('FINAL_SLOT', 'This checkout will use the borrower’s final available borrowing slot.'))
  }
  if (blockers.length === 0 && pendingClaim?.reservationId && context.queueHead
    && Number(context.queueHead.reservationId) === Number(pendingClaim.reservationId)) {
    alerts.push(finding('CLAIM_FROM_RESERVATION', 'The copy is being claimed from an existing reservation.'))
  }
  if (blockers.length === 0 && context.borrowerActiveOrOverdueCount > 0) {
    alerts.push(finding('ACTIVE_OR_OVERDUE_BOOK', 'The borrower already has another active or overdue book.'))
  }
  if (blockers.length === 0 && dueDateAdjusted) {
    alerts.push(finding('DUE_DATE_ADJUSTED', 'The calculated due date was moved because of Sunday or a configured closure.'))
  }

  const fulfilledReservationId = pendingClaim?.reservationId && context.queueHead
    && Number(context.queueHead.reservationId) === Number(pendingClaim.reservationId)
    ? Number(context.queueHead.reservationId)
    : null

  return {
    decision: decideFromFindings(blockers, warnings),
    blockers,
    warnings,
    alerts,
    dueAt,
    dueDateAdjusted,
    pendingClaim,
    fulfilledReservationId,
    policyVersionId: policy.versionId,
  }
}

export function throwFirstBlocker(evaluation: CheckoutEvaluation, limit: number | null = null): void {
  const blocker = evaluation.blockers[0]
  if (!blocker) return
  throw new HttpError(
    blocker.httpStatus ?? 422,
    blocker.httpCode ?? 'CIRCULATION_VALIDATION_FAILED',
    blocker.message,
    blocker.code === 'STUDENT_LIMIT' ? { limit } : undefined,
  )
}

export function signPreflightToken(input: {
  accountId: number
  borrowerUserId: number
  physicalCopyId: number
  reservationId: number | null
  flow: CheckoutFlow
  warningCodes: string[]
  policyVersionId: number
  expiresInSeconds?: number
  secret?: string
}) {
  const jti = randomUUID()
  const expiresIn = input.expiresInSeconds ?? PREFLIGHT_TTL_SECONDS
  const secret = input.secret ?? env.jwt.secret
  const warningCodes = [...input.warningCodes].sort()
  const token = jwt.sign(
    {
      purpose: PREFLIGHT_PURPOSE,
      accountId: input.accountId,
      borrowerUserId: input.borrowerUserId,
      physicalCopyId: input.physicalCopyId,
      reservationId: input.reservationId,
      flow: input.flow,
      warningCodes,
      policyVersionId: input.policyVersionId,
    },
    secret,
    {
      algorithm: 'HS256',
      expiresIn,
      audience: PREFLIGHT_AUDIENCE,
      issuer: env.jwt.issuer,
      subject: String(input.accountId),
      jwtid: jti,
    },
  )
  const expiresAt = new Date((Math.floor(Date.now() / 1000) + expiresIn) * 1000)
  return { token, expiresAt, decisionId: jti, warningCodes }
}

export function verifyPreflightToken(token: string, secret = env.jwt.secret): PreflightTokenClaims {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      audience: PREFLIGHT_AUDIENCE,
      issuer: env.jwt.issuer,
    }) as jwt.JwtPayload
    if (payload.purpose !== PREFLIGHT_PURPOSE) {
      throw new HttpError(422, 'CIRCULATION_PREFLIGHT_TOKEN_INVALID', 'The preflight confirmation token is invalid.')
    }
    const accountId = Number(payload.accountId)
    const borrowerUserId = Number(payload.borrowerUserId)
    const physicalCopyId = Number(payload.physicalCopyId)
    const policyVersionId = Number(payload.policyVersionId)
    const flow = payload.flow
    if (!Number.isSafeInteger(accountId) || accountId < 1
      || !Number.isSafeInteger(borrowerUserId) || borrowerUserId < 1
      || !Number.isSafeInteger(physicalCopyId) || physicalCopyId < 1
      || !Number.isSafeInteger(policyVersionId) || policyVersionId < 1
      || (flow !== 'claim' && flow !== 'walk_in')
      || !Array.isArray(payload.warningCodes)
      || typeof payload.jti !== 'string') {
      throw new HttpError(422, 'CIRCULATION_PREFLIGHT_TOKEN_INVALID', 'The preflight confirmation token is invalid.')
    }
    const reservationId = payload.reservationId === null || payload.reservationId === undefined
      ? null
      : Number(payload.reservationId)
    if (reservationId !== null && (!Number.isSafeInteger(reservationId) || reservationId < 1)) {
      throw new HttpError(422, 'CIRCULATION_PREFLIGHT_TOKEN_INVALID', 'The preflight confirmation token is invalid.')
    }
    return {
      purpose: PREFLIGHT_PURPOSE,
      accountId,
      borrowerUserId,
      physicalCopyId,
      reservationId,
      flow,
      warningCodes: payload.warningCodes.map(String).sort(),
      policyVersionId,
      jti: payload.jti,
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error instanceof jwt.TokenExpiredError) {
      throw new HttpError(422, 'CIRCULATION_PREFLIGHT_TOKEN_EXPIRED', 'The preflight confirmation expired. Run preflight again.')
    }
    throw new HttpError(422, 'CIRCULATION_PREFLIGHT_TOKEN_INVALID', 'The preflight confirmation token is invalid.')
  }
}

export function assertOverrideReason(reason: string | null | undefined, requiresReason: boolean) {
  if (!requiresReason) return reason?.trim() || null
  const trimmed = typeof reason === 'string' ? reason.trim().replace(/\s+/g, ' ') : ''
  if (trimmed.length < OVERRIDE_REASON_MIN || trimmed.length > OVERRIDE_REASON_MAX || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new HttpError(422, 'CIRCULATION_VALIDATION_FAILED', 'Override reason must be between 10 and 500 characters.', {
      errors: { overrideReason: 'Override reason must be between 10 and 500 characters and cannot contain control characters.' },
    })
  }
  return trimmed
}

export function assertTokenMatchesEvaluation(input: {
  token: string | null | undefined
  overrideReason: string | null | undefined
  accountId: number
  borrowerUserId: number
  physicalCopyId: number
  reservationId: number | null
  flow: CheckoutFlow
  evaluation: CheckoutEvaluation
  activePolicyVersionId: number
  secret?: string
}) {
  const warningCodes = sortedWarningCodes(input.evaluation.warnings)
  if (warningCodes.length === 0) {
    if (!input.token) return { decisionId: null as string | null, overrideReason: null as string | null, warningCodes }
    const claims = verifyPreflightToken(input.token, input.secret)
    if (claims.policyVersionId !== input.activePolicyVersionId) {
      throw new HttpError(422, 'CIRCULATION_POLICY_CHANGED', 'The borrowing policy changed after preflight. Run preflight again.')
    }
    if (claims.accountId !== input.accountId
      || claims.borrowerUserId !== input.borrowerUserId
      || claims.physicalCopyId !== input.physicalCopyId
      || claims.reservationId !== input.reservationId
      || claims.flow !== input.flow) {
      throw new HttpError(422, 'CIRCULATION_PREFLIGHT_TOKEN_MISMATCH', 'The preflight confirmation no longer matches this checkout. Run preflight again.')
    }
    return { decisionId: claims.jti, overrideReason: null, warningCodes }
  }

  if (!input.token) {
    throw new HttpError(422, 'CIRCULATION_CONFIRMATION_REQUIRED', 'This checkout requires staff confirmation before it can continue.', {
      warnings: input.evaluation.warnings,
    })
  }
  const claims = verifyPreflightToken(input.token, input.secret)
  if (claims.policyVersionId !== input.activePolicyVersionId) {
    throw new HttpError(422, 'CIRCULATION_POLICY_CHANGED', 'The borrowing policy changed after preflight. Run preflight again.')
  }
  const claimedCodes = [...claims.warningCodes].sort().join('|')
  const currentCodes = warningCodes.join('|')
  if (claims.accountId !== input.accountId
    || claims.borrowerUserId !== input.borrowerUserId
    || claims.physicalCopyId !== input.physicalCopyId
    || claims.reservationId !== input.reservationId
    || claims.flow !== input.flow
    || claimedCodes !== currentCodes) {
    throw new HttpError(422, 'CIRCULATION_PREFLIGHT_TOKEN_MISMATCH', 'The preflight confirmation no longer matches this checkout. Run preflight again.')
  }
  const overrideReason = assertOverrideReason(input.overrideReason, true)
  return { decisionId: claims.jti, overrideReason, warningCodes }
}
