import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import type { BorrowingPolicyMaterialRule, BorrowingPolicyVersion, PublishBorrowingPolicyInput } from './borrowing-policy.types.ts'

type Executor = Pool | PoolConnection

function sqlDate(value: unknown): string {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return String(value ?? '').slice(0, 10)
}

function sqlTime(value: unknown): string {
  const text = String(value ?? '')
  const match = text.match(/(\d{2}:\d{2}:\d{2})/)
  if (match) return match[1]
  const short = text.match(/(\d{2}:\d{2})/)
  return short ? `${short[1]}:00` : text
}

function mapVersion(row: RowDataPacket, materialRules: BorrowingPolicyMaterialRule[]): BorrowingPolicyVersion {
  return {
    versionId: Number(row.borrowing_policy_version_id),
    effectiveOn: sqlDate(row.effective_on),
    studentMaxActiveBooks: Number(row.student_max_active_books),
    facultyMaxActiveBooks: row.faculty_max_active_books === null || row.faculty_max_active_books === undefined
      ? null
      : Number(row.faculty_max_active_books),
    borrowingDays: Number(row.borrowing_days),
    dueTimeCutoff: sqlTime(row.due_time_cutoff),
    maxRenewals: Number(row.max_renewals),
    renewalExtensionDays: Number(row.renewal_extension_days),
    studentMaxActiveReservations: Number(row.student_max_active_reservations),
    facultyMaxActiveReservations: row.faculty_max_active_reservations === null || row.faculty_max_active_reservations === undefined
      ? null
      : Number(row.faculty_max_active_reservations),
    blockRenewalIfOverdue: Boolean(row.block_renewal_if_overdue),
    blockRenewalIfUnpaidFines: Boolean(row.block_renewal_if_unpaid_fines),
    blockRenewalIfReserved: Boolean(row.block_renewal_if_reserved),
    longOverdueAfterDays: row.long_overdue_after_days === null || row.long_overdue_after_days === undefined
      ? null
      : Number(row.long_overdue_after_days),
    changeReason: String(row.change_reason),
    createdByUserId: row.created_by_user_id === null || row.created_by_user_id === undefined
      ? null
      : Number(row.created_by_user_id),
    createdAt: row.created_at,
    materialRules,
  }
}

async function loadMaterialRules(executor: Executor, versionIds: number[]) {
  if (versionIds.length === 0) return new Map<number, BorrowingPolicyMaterialRule[]>()
  const placeholders = versionIds.map(() => '?').join(', ')
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT borrowing_policy_version_id, material_type, is_borrowable
       FROM borrowing_policy_material_rules
      WHERE borrowing_policy_version_id IN (${placeholders})
      ORDER BY material_type ASC`,
    versionIds,
  )
  const map = new Map<number, BorrowingPolicyMaterialRule[]>()
  for (const row of rows) {
    const versionId = Number(row.borrowing_policy_version_id)
    const list = map.get(versionId) ?? []
    list.push({
      materialType: String(row.material_type) as BorrowingPolicyMaterialRule['materialType'],
      isBorrowable: Boolean(row.is_borrowable),
    })
    map.set(versionId, list)
  }
  return map
}

export function createBorrowingPolicyRepository(database: Pool = db) {
  return {
    async findActive(campusDate: string, executor: Executor = database): Promise<BorrowingPolicyVersion | null> {
      const [rows] = await executor.execute<RowDataPacket[]>(
        `SELECT * FROM borrowing_policy_versions
          WHERE effective_on <= ?
          ORDER BY effective_on DESC, borrowing_policy_version_id DESC
          LIMIT 1`,
        [campusDate],
      )
      const row = rows[0]
      if (!row) return null
      const rules = await loadMaterialRules(executor, [Number(row.borrowing_policy_version_id)])
      return mapVersion(row, rules.get(Number(row.borrowing_policy_version_id)) ?? [])
    },

    async findById(versionId: number, executor: Executor = database): Promise<BorrowingPolicyVersion | null> {
      const [rows] = await executor.execute<RowDataPacket[]>(
        'SELECT * FROM borrowing_policy_versions WHERE borrowing_policy_version_id = ? LIMIT 1',
        [versionId],
      )
      const row = rows[0]
      if (!row) return null
      const rules = await loadMaterialRules(executor, [versionId])
      return mapVersion(row, rules.get(versionId) ?? [])
    },

    async listAll(executor: Executor = database): Promise<BorrowingPolicyVersion[]> {
      const [rows] = await executor.execute<RowDataPacket[]>(
        `SELECT * FROM borrowing_policy_versions
          ORDER BY effective_on DESC, borrowing_policy_version_id DESC`,
      )
      const ids = rows.map((row) => Number(row.borrowing_policy_version_id))
      const rules = await loadMaterialRules(executor, ids)
      return rows.map((row) => mapVersion(row, rules.get(Number(row.borrowing_policy_version_id)) ?? []))
    },

    async publish(
      input: PublishBorrowingPolicyInput,
      createdByUserId: number | null,
      executor: PoolConnection,
    ): Promise<BorrowingPolicyVersion> {
      const [insert] = await executor.execute<ResultSetHeader>(
        `INSERT INTO borrowing_policy_versions (
           effective_on, student_max_active_books, faculty_max_active_books, borrowing_days, due_time_cutoff,
           max_renewals, renewal_extension_days, student_max_active_reservations, faculty_max_active_reservations,
           block_renewal_if_overdue, block_renewal_if_unpaid_fines, block_renewal_if_reserved,
           long_overdue_after_days, change_reason, created_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.effectiveOn,
          input.studentMaxActiveBooks,
          input.facultyMaxActiveBooks,
          input.borrowingDays,
          input.dueTimeCutoff,
          input.maxRenewals,
          input.renewalExtensionDays,
          input.studentMaxActiveReservations,
          input.facultyMaxActiveReservations,
          input.blockRenewalIfOverdue ? 1 : 0,
          input.blockRenewalIfUnpaidFines ? 1 : 0,
          input.blockRenewalIfReserved ? 1 : 0,
          input.longOverdueAfterDays,
          input.changeReason,
          createdByUserId,
        ],
      )
      const versionId = Number(insert.insertId)
      for (const rule of input.materialRules) {
        await executor.execute(
          `INSERT INTO borrowing_policy_material_rules (borrowing_policy_version_id, material_type, is_borrowable)
           VALUES (?, ?, ?)`,
          [versionId, rule.materialType, rule.isBorrowable ? 1 : 0],
        )
      }
      const created = await this.findById(versionId, executor)
      if (!created) throw new Error('Published borrowing policy could not be reloaded.')
      return created
    },
  }
}

export const borrowingPolicyRepository = createBorrowingPolicyRepository()
