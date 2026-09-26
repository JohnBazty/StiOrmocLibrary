/** Controlled production API acceptance using only disposable student/book records. */
import dotenv from 'dotenv'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'

dotenv.config({ path: new URL('../../apps/api/.env', import.meta.url), quiet: true })
const { env } = await import('../../apps/api/src/config/env.js')
if (env.db.driver !== 'postgres') throw new Error('Supabase Postgres is required')
const dbUrl = new URL(env.db.connectionString)
dbUrl.port = '6543'
const db = new pg.Client({ connectionString: dbUrl.toString() })
const base = (process.argv[2] ?? 'https://sti-ormoc-smart-library.vercel.app').replace(/\/$/, '')
const suffix = randomBytes(5).toString('hex').toUpperCase()
const schoolId = `PHASE1-${suffix}`
const password = randomBytes(24).toString('base64url')
const title = `Phase 1 acceptance book ${suffix}`
const barcode = `PHASE1-BOOK-${suffix}`
const accession = `PHASE1-ACC-${suffix}`
let userId = null
let accountId = null
let titleId = null
let materialId = null
let copyId = null
let connected = false

async function api(path, method = 'GET', body, token, expectedStatus = 200) {
  const response = await fetch(base + path, {
    method,
    headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  })
  const payload = await response.json().catch(() => ({}))
  if (response.status !== expectedStatus || (expectedStatus < 400 && !payload.success)) {
    throw new Error(`${method} ${path}: HTTP ${response.status}, ${payload.code ?? 'UNKNOWN'}`)
  }
  return payload
}

