import { db, type Pool, type PoolConnection, type RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { MAX_WARNINGS_BEFORE_FINE, STUDENT_LEVELS, type LevelWarningsMap, type StudentLevel } from './conduct-policy.ts'
import { validateViolationCategory, validateViolationSettings } from './violation-categories.validation.ts'

// Microsecond text, so the version a client sends back compares exactly (a JS Date would round it).
const COLUMNS = `to_char(c.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version,c.category_id,c.name,c.description,c.warnings_before_fine,c.fine_amount,c.allowed_levels,c.is_active,c.sort_order,c.updated_at,
  (EXISTS(SELECT 1 FROM conduct_incidents i WHERE i.category=c.name) OR EXISTS(SELECT 1 FROM conduct_students s WHERE s.category=c.name)) AS used`

function parseAllowedLevels(raw: unknown): StudentLevel[] {
  if (Array.isArray(raw)) {
    const valid = STUDENT_LEVELS.filter(level => raw.includes(level))
    return valid.length ? valid : [...STUDENT_LEVELS]
  }
  return [...STUDENT_LEVELS]
}

function parseLevelWarnings(raw: unknown): LevelWarningsMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: LevelWarningsMap = {}
  for (const level of STUDENT_LEVELS) {
    const value = (raw as Record<string, unknown>)[level]
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_WARNINGS_BEFORE_FINE) {
      result[level] = value
    }
  }
  return result
}

function toDto(row: RowDataPacket) {
  return {
    categoryId: Number(row.category_id), name: String(row.name), description: row.description ? String(row.description) : null,
    warningsBeforeFine: Number(row.warnings_before_fine), fineAmount: Number(row.fine_amount),
    allowedLevels: parseAllowedLevels(row.allowed_levels),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order), used: Boolean(row.used), updatedAt: String(row.version),
  }
}
export type ViolationCategoryDto = ReturnType<typeof toDto>

