import type { PreviewCredit } from '../payments/preview-balances.ts'
import { randomBytes } from 'node:crypto'
import { db, type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { centavos, positiveId } from '../payments/payments.validation.ts'

type Actor = { accountId?: number;role?:string }
type PaymentGuard = {
  withLock<T>(run: () => Promise<T>): Promise<T>
  guard(connection: PoolConnection, chargeId: number): Promise<void>
  credits?(actor:Actor):Promise<PreviewCredit[]>
}
type ReceiptSummary = { servicePaymentId: number; receiptNumber: string; amountPaid: number; status: string; receivedAt: unknown }
export type ServiceCharge = {
  chargeId: number; userId: number; userName: string; schoolId: string; description: string
  assessed: number; paid: number; balance: number; status: string; createdAt: unknown; version: number; receipts: ReceiptSummary[]
}
export type ServiceChargeReceipt = {
  servicePaymentId: number; chargeId: number; receiptNumber: string; verificationCode: string; status: string
  studentName: string; schoolId: string; description: string; amountPaid: number; balanceBefore: number; balanceAfter: number
  receivedBy: string; receivedAt: unknown; reversedAt: unknown; reversalReason: string | null
}

const error = (status: number, code: string, message: string) => new HttpError(status, code, message)
function object(body: Record<string, unknown>, allowed: string[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) {
    throw error(422, 'SERVICE_CHARGE_INVALID', 'Review the service charge details and try again.')
  }
}
function text(value: unknown, label: string, minimum = 3, maximum = 1000) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (result.length < minimum || result.length > maximum || /[\u0000-\u001f\u007f]/.test(result)) {
    throw error(422, 'SERVICE_CHARGE_INVALID', `Enter ${label}, between ${minimum} and ${maximum} characters.`)
  }
  return result
}
function requestKey(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)) {
    throw error(422, 'SERVICE_CHARGE_REQUEST_INVALID', 'Start a new payment entry and try again.')
  }
  return value.toLowerCase()
}
function money(value: bigint) { return `${value / 100n}.${String(value % 100n).padStart(2, '0')}` }
function storedMoney(value: unknown) { return String(value) === '0' || String(value) === '0.00' ? 0n : centavos(value) }

/** Actual issued collections only. Practice credits and unpaid amounts never enter cash totals. */
export function serviceChargePaidSql(alias = 'c') {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid service charge SQL alias')
  return `COALESCE((SELECT SUM(p.amount_paid) FROM library_service_cash_payments p WHERE p.charge_id=${alias}.charge_id AND p.receipt_status='Issued'),0)`
}

const detailsSql = `SELECT c.*,u.full_name,u.school_id,${serviceChargePaidSql()} paid_amount,
  COALESCE((SELECT json_agg(json_build_object('servicePaymentId',p.service_payment_id,'receiptNumber',p.receipt_number,
    'amountPaid',p.amount_paid,'status',p.receipt_status,'receivedAt',p.received_at) ORDER BY p.received_at DESC,p.service_payment_id DESC)
    FROM library_service_cash_payments p WHERE p.charge_id=c.charge_id),'[]'::json) receipts
  FROM library_service_charges c JOIN users u ON u.user_id=c.user_id`

function mapCharge(row: RowDataPacket): ServiceCharge {
  const assessed = Number(row.amount_assessed), paid = Number(row.paid_amount)
  const cancelled = row.charge_status === 'Cancelled', balance = cancelled ? 0 : Number((assessed - paid).toFixed(2))
  return { chargeId: Number(row.charge_id), userId: Number(row.user_id), userName: row.full_name, schoolId: row.school_id,
    description: row.description, assessed, paid, balance, status: cancelled ? 'Cancelled' : balance <= 0 ? 'Paid' : paid > 0 ? 'Partially paid' : 'Unpaid',
    createdAt: row.created_at, version: Number(row.version), receipts: (row.receipts ?? []).map((receipt: ReceiptSummary) => ({
      ...receipt, servicePaymentId: Number(receipt.servicePaymentId), amountPaid: Number(receipt.amountPaid),
    })) }
}
function mapReceipt(row: RowDataPacket): ServiceChargeReceipt {
  return { servicePaymentId: Number(row.service_payment_id), chargeId: Number(row.charge_id), receiptNumber: row.receipt_number,
    verificationCode: row.verification_code, status: row.receipt_status, studentName: row.student_name_snapshot,
    schoolId: row.school_id_snapshot, description: row.description_snapshot, amountPaid: Number(row.amount_paid),
    balanceBefore: Number(row.balance_before), balanceAfter: Number(row.balance_after), receivedBy: row.received_by_name_snapshot,
    receivedAt: row.received_at, reversedAt: row.reversed_at, reversalReason: row.reversal_reason }
}