async function cleanup() {
  if (!connected) return
  const existingAccount = await db.query('SELECT account_id,user_id FROM accounts WHERE school_id=$1 LIMIT 1', [schoolId])
  accountId ??= existingAccount.rows[0]?.account_id ? Number(existingAccount.rows[0].account_id) : null
  userId ??= existingAccount.rows[0]?.user_id ? Number(existingAccount.rows[0].user_id) : null
  if (!titleId) {
    const existingTitle = await db.query('SELECT title_id FROM titles WHERE title=$1 LIMIT 1', [title])
    titleId = existingTitle.rows[0]?.title_id ? Number(existingTitle.rows[0].title_id) : null
  }
  if (!materialId) {
    const existingMaterial = await db.query('SELECT material_id FROM materials WHERE barcode=$1 LIMIT 1', [barcode])
    materialId = existingMaterial.rows[0]?.material_id ? Number(existingMaterial.rows[0].material_id) : null
  }
  await db.query('BEGIN')
  try {
    if (userId) {
      await db.query(`DELETE FROM fine_payment_allocations WHERE fine_id IN (SELECT fine_id FROM fines WHERE user_id=$1)
        OR fine_payment_receipt_id IN (SELECT fine_payment_receipt_id FROM fine_payment_receipts WHERE user_id=$1)
        OR lost_book_report_id IN (SELECT lost_book_report_id FROM lost_book_reports WHERE user_id=$1)`, [userId])
      await db.query('DELETE FROM fine_payment_receipts WHERE user_id=$1', [userId])
      await db.query('DELETE FROM fine_infractions WHERE fine_id IN (SELECT fine_id FROM fines WHERE user_id=$1)', [userId])
      await db.query('DELETE FROM fine_adjustments WHERE fine_id IN (SELECT fine_id FROM fines WHERE user_id=$1)', [userId])
      await db.query('DELETE FROM fines WHERE user_id=$1', [userId])
      await db.query('DELETE FROM lost_book_reports WHERE user_id=$1', [userId])
      await db.query(`DELETE FROM admin_notifications WHERE actor_user_id=$1
        OR borrow_transaction_id IN (SELECT transaction_id FROM borrow_transactions WHERE user_id=$1)
        OR reservation_id IN (SELECT reservation_id FROM reservations WHERE user_id=$1)`, [userId])
      await db.query('DELETE FROM borrow_transactions WHERE user_id=$1', [userId])
      await db.query('DELETE FROM reservations WHERE user_id=$1', [userId])
      await db.query('DELETE FROM notifications WHERE user_id=$1', [userId])
      await db.query('DELETE FROM clearance_statuses WHERE user_id=$1', [userId])
      await db.query('DELETE FROM attendance_qr_credentials WHERE user_id=$1', [userId])
    }
    if (accountId) {
      await db.query('DELETE FROM student_profiles WHERE account_id=$1', [accountId])
      await db.query('UPDATE accounts SET user_id=NULL WHERE account_id=$1', [accountId])
      await db.query('DELETE FROM accounts WHERE account_id=$1', [accountId])
    }
    if (userId) await db.query('DELETE FROM users WHERE user_id=$1', [userId])
    if (titleId) {
      await db.query('DELETE FROM admin_notifications WHERE book_title_id=$1', [titleId])
      await db.query('DELETE FROM physical_copies WHERE title_id=$1', [titleId])
      if (materialId) await db.query('DELETE FROM materials WHERE material_id=$1', [materialId])
      await db.query('DELETE FROM authors WHERE title_id=$1', [titleId])
      await db.query('DELETE FROM titles WHERE title_id=$1', [titleId])
    }
    await db.query('COMMIT')
    const { rows } = await db.query(`SELECT
      (SELECT COUNT(*) FROM users WHERE school_id=$1) AS users,
      (SELECT COUNT(*) FROM accounts WHERE school_id=$1) AS accounts,
      (SELECT COUNT(*) FROM titles WHERE title=$2) AS titles,
      (SELECT COUNT(*) FROM materials WHERE barcode=$3) AS materials,
      (SELECT COUNT(*) FROM physical_copies WHERE barcode=$3) AS copies`, [schoolId, title, barcode])
    if (Object.values(rows[0]).some((value) => Number(value) !== 0)) throw new Error('Temporary rows remain after cleanup')
    console.log('All temporary student, book, loan, reservation, fine, payment, and report rows removed.')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}

try {
  await db.connect()
  connected = true
  const health = await api('/api/health')
  if (health.data?.database?.driver === 'mysql') throw new Error('The live API is using MySQL')
  const registration = await api('/api/v1/auth/register', 'POST', {
    school_id: schoolId, first_name: 'Phase', last_name: 'One Test', contact_number: '09000000000',
    program_strand: 'BS Information Technology', year_grade_level: '4th Year',
    password, confirm_password: password,
  }, undefined, 201)
  if (!registration.success) throw new Error('Temporary registration did not succeed')
  const identity = await db.query('SELECT account_id,user_id FROM accounts WHERE school_id=$1', [schoolId])
  accountId = Number(identity.rows[0]?.account_id)
  userId = Number(identity.rows[0]?.user_id)
  if (!accountId || !userId) throw new Error('Temporary student was not linked')
  const login = await api('/api/v1/auth/login', 'POST', { school_id: schoolId, login_as: 'Student', password }, undefined)
  const studentToken = login.data?.token
  if (!studentToken) throw new Error('Student login supplied no token')
  const admin = await db.query("SELECT account_id,school_id FROM accounts WHERE role='Admin' AND account_status='Active' AND user_id IS NOT NULL ORDER BY account_id LIMIT 1")
  if (!admin.rows[0]) throw new Error('No linked active Admin')
  const adminAccountId = Number(admin.rows[0].account_id)
  const adminToken = jwt.sign({ accountId: adminAccountId, userId: adminAccountId,
    schoolId: admin.rows[0].school_id, role: 'Admin' }, env.jwt.secret,
    { algorithm: 'HS256', issuer: env.jwt.issuer, audience: env.jwt.audience,
      subject: String(adminAccountId), expiresIn: '15m' })
  const category = await db.query('SELECT category_id,shelf_location FROM categories ORDER BY category_id LIMIT 1')
  if (!category.rows[0]) throw new Error('No category for the temporary title')
  const cat = category.rows[0]
  const insertedTitle = await db.query(`INSERT INTO titles(category_id,record_type,title,normalized_title,lifecycle_status)
    VALUES ($1,'Book',$2,$3,'Active') RETURNING title_id`, [cat.category_id, title, title.toLowerCase()])
  titleId = Number(insertedTitle.rows[0].title_id)
  await db.query(`INSERT INTO authors(title_id,author_name,normalized_name,author_order)
    VALUES ($1,'Phase One Test','phase one test',1)`, [titleId])
  const insertedMaterial = await db.query(`INSERT INTO materials(category_id,barcode,title,author,shelf_location,material_type,availability_status)
    VALUES ($1,$2,$3,'Phase One Test',$4,'Book','Unavailable') RETURNING material_id`,
    [cat.category_id, barcode, title, cat.shelf_location])
  materialId = Number(insertedMaterial.rows[0].material_id)
  const insertedCopy = await db.query(`INSERT INTO physical_copies(title_id,material_id,barcode,accession_number,shelf_location,availability_status,lifecycle_status)
    VALUES ($1,$2,$3,$4,$5,'Unavailable','Active') RETURNING physical_copy_id`,
    [titleId, materialId, barcode, accession, cat.shelf_location])
  copyId = Number(insertedCopy.rows[0].physical_copy_id)

  const reserved = await api('/api/v1/reservations/request', 'POST', { bookTitleId: titleId }, studentToken, 201)
  const reservationId = Number(reserved.data?.reservationId)
  if (!reservationId || reserved.data?.status !== 'pending') throw new Error('Reservation was not pending')
  const listed = await api('/api/v1/reservations', 'GET', undefined, studentToken)
  if (!listed.data?.some((item) => Number(item.reservationId) === reservationId)) throw new Error('Student reservation list did not update')
  const duplicate = await api('/api/v1/reservations/request', 'POST', { bookTitleId: titleId }, studentToken, 422)
  if (duplicate.code !== 'DUPLICATE_ACTIVE_RESERVATION') throw new Error('Duplicate reservation was not rejected clearly')
  await api(`/api/v1/reservations/${reservationId}/cancel`, 'PUT', undefined, studentToken)
  console.log('Live reservation create/list/duplicate prevention/cancel passed.')

  await db.query("UPDATE physical_copies SET availability_status='Available' WHERE physical_copy_id=$1", [copyId])
  await db.query("UPDATE materials SET availability_status='Available' WHERE material_id=$1", [materialId])
  const borrow = await api('/api/v1/borrow/submit-request', 'POST', { title_ids: [titleId] }, studentToken, 201)
  const loanId = Number(borrow.data?.items?.[0]?.transactionId)
  if (!loanId) throw new Error('Borrow request supplied no loan ID')
  const checkout = await api('/api/v1/circulation/fulfill-claim', 'POST', { barcode, school_id: schoolId }, adminToken, 201)
  if (Number(checkout.data?.transactionId) !== loanId || checkout.data?.status !== 'Borrowed') throw new Error('Counter checkout did not match loan')
  const lost = await api(`/api/v1/clearance/lost-books/${loanId}/report`, 'POST', undefined, studentToken, 201)
  const reportId = Number(lost.data?.lostBookReportId)
  if (!reportId || lost.data?.status !== 'Pending') throw new Error('Lost-book report was not pending')
  const queue = await api('/api/v1/admin/clearance?limit=1', 'GET', undefined, adminToken)
  if (!queue.data?.pendingLostReports?.some((item) => Number(item.lostBookReportId) === reportId)) throw new Error('Admin lost-report queue did not update')
  const detail = await api(`/api/v1/admin/clearance/${userId}`, 'GET', undefined, adminToken)
  if (!JSON.stringify(detail.data).includes(String(reportId))) throw new Error('Admin borrower detail omitted the report')
  await api(`/api/v1/admin/clearance/lost-books/${reportId}`, 'PATCH',
    { status: 'Rejected', notes: 'Temporary Phase 1 deployment acceptance test' }, adminToken)
  const afterDecision = await api('/api/v1/admin/clearance?limit=1', 'GET', undefined, adminToken)
  if (afterDecision.data?.pendingLostReports?.some((item) => Number(item.lostBookReportId) === reportId)) throw new Error('Decided report remained pending')
  await api(`/api/v1/admin/borrowing/${loanId}/return`, 'PUT', undefined, adminToken)
  console.log('Live borrow, student lost report, Admin queue/detail, staff decision, and return passed.')

  const fine = await api('/api/v1/admin/fines/infractions', 'POST', {
    schoolId, category: 'Temporary acceptance test', amount: 1,
    incidentAt: new Date().toISOString(), details: 'Synthetic Phase 1 payment test only; no cash received.'
  }, adminToken, 201)
  const fineId = Number(fine.data?.fineId)
  if (!fineId) throw new Error('Test fine was not created')
  const requestKey = `phase1_${suffix}`
  const paymentBody = { requestKey, allocations: [{ fineId, amount: 1 }], notes: 'Synthetic acceptance test; no cash received.' }
  const payment = await api('/api/v1/admin/fines/payments', 'POST', paymentBody, adminToken, 201)
  const receiptId = Number(payment.data?.receiptId)
  if (!receiptId || payment.data?.amountReceived !== 1) throw new Error('Payment result was incomplete')
  const repeated = await api('/api/v1/admin/fines/payments', 'POST', paymentBody, adminToken, 201)
  if (Number(repeated.data?.receiptId) !== receiptId) throw new Error('Payment idempotency failed')
  const receipt = await api(`/api/v1/admin/fines/receipts/${receiptId}`, 'GET', undefined, adminToken)
  if (Number(receipt.data?.receiptId) !== receiptId) throw new Error('Payment record is not readable')
  console.log('Live synthetic fine payment, idempotency, and payment-record read passed.')
} catch (error) {
  console.error(`Phase 1 live acceptance failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  try { await cleanup() } catch (error) {
    console.error(`Phase 1 cleanup needs attention: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
  if (connected) await db.end()
}