export type ViolationSettingsDto = {
  maxFine: number
  warningsBeforeFine: number
  levelWarnings: LevelWarningsMap
  updatedAt: string
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === '23505'
const rollbackQuietly = (connection: PoolConnection) => connection.rollback().catch(() => {})

export function createViolationCategoriesService(database: Pool = db) {
  async function actorUserId(connection: PoolConnection, accountId: number) {
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=? LIMIT 1', [accountId])
    return rows[0]?.user_id ? Number(rows[0].user_id) : null
  }
  function accountId(value: unknown) {
    const id = Number(value)
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(401, 'VIOLATION_CATEGORY_LOGIN', 'Sign in again.')
    return id
  }
  async function note(connection: PoolConnection, account: number, title: string, body: string) {
    await connection.execute("INSERT INTO admin_notifications(event_type,actor_user_id,message_title,message_body) VALUES('violation_category_changed',?,?,?)", [await actorUserId(connection, account), title, body.slice(0, 500)])
  }
  async function fetchOne(executor: Pool | PoolConnection, id: number) {
    const [rows] = await executor.execute<RowDataPacket[]>(`SELECT ${COLUMNS} FROM violation_categories c WHERE c.category_id=?`, [id])
    return rows[0] ? toDto(rows[0]) : null
  }
  const levelsSummary = (levels: StudentLevel[]) =>
    levels.length === STUDENT_LEVELS.length ? 'All levels' : levels.join(', ')
  const summary = (c: { name: string; fineAmount: number; allowedLevels: StudentLevel[]; isActive: boolean }) =>
    `${c.name}: PHP ${c.fineAmount.toFixed(2)} (${levelsSummary(c.allowedLevels)}).${c.isActive ? '' : ' Retired.'}`

  async function duplicateExists(connection: PoolConnection, name: string, exceptId: number) {
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT category_id FROM violation_categories WHERE lower(name)=lower(?) AND category_id<>?', [name, exceptId])
    return rows.length > 0
  }
  const duplicate = () => new HttpError(409, 'VIOLATION_CATEGORY_DUPLICATE', 'A category with this name already exists.', { errors: { name: 'A category with this name already exists.' } })

  // Read under FOR SHARE so the limit or warning rules cannot change between this check and the save.
  async function readSettings(executor: Pool | PoolConnection, lock: '' | 'FOR SHARE' | 'FOR UPDATE' = ''): Promise<ViolationSettingsDto> {
    const [rows] = await executor.execute<RowDataPacket[]>(
      `SELECT max_fine,warnings_before_fine,level_warnings,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version FROM violation_settings WHERE settings_id=1 ${lock}`,
      [],
    )
    if (!rows[0]) throw new HttpError(503, 'VIOLATION_SETTINGS_MISSING', 'The violation settings are not set up yet. Ask the administrator to apply the latest database update.')
    return {
      maxFine: Number(rows[0].max_fine),
      warningsBeforeFine: Number(rows[0].warnings_before_fine),
      levelWarnings: parseLevelWarnings(rows[0].level_warnings),
      updatedAt: String(rows[0].version),
    }
  }
  const peso = (n: number) => `PHP ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return {
    getSettings: () => readSettings(database),

    async saveSettings(actor: unknown, body: unknown) {
      const account = accountId(actor)
      const patch = validateViolationSettings(body)
      const sent = (body as { updatedAt?: unknown } | null)?.updatedAt
      if (typeof sent !== 'string' || !sent) throw new HttpError(422, 'VIOLATION_CATEGORY_INVALID', 'Reload the rules and try again.', { errors: { updatedAt: 'Reload the rules and try again.' } })
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const current = await readSettings(connection, 'FOR UPDATE')
        if (current.updatedAt !== sent) throw new HttpError(409, 'VIOLATION_SETTINGS_STALE', 'The violation settings were changed by someone else. Reload the rules and try again.')
        const nextMaxFine = patch.maxFine ?? current.maxFine
        const nextWarnings = patch.warningsBeforeFine ?? current.warningsBeforeFine
        const nextLevelWarnings = patch.levelWarnings ?? current.levelWarnings
        if (patch.maxFine !== undefined) {
          const [over] = await connection.execute<RowDataPacket[]>('SELECT name,fine_amount FROM violation_categories WHERE fine_amount>? ORDER BY fine_amount DESC LIMIT 1', [nextMaxFine])
          if (over[0]) {
            const message = `${over[0].name} is set to ${peso(Number(over[0].fine_amount))}, above ${peso(nextMaxFine)}. Lower that fine first.`
            throw new HttpError(422, 'VIOLATION_SETTINGS_BELOW_EXISTING', message, { errors: { maxFine: message } })
          }
        }
        await connection.execute(
          'UPDATE violation_settings SET max_fine=?,warnings_before_fine=?,level_warnings=?::jsonb,updated_by_account_id=?,updated_at=NOW() WHERE settings_id=1',
          [nextMaxFine, nextWarnings, JSON.stringify(nextLevelWarnings), account],
        )
        const changes: string[] = []
        if (patch.maxFine !== undefined && nextMaxFine !== current.maxFine) {
          changes.push(`Highest fine is now ${peso(nextMaxFine)} (was ${peso(current.maxFine)}).`)
        }
        if (patch.warningsBeforeFine !== undefined || patch.levelWarnings !== undefined) {
          const custom = Object.entries(nextLevelWarnings).map(([level, count]) => `${level}: ${count}`).join(', ')
          changes.push(`Shared warnings before fine: ${nextWarnings}${custom ? ` (custom: ${custom})` : ' (all levels)'}.`)
        }
        const title = patch.maxFine !== undefined && patch.warningsBeforeFine === undefined && patch.levelWarnings === undefined
          ? 'Highest violation fine changed'
          : 'Violation warning rules changed'
        await note(connection, account, title, changes.join(' ') || 'Violation rules saved.')
        const updatedSettings = await readSettings(connection)
        await connection.commit()
        return updatedSettings
      } catch (error) { await rollbackQuietly(connection); throw error } finally { connection.release() }
    },

    async list() {
      const [rows] = await database.execute<RowDataPacket[]>(`SELECT ${COLUMNS} FROM violation_categories c ORDER BY c.sort_order,c.name`, [])
      return rows.map(toDto)
    },

    async create(actor: unknown, body: unknown) {
      const account = accountId(actor)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const settings = await readSettings(connection, 'FOR SHARE')
        const input = validateViolationCategory(body, false, settings.maxFine)
        if (await duplicateExists(connection, input.name, 0)) throw duplicate()
        // Concurrent creates can both pass the check above; the lower(name) unique index decides.
        const [sort] = await connection.execute<RowDataPacket[]>('SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM violation_categories', [])
        const [insert] = await connection.execute<RowDataPacket[]>(
          'INSERT INTO violation_categories(name,description,warnings_before_fine,fine_amount,allowed_levels,sort_order,updated_by_account_id) VALUES(?,?,?,?,?::text[],?,?)',
          [input.name, input.description, input.warningsBeforeFine ?? settings.warningsBeforeFine, input.fineAmount, input.allowedLevels, Number(sort[0].next), account],
        )
        const id = Number((insert as unknown as { insertId: number }).insertId)
        await note(connection, account, 'Violation category added', summary({ ...input, isActive: true }))
        const created = (await fetchOne(connection, id))!
        await connection.commit()
        return created
      } catch (error) { await rollbackQuietly(connection); throw isUniqueViolation(error) ? duplicate() : error } finally { connection.release() }
    },

    async update(actor: unknown, target: unknown, body: unknown) {
      const account = accountId(actor)
      const id = Number(target)
      if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(422, 'VIOLATION_CATEGORY_INVALID', 'Choose a valid category.')
      const sent = (body as { updatedAt?: unknown } | null)?.updatedAt
      if (typeof sent !== 'string' || !sent) throw new HttpError(422, 'VIOLATION_CATEGORY_INVALID', 'Reload the rules and try again.', { errors: { updatedAt: 'Reload the rules and try again.' } })
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const patch = validateViolationCategory(body, true, (await readSettings(connection, 'FOR SHARE')).maxFine)
        const [locked] = await connection.execute<RowDataPacket[]>('SELECT category_id FROM violation_categories WHERE category_id=? FOR UPDATE', [id])
        if (!locked[0]) throw new HttpError(404, 'VIOLATION_CATEGORY_NOT_FOUND', 'Violation category not found.')
        const before = (await fetchOne(connection, id))!
        if (before.updatedAt !== sent) throw new HttpError(409, 'VIOLATION_CATEGORY_STALE', 'This category was changed by someone else. Reload the rules and try again.')
        if (patch.name !== undefined && patch.name !== before.name) {
          // conduct_students is append-only, so a rename after use would orphan history.
          if (before.used) throw new HttpError(409, 'VIOLATION_CATEGORY_NAME_LOCKED', 'This category already has records, so its name cannot change. Edit the description, or retire it and add a new category.', { errors: { name: 'The name is locked because records use it.' } })
          if (await duplicateExists(connection, patch.name, id)) throw duplicate()
        }
        const next = { ...before, ...patch }
        await connection.execute(
          'UPDATE violation_categories SET name=?,description=?,warnings_before_fine=?,fine_amount=?,allowed_levels=?::text[],is_active=?,updated_by_account_id=?,updated_at=NOW() WHERE category_id=?',
          [next.name, next.description, next.warningsBeforeFine, next.fineAmount, next.allowedLevels, next.isActive, account, id],
        )
        const title = patch.isActive !== undefined && patch.isActive !== before.isActive ? (patch.isActive ? 'Violation category restored' : 'Violation category retired') : 'Violation category changed'
        await note(connection, account, title, summary(next))
        const updated = (await fetchOne(connection, id))!
        await connection.commit()
        return updated
      } catch (error) { await rollbackQuietly(connection); throw isUniqueViolation(error) ? duplicate() : error } finally { connection.release() }
    },

    /** Permanently removes a category nobody has used. One with records is retired instead, so old records keep their label. */
    async remove(actor: unknown, target: unknown) {
      const account = accountId(actor)
      const id = Number(target)
      if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(422, 'VIOLATION_CATEGORY_INVALID', 'Choose a valid category.')
      const inUse = () => new HttpError(409, 'VIOLATION_CATEGORY_IN_USE', 'This category already has violation records, so it cannot be deleted. Retire it instead.')
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        // Same lock a violation being recorded takes (FOR SHARE), so a record cannot slip in after the check below.
        const [locked] = await connection.execute<RowDataPacket[]>('SELECT category_id FROM violation_categories WHERE category_id=? FOR UPDATE', [id])
        if (!locked[0]) throw new HttpError(404, 'VIOLATION_CATEGORY_NOT_FOUND', 'Violation category not found.')
        const before = (await fetchOne(connection, id))!
        if (before.used) throw inUse()
        await connection.execute('DELETE FROM violation_categories WHERE category_id=?', [id])
        await note(connection, account, 'Violation category deleted', `${before.name} was deleted. It had no violation records.`)
        await connection.commit()
        return { deleted: true as const }
      } catch (error) {
        await rollbackQuietly(connection)
        // The foreign keys are the last line of defence if a record is saved in the same instant.
        throw (error as { code?: string } | null)?.code === '23503' ? inUse() : error
      } finally { connection.release() }
    },
  }
}

export const violationCategoriesService = createViolationCategoriesService()
