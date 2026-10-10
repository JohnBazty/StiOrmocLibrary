import type { Pool, PoolConnection } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { createBorrowingPolicyRepository } from './borrowing-policy.repository.ts'
import { createBorrowingPolicyService } from './borrowing-policy.service.ts'
import { isMaterialBorrowable, type BorrowingPolicyVersion } from './borrowing-policy.types.ts'
import { extendOperatingDueDate } from './due-date.ts'
import {
  createRenewalRepository,
  type RenewalAccount,
  type RenewalBlockState,
  type RenewalLoan,
  type StoredRenewalDecision,
} from './renewal.repository.ts'
import { renewalTransactionId, validateRenewalRequest } from './renewal.validation.ts'

export interface RenewalActor {
  accountId?: unknown
  role?: unknown
}

export interface RenewalBlocker {
  code: string
  message: string
}

const BLOCKER_MESSAGES: Record<string, string> = {
  RENEWAL_ACCOUNT_INACTIVE: 'The borrower account is not active.',
  RENEWAL_LOAN_NOT_ACTIVE: 'Only a currently borrowed book can be renewed.',
  RENEWAL_ALREADY_OVERDUE: 'The renewal deadline has passed.',
  RENEWAL_LIMIT_REACHED: 'This loan has no renewals remaining.',
  RENEWAL_MATERIAL_NOT_ELIGIBLE: 'This material is not eligible for renewal.',
  RENEWAL_COPY_BLOCKED: 'This copy is archived, lost, or unavailable for renewal.',
  RENEWAL_TITLE_ARCHIVED: 'This title is archived and cannot be renewed.',
  RENEWAL_RESERVATION_WAITING: 'Another borrower is waiting for this title.',
  RENEWAL_OUTSTANDING_FINE: 'Outstanding fines must be settled before renewal.',
  RENEWAL_LOST_CHARGE_UNPAID: 'An unpaid lost-book charge must be settled before renewal.',
  RENEWAL_LOST_REPORT_OPEN: 'A pending or confirmed lost-book report prevents renewal.',
  RENEWAL_POLICY_UNAVAILABLE: 'No borrowing policy is available for this renewal.',
  RENEWAL_CALENDAR_UNAVAILABLE: 'The next operating due date could not be calculated.',
}

function accountId(actor: RenewalActor): number {
  const value = Number(actor.accountId)
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new HttpError(422, 'RENEWAL_VALIDATION_FAILED', 'accountId must be a positive integer.')
  }
  return value
}

function isStaffActor(actor: RenewalActor): boolean {
  return String(actor.role ?? '') === 'Admin'
}

function blocker(code: string): RenewalBlocker {
  return { code, message: BLOCKER_MESSAGES[code] }
}

function evaluateBlockers(
  loan: RenewalLoan,
  policy: BorrowingPolicyVersion | null,
  blockState: RenewalBlockState,
  now: Date,
): RenewalBlocker[] {
  const blockers: RenewalBlocker[] = []
  if (loan.userAccountStatus !== 'Active' || loan.normalizedAccountStatus !== 'Active') {
    blockers.push(blocker('RENEWAL_ACCOUNT_INACTIVE'))
  }
  if (loan.status !== 'Borrowed') {
    blockers.push(blocker(loan.status === 'Overdue' ? 'RENEWAL_ALREADY_OVERDUE' : 'RENEWAL_LOAN_NOT_ACTIVE'))
  } else if (!loan.dueAt || now >= loan.dueAt) {
    blockers.push(blocker('RENEWAL_ALREADY_OVERDUE'))
  }
  if (!policy) {
    blockers.push(blocker('RENEWAL_POLICY_UNAVAILABLE'))
  } else {
    if (loan.renewalCount >= policy.maxRenewals) blockers.push(blocker('RENEWAL_LIMIT_REACHED'))
    if (!isMaterialBorrowable(policy, loan.materialType)) blockers.push(blocker('RENEWAL_MATERIAL_NOT_ELIGIBLE'))
  }
  if (loan.copyCondition === 'Lost' || loan.copyLifecycleStatus === 'Archived') {
    blockers.push(blocker('RENEWAL_COPY_BLOCKED'))
  }
  if (loan.titleLifecycleStatus === 'Archived') blockers.push(blocker('RENEWAL_TITLE_ARCHIVED'))
  if (blockState.hasWaitingReservation) blockers.push(blocker('RENEWAL_RESERVATION_WAITING'))
  if (blockState.hasOutstandingFine) blockers.push(blocker('RENEWAL_OUTSTANDING_FINE'))
  if (blockState.hasUnpaidLostCharge) blockers.push(blocker('RENEWAL_LOST_CHARGE_UNPAID'))
  if (blockState.hasOpenLostReport) blockers.push(blocker('RENEWAL_LOST_REPORT_OPEN'))
  return blockers
}