export function createServiceChargesService(database: Pool = db, paymentGuard?: PaymentGuard) {
  async function transaction<T>(run: (q: PoolConnection) => Promise<T>) {
    const q = await database.getConnection()
    try { await q.beginTransaction(); const result = await run(q); await q.commit(); return result }
    catch (cause) { await q.rollback(); throw cause }
    finally { q.release() }
  }
  async function profile(q: Pick<PoolConnection, 'execute'>, actor: Actor, admin: boolean, management = false) {
    if (!Number.isSafeInteger(actor.accountId) || Number(actor.accountId) < 1) throw error(401, 'JWT_REQUIRED', 'Sign in again.')
    await requireLibraryActor(q, actor.accountId!, admin ? management ? 'library.manage' : 'desk.operate' : 'self-service.use')
    const [rows] = await q.execute<RowDataPacket[]>(`SELECT u.user_id,u.full_name,u.school_id FROM accounts a JOIN users u ON u.user_id=a.user_id WHERE a.account_id=?`, [actor.accountId])
    if (!rows[0]) throw error(403, 'SERVICE_CHARGE_PROFILE_REQUIRED', 'Your account needs a linked library profile.')
    return rows[0]
  }
  async function charge(q: Pick<PoolConnection, 'execute'>, id: number) {
    const [rows] = await q.execute<RowDataPacket[]>(`${detailsSql} WHERE c.charge_id=?`, [id])
    if (!rows[0]) throw error(404, 'SERVICE_CHARGE_NOT_FOUND', 'The service charge was not found.')
    return mapCharge(rows[0])
  }
  async function project(rows:RowDataPacket[],actor:Actor){
    const credits=await paymentGuard?.credits?.(actor)??[]
    return rows.map(row=>{const charge=mapCharge(row);if(charge.status==='Cancelled')return charge
      const applied=Math.min(Math.round(charge.balance*100),credits.filter(c=>c.kind==='Other'&&c.targetId===charge.chargeId&&(c.userId===undefined||c.userId===charge.userId)).reduce((sum,c)=>sum+c.principalCentavos,0))
      if(!applied)return charge
      const balance=Math.max(0,Math.round(charge.balance*100)-applied)/100
      return {...charge,balance,status:balance===0?'Paid':'Partially paid'}
    })
  }
  const withPaymentLock = <T>(run: () => Promise<T>) => paymentGuard ? paymentGuard.withLock(run) : run()

  return {
    async create(actor: Actor, body: Record<string, unknown>) {
      object(body, ['school_id', 'description', 'amount', 'request_key'])
      const schoolId = text(body.school_id, 'a School ID', 1, 30), description = text(body.description, 'a service description')
      const assessed = centavos(body.amount), key = requestKey(body.request_key)
      return transaction(async q => {
        const staff = await profile(q, actor, true, true)
        // The form key serializes retries before a new charge can be inserted.
        await q.execute('SELECT pg_advisory_xact_lock(hashtextextended(?,0))', [`service-charge:${key}`])
        const [prior] = await q.execute<RowDataPacket[]>('SELECT c.*,u.school_id FROM library_service_charges c JOIN users u ON u.user_id=c.user_id WHERE c.request_key=?', [key])
        if (prior[0]) {
          const row = prior[0]
          if (row.school_id !== schoolId || row.description !== description || centavos(row.amount_assessed) !== assessed || Number(row.created_by_user_id) !== Number(staff.user_id)) {
            throw error(409, 'SERVICE_CHARGE_RETRY_CHANGED', 'This entry was already saved. Start a new entry to change its details.')
          }
          return charge(q, Number(row.charge_id))
        }
        const [users] = await q.execute<RowDataPacket[]>(`SELECT user_id FROM users WHERE school_id=? AND account_status='Active' AND user_role IN ('Student','Faculty') FOR SHARE`, [schoolId])
        if (!users[0]) throw error(422, 'SERVICE_CHARGE_USER_INVALID', 'Choose an active Student or Faculty School ID.')
        const [saved] = await q.execute<ResultSetHeader>(`INSERT INTO library_service_charges(user_id,description,amount_assessed,created_by_user_id,request_key)
          VALUES(?,?,?,?,?) RETURNING charge_id`, [users[0].user_id, description, money(assessed), staff.user_id, key])
        return charge(q, saved.insertId)
      })
    },
    async own(actor: Actor, query: Record<string, unknown> = {}) {
      const user = await profile(database, actor, false), page = query.page === undefined ? 1 : positiveId(query.page)
      if (page > 10000) throw error(422, 'SERVICE_CHARGE_PAGE_INVALID', 'Choose an earlier results page.')
      const [counts] = await database.execute<RowDataPacket[]>('SELECT COUNT(*) total FROM library_service_charges WHERE user_id=?', [user.user_id])
      const [rows] = await database.execute<RowDataPacket[]>(`${detailsSql} WHERE c.user_id=? ORDER BY c.created_at DESC,c.charge_id DESC LIMIT 25 OFFSET ${(page - 1) * 25}`, [user.user_id])
      return { rows: await project(rows,actor), pagination: { page, limit: 25, total: Number(counts[0].total) } }
    },
    async admin(actor: Actor, query: Record<string, unknown> = {}) {
      await profile(database, actor, true)
      const page = query.page === undefined ? 1 : positiveId(query.page)
      if (page > 10000) throw error(422, 'SERVICE_CHARGE_PAGE_INVALID', 'Choose an earlier results page.')
      const search = query.q === undefined || query.q === '' ? '' : text(query.q, 'a search', 1, 100)
      const where = search ? ` WHERE (u.school_id ILIKE ? OR u.full_name ILIKE ? OR c.description ILIKE ?)` : ''
      const values = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : []
      const [counts] = await database.execute<RowDataPacket[]>(`SELECT COUNT(*) total FROM library_service_charges c JOIN users u ON u.user_id=c.user_id${where}`, values)
      const [rows] = await database.execute<RowDataPacket[]>(`${detailsSql}${where} ORDER BY c.created_at DESC,c.charge_id DESC LIMIT 25 OFFSET ${(page - 1) * 25}`, values)
      return { rows: await project(rows,actor), pagination: { page, limit: 25, total: Number(counts[0].total) } }
    },
    async recordCash(actor: Actor, id: unknown, body: Record<string, unknown>) {
      object(body, ['amount_paid', 'request_key'])
      const chargeId = positiveId(id), amount = centavos(body.amount_paid), key = requestKey(body.request_key)
      return withPaymentLock(() => transaction(async q => {
        const staff = await profile(q, actor, true)
        const [rows] = await q.execute<RowDataPacket[]>(`SELECT c.*,u.full_name,u.school_id FROM library_service_charges c JOIN users u ON u.user_id=c.user_id WHERE c.charge_id=? FOR UPDATE OF c`, [chargeId])
        const row = rows[0]
        if (!row) throw error(404, 'SERVICE_CHARGE_NOT_FOUND', 'The service charge was not found.')
        const [prior] = await q.execute<RowDataPacket[]>('SELECT * FROM library_service_cash_payments WHERE charge_id=? AND request_key=?', [chargeId, key])
        if (prior[0]) {
          if (centavos(prior[0].amount_paid) !== amount || Number(prior[0].received_by_user_id) !== Number(staff.user_id)) {
            throw error(409, 'SERVICE_CHARGE_RETRY_CHANGED', 'This payment entry was already saved. Review the payment history.')
          }
          return mapReceipt(prior[0])
        }
        if (row.charge_status !== 'Active') throw error(409, 'SERVICE_CHARGE_CANCELLED', 'This charge was cancelled and cannot receive payment.')
        await paymentGuard?.guard(q, chargeId)
        const [totals] = await q.execute<RowDataPacket[]>(`SELECT ${serviceChargePaidSql()} paid FROM library_service_charges c WHERE c.charge_id=?`, [chargeId])
        const balance = centavos(row.amount_assessed) - storedMoney(totals[0].paid)
        if (amount > balance) throw error(409, 'SERVICE_CHARGE_OVERPAYMENT', 'Enter an amount within the remaining balance. Refresh if another staff member collected payment.')
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '')
        const receiptNumber = `SR-${date}-${randomBytes(6).toString('hex').toUpperCase()}`
        const verificationCode = randomBytes(8).toString('hex').toUpperCase()
        const [saved] = await q.execute<ResultSetHeader>(`INSERT INTO library_service_cash_payments(charge_id,amount_paid,request_key,received_by_user_id,
          receipt_number,verification_code,student_name_snapshot,school_id_snapshot,description_snapshot,received_by_name_snapshot,balance_before,balance_after)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`, [chargeId, money(amount), key, staff.user_id, receiptNumber, verificationCode, row.full_name, row.school_id,
          row.description, staff.full_name, money(balance), money(balance - amount)])
        await q.execute('UPDATE library_service_charges SET version=version+1 WHERE charge_id=?', [chargeId])
        return mapReceipt(saved.rows[0])
      }))
    },
    async cancel(actor: Actor, id: unknown, body: Record<string, unknown>) {
      object(body, ['reason', 'version'])
      const chargeId = positiveId(id), reason = text(body.reason, 'a cancellation reason'), version = positiveId(body.version)
      return withPaymentLock(() => transaction(async q => {
        const staff = await profile(q, actor, true, true)
        const [rows] = await q.execute<RowDataPacket[]>('SELECT * FROM library_service_charges WHERE charge_id=? FOR UPDATE', [chargeId])
        const row = rows[0]
        if (!row) throw error(404, 'SERVICE_CHARGE_NOT_FOUND', 'The service charge was not found.')
        if (Number(row.version) !== version) throw error(409, 'SERVICE_CHARGE_CHANGED', 'This charge changed. Refresh and review it again.')
        if (row.charge_status !== 'Active') throw error(409, 'SERVICE_CHARGE_CANCELLED', 'This charge is already cancelled.')
        await paymentGuard?.guard(q, chargeId)
        const [totals] = await q.execute<RowDataPacket[]>(`SELECT ${serviceChargePaidSql()} paid FROM library_service_charges c WHERE c.charge_id=?`, [chargeId])
        if (storedMoney(totals[0].paid) > 0n) throw error(409, 'SERVICE_CHARGE_HAS_PAYMENTS', 'A charge with received payments cannot be cancelled. Review its payments first.')
        await q.execute(`UPDATE library_service_charges SET charge_status='Cancelled',cancelled_by_user_id=?,cancelled_at=NOW(),cancellation_reason=?,version=version+1 WHERE charge_id=?`, [staff.user_id, reason, chargeId])
        return charge(q, chargeId)
      }))
    },
    async receipt(actor: Actor, id: unknown, admin = false) {
      const user = await profile(database, actor, admin), paymentId = positiveId(id)
      const [rows] = await database.execute<RowDataPacket[]>(`SELECT p.* FROM library_service_cash_payments p JOIN library_service_charges c ON c.charge_id=p.charge_id
        WHERE p.service_payment_id=?${admin ? '' : ' AND c.user_id=?'}`, admin ? [paymentId] : [paymentId, user.user_id])
      if (!rows[0]) throw error(404, 'SERVICE_CHARGE_RECEIPT_NOT_FOUND', 'The payment record was not found.')
      return mapReceipt(rows[0])
    },
  }
}

export const serviceChargesService = createServiceChargesService()
