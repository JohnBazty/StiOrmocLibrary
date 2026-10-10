import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { formatDueCutoffLabel } from './due-date.ts'
import { createBorrowingPolicyRepository } from './borrowing-policy.repository.ts'
import type {
  BorrowingPolicyDerivedStatus,
  BorrowingPolicyVersion,
  PublishBorrowingPolicyInput,
} from './borrowing-policy.types.ts'
import { validatePublishBorrowingPolicy } from './borrowing-policy.validation.ts'

export function manilaCampusDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function deriveStatus(
  version: BorrowingPolicyVersion,
  campusDate: string,
  activeVersionId: number | null,
): BorrowingPolicyDerivedStatus {
  if (version.effectiveOn > campusDate) return 'scheduled'
  if (activeVersionId !== null && version.versionId === activeVersionId) return 'active'
  return 'superseded'
}

function toDto(version: BorrowingPolicyVersion, status: BorrowingPolicyDerivedStatus) {
  return {
    versionId: version.versionId,
    displayName: `Policy ${version.versionId}`,
    status,
    effectiveOn: version.effectiveOn,
    studentMaxActiveBooks: version.studentMaxActiveBooks,
    facultyMaxActiveBooks: version.facultyMaxActiveBooks,
    borrowingDays: version.borrowingDays,
    dueTimeCutoff: version.dueTimeCutoff,
    dueCutoffLabel: formatDueCutoffLabel(version.dueTimeCutoff),
    maxRenewals: version.maxRenewals,
    renewalExtensionDays: version.renewalExtensionDays,
    studentMaxActiveReservations: version.studentMaxActiveReservations,
    facultyMaxActiveReservations: version.facultyMaxActiveReservations,
    blockRenewalIfOverdue: version.blockRenewalIfOverdue,
    blockRenewalIfUnpaidFines: version.blockRenewalIfUnpaidFines,
    blockRenewalIfReserved: version.blockRenewalIfReserved,
    longOverdueAfterDays: version.longOverdueAfterDays,
    changeReason: version.changeReason,
    createdByUserId: version.createdByUserId,
    createdAt: version.createdAt instanceof Date ? version.createdAt.toISOString() : String(version.createdAt),
    materialRules: version.materialRules,
  }
}

export function createBorrowingPolicyService(
  database: Pool = db,
  clock: () => Date = () => new Date(),
) {
  const repository = createBorrowingPolicyRepository(database)

  async function resolveActive(executor: Pool | PoolConnection = database, at: Date = clock()) {
    const campusDate = manilaCampusDate(at)
    const policy = await repository.findActive(campusDate, executor)
    if (!policy) {
      throw new HttpError(503, 'BORROWING_POLICY_NOT_CONFIGURED', 'No borrowing policy is configured for this campus date.')
    }
    return policy
  }

  async function actorUserId(accountId: number, connection: PoolConnection) {
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT user_id FROM accounts WHERE account_id = ? LIMIT 1',
      [accountId],
    )
    return rows[0]?.user_id ? Number(rows[0].user_id) : null
  }

  return {
    resolveActive,

    async list() {
      const campusDate = manilaCampusDate(clock())
      const versions = await repository.listAll()
      const active = await repository.findActive(campusDate)
      const activeId = active?.versionId ?? null
      const mapped = versions.map((version) => toDto(version, deriveStatus(version, campusDate, activeId)))
      return {
        active: mapped.find((item) => item.status === 'active') ?? null,
        scheduled: mapped.filter((item) => item.status === 'scheduled'),
        history: mapped,
      }
    },

    async getById(versionIdValue: unknown) {
      const versionId = Number(versionIdValue)
      if (!Number.isSafeInteger(versionId) || versionId < 1) {
        throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', 'versionId must be a positive integer.')
      }
      const version = await repository.findById(versionId)
      if (!version) throw new HttpError(404, 'BORROWING_POLICY_NOT_FOUND', 'The borrowing policy version was not found.')
      const campusDate = manilaCampusDate(clock())
      const active = await repository.findActive(campusDate)
      return toDto(version, deriveStatus(version, campusDate, active?.versionId ?? null))
    },

    async publish(actorAccountIdValue: unknown, body: unknown) {
      const accountId = Number(actorAccountIdValue)
      if (!Number.isSafeInteger(accountId) || accountId < 1) {
        throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', 'actorAccountId must be a positive integer.')
      }
      const input: PublishBorrowingPolicyInput = validatePublishBorrowingPolicy(body)
      const campusDate = manilaCampusDate(clock())
      if (input.effectiveOn < campusDate) {
        throw new HttpError(422, 'BORROWING_POLICY_BACKDATED', 'effectiveOn cannot be earlier than today\'s campus date.', {
          errors: { effectiveOn: 'Backdated effective dates are not allowed.' },
          campusDate,
        })
      }
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const createdByUserId = await actorUserId(accountId, connection)
        const created = await repository.publish(input, createdByUserId, connection)
        await connection.commit()
        const active = await repository.findActive(campusDate)
        return toDto(created, deriveStatus(created, campusDate, active?.versionId ?? null))
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },
  }
}

export const borrowingPolicyService = createBorrowingPolicyService()
