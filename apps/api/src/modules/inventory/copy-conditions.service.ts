import { db, type Pool, type PoolConnection, type RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'

/** The five conditions lending, returns, stocktake and the lost-book flow understand. */
export const BASE_CONDITIONS = ['Good', 'Fair', 'For Repair', 'Damaged', 'Lost'] as const
export type BaseCondition = typeof BASE_CONDITIONS[number]

// Microsecond text so the version a client sends back compares exactly.
const COLUMNS = `c.condition_id,c.name,c.behaves_as,c.description,c.is_base,c.is_active,c.sort_order,
  to_char(c.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version,
  (SELECT COUNT(*) FROM physical_copies p WHERE p.condition_detail_id=c.condition_id) AS copies`

function toDto(row: RowDataPacket) {
  return {
    conditionId: Number(row.condition_id), name: String(row.name), behavesAs: String(row.behaves_as) as BaseCondition,
    description: row.description ? String(row.description) : null, isBase: Boolean(row.is_base), isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order), copies: Number(row.copies), updatedAt: String(row.version),
  }
}
export type CopyConditionDto = ReturnType<typeof toDto>

const invalid = (field: string, message: string) => new HttpError(422, 'COPY_CONDITION_INVALID', message, { errors: { [field]: message } })
const clean = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : ''

function nameOf(value: unknown) {
  const name = clean(value)
  if (name.length < 2 || name.length > 40) throw invalid('name', 'Enter a condition name of 2 to 40 characters.')
  return name
}
function behavesAsOf(value: unknown): BaseCondition {
  if (!BASE_CONDITIONS.includes(value as BaseCondition)) throw invalid('behavesAs', 'Choose how this condition behaves: Good, Fair, For Repair, Damaged or Lost.')
  return value as BaseCondition
}
function descriptionOf(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const description = clean(value)
  if (description.length > 300) throw invalid('description', 'Keep the description to 300 characters.')
  return description || null
}
function positiveId(value: unknown) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(404, 'COPY_CONDITION_NOT_FOUND', 'This condition was not found.')
  return id
}
function accountId(value: unknown) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(401, 'COPY_CONDITION_LOGIN', 'Sign in again.')
  return id
}
const duplicate = () => new HttpError(409, 'COPY_CONDITION_DUPLICATE', 'A condition with this name already exists.', { errors: { name: 'A condition with this name already exists.' } })
const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === '23505'

export function createCopyConditionsService(database: Pool = db) {
  async function fetchOne(executor: Pool | PoolConnection, id: number, lock = false) {
    const [rows] = await executor.execute<RowDataPacket[]>(`SELECT ${COLUMNS} FROM copy_conditions c WHERE c.condition_id=?${lock ? ' FOR UPDATE' : ''}`, [id])
    if (!rows[0]) throw new HttpError(404, 'COPY_CONDITION_NOT_FOUND', 'This condition was not found.')
    return toDto(rows[0])
  }
  async function transaction<T>(work: (connection: PoolConnection) => Promise<T>) {
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const result = await work(connection)
      await connection.commit()
      return result
    } catch (error) {
      await connection.rollback().catch(() => {})
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    } finally { connection.release() }
  }

  return {
    async list() {
      const [rows] = await database.execute<RowDataPacket[]>(`SELECT ${COLUMNS} FROM copy_conditions c ORDER BY c.is_base DESC,c.sort_order,lower(c.name)`)
      return rows.map(toDto)
    },

    async create(actor: unknown, body: unknown) {
      const account = accountId(actor)
      const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
      const name = nameOf(input.name), behavesAs = behavesAsOf(input.behavesAs), description = descriptionOf(input.description)
      return transaction(async connection => {
        const [rows] = await connection.execute<RowDataPacket[]>(
          'INSERT INTO copy_conditions(name,behaves_as,description,updated_by_account_id) VALUES (?,?,?,?) RETURNING condition_id',
          [name, behavesAs, description, account])
        const created = (rows as unknown as { rows?: RowDataPacket[] }).rows?.[0] ?? (rows as RowDataPacket[])[0]
        return fetchOne(connection, Number(created.condition_id))
      })
    },

    /** Base conditions only take a new description. A custom one in use keeps its behaviour; retire it instead. */
    async update(actor: unknown, rawId: unknown, body: unknown) {
      const account = accountId(actor), id = positiveId(rawId)
      const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
      return transaction(async connection => {
        const current = await fetchOne(connection, id, true)
        if (input.updatedAt !== current.updatedAt) throw new HttpError(409, 'COPY_CONDITION_CHANGED', 'Someone else changed this condition. Reload and try again.')
        const name = input.name === undefined ? current.name : nameOf(input.name)
        const behavesAs = input.behavesAs === undefined ? current.behavesAs : behavesAsOf(input.behavesAs)
        const description = input.description === undefined ? current.description : descriptionOf(input.description)
        const isActive = input.isActive === undefined ? current.isActive : input.isActive === true
        if (current.isBase && (name !== current.name || behavesAs !== current.behavesAs || !isActive))
          throw new HttpError(422, 'COPY_CONDITION_BASE_LOCKED', 'The five base conditions keep their name and behaviour. You can edit their description.')
        if (behavesAs !== current.behavesAs && current.copies > 0)
          throw new HttpError(409, 'COPY_CONDITION_IN_USE', `${current.copies} ${current.copies === 1 ? 'copy uses' : 'copies use'} this condition, so its behaviour cannot change. Retire it and add a new one.`)
        await connection.execute(
          'UPDATE copy_conditions SET name=?,behaves_as=?,description=?,is_active=?,updated_by_account_id=?,updated_at=NOW() WHERE condition_id=?',
          [name, behavesAs, description, isActive, account, id])
        return fetchOne(connection, id)
      })
    },

    async remove(actor: unknown, rawId: unknown) {
      accountId(actor)
      const id = positiveId(rawId)
      return transaction(async connection => {
        const current = await fetchOne(connection, id, true)
        if (current.isBase) throw new HttpError(422, 'COPY_CONDITION_BASE_LOCKED', 'The five base conditions cannot be deleted.')
        if (current.copies > 0) throw new HttpError(409, 'COPY_CONDITION_IN_USE', 'Copies use this condition, so it can only be retired.')
        await connection.execute('DELETE FROM copy_conditions WHERE condition_id=?', [id])
        return { conditionId: id }
      })
    },

    /** What to store for a chosen condition: the base condition, plus the custom detail when it is not a base one. */
    async resolve(rawId: unknown, executor: Pool | PoolConnection = database) {
      const id = positiveId(rawId)
      const condition = await fetchOne(executor, id)
      if (!condition.isActive) throw new HttpError(422, 'COPY_CONDITION_RETIRED', `${condition.name} is retired. Choose a current condition.`)
      return { conditionState: condition.behavesAs, detailId: condition.isBase ? null : condition.conditionId, name: condition.name }
    },
  }
}

export const copyConditionsService = createCopyConditionsService()
