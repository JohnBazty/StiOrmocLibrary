import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { manilaDate } from './fine-calculator.ts'
import { validateFinePolicy } from './fine-policy.validation.ts'

const HISTORY_LIMIT = 50
// Versions cannot be cancelled, so a mistyped far-future date would block every later change.
const MAX_DAYS_AHEAD = 365
const COLUMNS = 'fine_policy_id,hourly_rate,daily_rate,maximum_penalty,effective_from,effective_until,change_reason,created_by_user_id,created_at'

type Status = 'active' | 'scheduled' | 'superseded'
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value == null ? null : new Date(String(value)).toISOString()

function toDto(row: RowDataPacket, status: Status) {
  return {
    versionId: Number(row.fine_policy_id), status,
    hourlyRate: Number(row.hourly_rate), dailyRate: Number(row.daily_rate), maximumPenalty: Number(row.maximum_penalty),
    effectiveFrom: iso(row.effective_from), effectiveUntil: iso(row.effective_until),
    changeReason: row.change_reason ? String(row.change_reason) : null,
    createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null, createdAt: iso(row.created_at),
  }
}

export function createFinePolicyService(database: Pool = db, clock: () => Date = () => new Date()) {
  async function actorUserId(accountId: number, connection: PoolConnection) {
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id = ? LIMIT 1', [accountId])
    return rows[0]?.user_id ? Number(rows[0].user_id) : null
  }

  return {
    async list() {
      const now = clock().getTime()
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT ${COLUMNS} FROM fine_policy_versions WHERE is_active = 1 ORDER BY effective_from DESC, fine_policy_id DESC LIMIT ${HISTORY_LIMIT}`, [],
      )
      let activeSeen = false
      const history = rows.map((row) => {
        if (new Date(String(iso(row.effective_from))).getTime() > now) return toDto(row, 'scheduled')
        const status: Status = activeSeen ? 'superseded' : 'active'
        activeSeen = true
        return toDto(row, status)
      })
      return { active: history.find((item) => item.status === 'active') ?? null, scheduled: history.filter((item) => item.status === 'scheduled'), history }
    },

    async publish(actorAccountIdValue: unknown, body: unknown) {
      const accountId = Number(actorAccountIdValue)
      if (!Number.isSafeInteger(accountId) || accountId < 1) throw new HttpError(422, 'FINE_POLICY_VALIDATION_FAILED', 'actorAccountId must be a positive integer.')
      const input = validateFinePolicy(body)
      const now = clock()
      const today = manilaDate(now)
      if (input.effectiveOn < today) {
        throw new HttpError(422, 'FINE_POLICY_BACKDATED', 'The start date cannot be before today.', { errors: { effectiveOn: 'The start date cannot be before today.' }, campusDate: today })
      }
      const latestAllowed = manilaDate(new Date(now.getTime() + MAX_DAYS_AHEAD * 86_400_000))
      if (input.effectiveOn > latestAllowed) {
        throw new HttpError(422, 'FINE_POLICY_TOO_FAR_AHEAD', `The start date must be within ${MAX_DAYS_AHEAD} days.`, { errors: { effectiveOn: `Choose a date on or before ${latestAllowed}.` } })
      }
      // A change made for today starts now, so loans that fell due earlier today keep the old rule.
      const effectiveFrom = input.effectiveOn === today ? now : new Date(`${input.effectiveOn}T00:00:00+08:00`)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        await connection.execute("SELECT pg_advisory_xact_lock(hashtext('fine_policy_versions'))", [])
        const [latestRows] = await connection.execute<RowDataPacket[]>(
          `SELECT ${COLUMNS} FROM fine_policy_versions WHERE is_active = 1 ORDER BY effective_from DESC, fine_policy_id DESC LIMIT 1 FOR UPDATE`, [],
        )
        const latest = latestRows[0]
        if (latest && new Date(String(iso(latest.effective_from))).getTime() >= effectiveFrom.getTime()) {
          throw new HttpError(409, 'FINE_POLICY_SCHEDULE_CONFLICT', 'A fine rule already starts on or after this date. Choose a later start date.', {
            errors: { effectiveOn: 'Choose a date after the latest scheduled rule.' }, latestEffectiveFrom: iso(latest.effective_from),
          })
        }
        if (latest) await connection.execute('UPDATE fine_policy_versions SET effective_until = ? WHERE fine_policy_id = ?', [effectiveFrom, Number(latest.fine_policy_id)])
        const createdByUserId = await actorUserId(accountId, connection)
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO fine_policy_versions (hourly_rate,daily_rate,maximum_penalty,effective_from,created_by_user_id,change_reason,is_active)
           VALUES (?,?,?,?,?,?,1)`,
          [input.hourlyRate, input.dailyRate, input.maximumPenalty, effectiveFrom, createdByUserId, input.changeReason],
        )
        await connection.execute(
          "INSERT INTO admin_notifications (event_type, actor_user_id, message_title, message_body) VALUES ('fine_policy_published', ?, 'Fine rules changed', ?)",
          [createdByUserId, `From ${input.effectiveOn}: PHP ${input.hourlyRate.toFixed(2)} per hour, PHP ${input.dailyRate.toFixed(2)} per library day, at most PHP ${input.maximumPenalty.toFixed(2)}. Reason: ${input.changeReason}`.slice(0, 500)], // message_body is VARCHAR(500)
        )
        await connection.commit()
        return toDto({
          fine_policy_id: insert.insertId, hourly_rate: input.hourlyRate, daily_rate: input.dailyRate, maximum_penalty: input.maximumPenalty,
          effective_from: effectiveFrom, effective_until: null, change_reason: input.changeReason, created_by_user_id: createdByUserId, created_at: now,
        } as unknown as RowDataPacket, effectiveFrom.getTime() > now.getTime() ? 'scheduled' : 'active')
      } catch (error) {
        await connection.rollback().catch(() => {}) // keep the original error if the connection died
        throw error
      } finally {
        connection.release()
      }
    },
  }
}

export const finePolicyService = createFinePolicyService()
