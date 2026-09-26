/** Tests the student-to-admin lost-book handoff without committing library records. */
import dotenv from 'dotenv'

dotenv.config({ path: new URL('../../apps/api/.env', import.meta.url), quiet: true })
if (!process.env.DATABASE_URL) throw new Error('A Supabase DATABASE_URL is required')
const url = new URL(process.env.DATABASE_URL)
url.port = '6543'
process.env.DATABASE_URL = url.toString()

const { db } = await import('../../apps/api/src/config/db.js')
const { env } = await import('../../apps/api/src/config/env.js')
const { createClearanceService } = await import('../../apps/api/src/modules/clearance/clearance.service.ts')
if (env.db.driver !== 'postgres') throw new Error('Refusing to test a non-Postgres database')

const connection = await db.getConnection()
let transactionStarted = false
try {
  await connection.beginTransaction()
  transactionStarted = true
  const [loans] = await connection.execute(
    `SELECT a.account_id,a.user_id,bt.transaction_id,bt.transaction_status
       FROM accounts a JOIN borrow_transactions bt ON bt.user_id=a.user_id
       LEFT JOIN lost_book_reports l ON l.transaction_id=bt.transaction_id
      WHERE a.role='Student' AND a.account_status='Active' AND a.user_id IS NOT NULL
        AND bt.transaction_status IN ('Borrowed','Overdue','Returned')
        AND l.lost_book_report_id IS NULL
      ORDER BY CASE WHEN bt.transaction_status IN ('Borrowed','Overdue') THEN 0 ELSE 1 END,
               bt.transaction_id LIMIT 1`,
  )
  const [staff] = await connection.execute(
    "SELECT account_id FROM accounts WHERE role='Admin' AND account_status='Active' AND user_id IS NOT NULL ORDER BY account_id LIMIT 1",
  )
  if (!loans.length || !staff.length) throw new Error('A linked Student loan and linked Admin are required for this smoke check')
  const loan = loans[0]
  if (loan.transaction_status === 'Returned') {
    await connection.execute("UPDATE borrow_transactions SET transaction_status='Borrowed' WHERE transaction_id=?", [loan.transaction_id])
  }

  const safeConnection = {
    execute: (...args) => connection.execute(...args),
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
  }
  const service = createClearanceService({
    execute: (...args) => connection.execute(...args), getConnection: async () => safeConnection,
  })
  const borrower = { accountId: Number(loan.account_id), role: 'Student' }
  const admin = { accountId: Number(staff[0].account_id), role: 'Admin' }
  const report = await service.reportLost(borrower, loan.transaction_id)
  const [alerts] = await connection.execute(
    "SELECT admin_notification_id FROM admin_notifications WHERE borrow_transaction_id=? AND event_type='lost_book_reported' ORDER BY admin_notification_id DESC LIMIT 1",
    [loan.transaction_id],
  )
  if (!alerts.length) throw new Error('Student report did not create an Admin alert')
  const pending = await service.list(admin, {})
  if (!pending.pendingLostReports.some((item) => item.lostBookReportId === report.lostBookReportId && item.userId === Number(loan.user_id))) {
    throw new Error('Student report is absent from the Admin review queue')
  }
  const detail = await service.detail(admin, loan.user_id)
  if (!detail.lostBooks.some((item) => item.lostBookReportId === report.lostBookReportId && item.status === 'Pending')) {
    throw new Error('Pending report is absent from the Admin borrower detail')
  }
  await service.decideLost(admin, report.lostBookReportId, { status: 'Rejected', notes: 'Rollback-only smoke check' })
  const afterDecision = await service.list(admin, {})
  if (afterDecision.pendingLostReports.some((item) => item.lostBookReportId === report.lostBookReportId)) {
    throw new Error('Reviewed report remains in the pending queue')
  }
  process.stdout.write('Supabase lost-book report, Admin alert, review queue, and rejection passed inside one rollback-only transaction.\n')
} finally {
  if (transactionStarted) await connection.rollback()
  connection.release()
  await db.end()
}