function decisionBlockers(decision: StoredRenewalDecision): RenewalBlocker[] {
  return decision.blockerCodes.map((code) => ({
    code,
    message: BLOCKER_MESSAGES[code] ?? 'This renewal request was rejected.',
  }))
}

function decisionDto(decision: StoredRenewalDecision, maxRenewals: number | null = null) {
  const remainingRenewals = maxRenewals === null
    ? null
    : Math.max(0, maxRenewals - (decision.status === 'Approved' ? decision.renewalNumber : decision.renewalNumber - 1))
  return {
    renewalRequestId: decision.renewalRequestId,
    requestKey: decision.requestKey,
    transactionId: decision.transactionId,
    status: decision.status,
    decisionCode: decision.decisionCode,
    decisionSummary: decision.decisionSummary,
    decisionSource: decision.decisionSource,
    staffNote: decision.staffNote,
    previousDueAt: decision.previousDueAt,
    newDueAt: decision.newDueAt,
    renewalNumber: decision.renewalNumber,
    maxRenewals,
    remainingRenewals,
    policyVersionId: decision.policyVersionId,
    requestedAt: decision.requestedAt,
    decidedAt: decision.decidedAt,
    blockers: decisionBlockers(decision),
    idempotent: true,
  }
}

async function resolvePolicy(
  policyService: ReturnType<typeof createBorrowingPolicyService>,
  executor: Pool | PoolConnection,
  now: Date,
): Promise<BorrowingPolicyVersion | null> {
  try {
    return await policyService.resolveActive(executor, now)
  } catch (error) {
    if (error instanceof HttpError && error.code === 'BORROWING_POLICY_NOT_CONFIGURED') return null
    throw error
  }
}

function assertActorCanAccessLoan(account: RenewalAccount, loan: RenewalLoan, staff: boolean): void {
  if (staff) {
    if (account.role !== 'Admin') {
      throw new HttpError(403, 'RENEWAL_FORBIDDEN', 'Only an Admin may renew a loan on behalf of a borrower.')
    }
    return
  }
  if (!account.userId || account.userId !== loan.userId) {
    throw new HttpError(404, 'RENEWAL_LOAN_NOT_FOUND', 'The borrowing record was not found.')
  }
}

function assertIdempotentOwner(
  decision: StoredRenewalDecision,
  transactionId: number,
  requesterAccountId: number,
): void {
  if (decision.transactionId !== transactionId || decision.requesterAccountId !== requesterAccountId) {
    throw new HttpError(409, 'RENEWAL_REQUEST_KEY_CONFLICT', 'This request key is already in use.')
  }
}

export function createRenewalService(database: Pool = db, clock: () => Date = () => new Date()) {
  const repository = createRenewalRepository(database)
  const policyRepository = createBorrowingPolicyRepository(database)
  const policyService = createBorrowingPolicyService(database, clock)

  async function evaluate(
    transactionId: number,
    actor: RenewalActor,
    executor: Pool | PoolConnection,
    lock: boolean,
  ) {
    const requesterAccountId = accountId(actor)
    const staff = isStaffActor(actor)
    const account = await repository.findAccount(requesterAccountId, executor, lock)
    if (!account?.userId) {
      throw new HttpError(422, 'RENEWAL_PROFILE_NOT_LINKED', 'This login account is not linked to a circulation profile.')
    }
    const loan = await repository.findLoan(transactionId, executor, lock)
    if (!loan) throw new HttpError(404, 'RENEWAL_LOAN_NOT_FOUND', 'The borrowing record was not found.')
    assertActorCanAccessLoan(account, loan, staff)
    if (!loan.dueAt) {
      throw new HttpError(409, 'RENEWAL_STATE_INCONSISTENT', 'The borrowing record has no due date and cannot be renewed safely.')
    }
    const now = clock()
    const policy = await resolvePolicy(policyService, executor, now)
    const approvedCount = await repository.countApproved(transactionId, executor)
    if (approvedCount !== loan.renewalCount) {
      throw new HttpError(
        409,
        'RENEWAL_STATE_INCONSISTENT',
        'Renewal history does not match the borrowing record. No changes were made.',
      )
    }
    const blockState = await repository.loadBlockState(loan, executor, lock)
    const blockers = evaluateBlockers(loan, policy, blockState, now)
    let proposedDueAt: Date | null = null
    if (policy) {
      try {
        const closedDates = await repository.loadCalendarClosedDates(loan.dueAt, executor)
        proposedDueAt = extendOperatingDueDate(
          loan.dueAt,
          policy.renewalExtensionDays,
          policy.dueTimeCutoff,
          closedDates,
        )
      } catch {
        blockers.push(blocker('RENEWAL_CALENDAR_UNAVAILABLE'))
      }
    }
    return { account, loan, policy, blockers, proposedDueAt, requesterAccountId, staff, now }
  }

  return {
    async preflight(transactionIdValue: unknown, actor: RenewalActor) {
      const transactionId = renewalTransactionId(transactionIdValue)
      const result = await evaluate(transactionId, actor, database, false)
      const maxRenewals = result.policy?.maxRenewals ?? null
      return {
        transactionId,
        currentDueAt: result.loan.dueAt,
        proposedDueAt: result.proposedDueAt,
        renewalCount: result.loan.renewalCount,
        maxRenewals,
        remainingRenewals: maxRenewals === null ? null : Math.max(0, maxRenewals - result.loan.renewalCount),
        policyVersionId: result.policy?.versionId ?? null,
        blockers: result.blockers,
        canRequestRenewal: result.blockers.length === 0 && result.proposedDueAt !== null,
      }
    },

    async submit(transactionIdValue: unknown, actor: RenewalActor, body: unknown) {
      const transactionId = renewalTransactionId(transactionIdValue)
      const staff = isStaffActor(actor)
      const input = validateRenewalRequest(body, staff)
      const requesterAccountId = accountId(actor)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        await repository.findAccount(requesterAccountId, connection, true)
        const existing = await repository.findDecisionByRequestKey(input.requestKey, connection, true)
        if (existing) {
          assertIdempotentOwner(existing, transactionId, requesterAccountId)
          const policy = existing.policyVersionId
            ? await policyRepository.findById(existing.policyVersionId, connection)
            : null
          await connection.commit()
          return decisionDto(existing, policy?.maxRenewals ?? null)
        }

        const result = await evaluate(transactionId, actor, connection, true)
        const renewalNumber = result.loan.renewalCount + 1
        const approved = result.blockers.length === 0 && result.proposedDueAt !== null
        const status = approved ? 'Approved' as const : 'Rejected' as const
        const decisionCode = approved ? 'RENEWAL_APPROVED' : result.blockers[0].code
        const decisionSummary = approved
          ? 'The loan was renewed successfully.'
          : result.blockers[0].message
        const decisionInput = {
          requestKey: input.requestKey,
          transactionId,
          renewalNumber,
          requesterAccountId,
          requesterUserId: result.account.userId!,
          decisionSource: result.staff ? 'Staff' as const : 'System' as const,
          decidingStaffAccountId: result.staff ? requesterAccountId : null,
          decidingStaffUserId: result.staff ? result.account.userId : null,
          staffNote: input.staffNote,
          status,
          decisionCode,
          decisionSummary,
          blockerCodes: result.blockers.map((item) => item.code),
          previousDueAt: result.loan.dueAt!,
          newDueAt: approved ? result.proposedDueAt : null,
          policyVersionId: result.policy?.versionId ?? null,
          requestedAt: result.now,
          decidedAt: result.now,
        }
        const renewalRequestId = await repository.insertDecision(decisionInput, connection)
        if (approved) {
          const didUpdateLoan = await repository.approveLoan(
            transactionId,
            result.loan.renewalCount,
            result.loan.dueAt!,
            result.proposedDueAt!,
            connection,
          )
          if (!didUpdateLoan) {
            throw new HttpError(409, 'RENEWAL_CONCURRENT_UPDATE', 'The loan changed during renewal. No changes were made.')
          }
          await repository.insertApprovalNotification(
            result.loan,
            renewalRequestId,
            renewalNumber,
            result.proposedDueAt!,
            connection,
          )
        }
        await connection.commit()
        return {
          renewalRequestId,
          requestKey: input.requestKey,
          transactionId,
          status,
          decisionCode,
          decisionSummary,
          decisionSource: decisionInput.decisionSource,
          staffNote: input.staffNote,
          previousDueAt: result.loan.dueAt,
          newDueAt: decisionInput.newDueAt,
          renewalNumber,
          maxRenewals: result.policy?.maxRenewals ?? null,
          remainingRenewals: result.policy
            ? Math.max(0, result.policy.maxRenewals - (approved ? renewalNumber : result.loan.renewalCount))
            : null,
          policyVersionId: result.policy?.versionId ?? null,
          requestedAt: result.now,
          decidedAt: result.now,
          blockers: result.blockers,
          idempotent: false,
        }
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },
  }
}

export const renewalService = createRenewalService()
