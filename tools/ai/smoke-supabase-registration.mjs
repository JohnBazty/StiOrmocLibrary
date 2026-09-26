/** End-to-end web -> API -> Supabase student smoke test.
 * Creates one random student, verifies login and key read-only pages, then removes it.
 * Run from the repository root with a local or deployed web URL.
 */
import pg from 'pg'
import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument } from 'pdf-lib'
import { env } from '../../apps/api/src/config/env.js'

if (env.db.driver !== 'postgres') throw new Error('Supabase DATABASE_URL required.')
const dbUrl = new URL(env.db.connectionString)
if (dbUrl.hostname.endsWith('.pooler.supabase.com') && dbUrl.port === '5432') dbUrl.port = '6543'
const db = new pg.Client({ connectionString: dbUrl.toString() })
const baseUrl = process.argv[2] ?? 'http://localhost:5173'
const schoolId = `SMOKE-${randomBytes(6).toString('hex').toUpperCase()}`
const password = randomBytes(18).toString('base64url')
let connected = false
let printRequestId = null
let borrowTransactionId = null
async function checkPages(paths, token) {
  const results = await Promise.all(paths.map(async (page) => {
    const result = await fetch(new URL(page, baseUrl), {
      headers: { authorization: `Bearer ${token}` },
    })
    const body = await result.json()
    return { page, status: result.status, code: body.code, success: body.success }
  }))
  const failed = results.filter((result) => result.status !== 200 || !result.success)
  if (failed.length) {
    throw new Error(failed.map(({ page, status, code }) => `${page}: HTTP ${status}, ${code ?? 'unknown'}`).join('; '))
  }
}
try {
  await db.connect()
  connected = true
  const register = await fetch(new URL('/api/v1/auth/register', baseUrl), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      school_id: schoolId, first_name: 'Migration', last_name: 'Smoke',
      contact_number: '09000000000', program_strand: 'BS Information Technology',
      year_grade_level: '4th Year', password, confirm_password: password,
    }),
  })
  const registerJson = await register.json()
  if (register.status !== 201 || !registerJson.success) {
    throw new Error(`Registration failed: HTTP ${register.status}, ${registerJson.code ?? 'unknown'}`)
  }
  const login = await fetch(new URL('/api/v1/auth/login', baseUrl), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ school_id: schoolId, login_as: 'Student', password }),
  })
  const loginJson = await login.json()
  if (login.status !== 200 || !loginJson.success || !loginJson.data?.token) {
    throw new Error(`Login failed: HTTP ${login.status}, ${loginJson.code ?? 'unknown'}`)
  }
  await checkPages([
    '/api/v1/dashboard',
    '/api/v1/catalog/books',
    '/api/v1/notifications',
  ], loginJson.data.token)
  await checkPages([
    '/api/v1/dashboard', '/api/v1/catalog/books', '/api/v1/notifications',
    '/api/v1/borrowing/history', '/api/v1/reservations', '/api/v1/attendance/pass',
    '/api/v1/fines/me', '/api/v1/printing/requests', '/api/v1/clearance/me',
    '/api/v1/floor-plan',
  ], loginJson.data.token)
  if (process.argv.includes('--printing')) {
    const form = new FormData()
    const smokePdf = await PDFDocument.create()
    smokePdf.addPage()
    const fileBlob = new Blob([await smokePdf.save()], { type: 'application/pdf' })
    form.set('document', fileBlob, 'printing-smoke.pdf')
    form.set('number_of_copies', '1')
    form.set('page_count', '1')
    form.set('print_type', 'Monochrome')
    form.set('paper_size', 'A4')
    const quoted = await fetch(new URL('/api/v1/printing/quote', baseUrl), {
      method: 'POST', headers: { authorization: `Bearer ${loginJson.data.token}` }, body: form,
    })
    const quote = await quoted.json()
    if (quoted.status !== 200 || quote.data?.page_count !== 1 || !Number.isFinite(Number(quote.data?.calculated_cost))) {
      throw new Error(`Print quote failed: HTTP ${quoted.status}, ${quote.code ?? 'unknown'}`)
    }
    form.set('document_sha256', quote.data.document_sha256)
    form.set('quoted_cost', String(quote.data.calculated_cost))
    const submitted = await fetch(new URL('/api/v1/printing/requests', baseUrl), {
      method: 'POST', headers: { authorization: `Bearer ${loginJson.data.token}` }, body: form,
    })
    const submission = await submitted.json()
    if (submitted.status !== 201 || !submission.success) throw new Error(`Print upload failed: HTTP ${submitted.status}, ${submission.code ?? 'unknown'}`)
    printRequestId = Number(submission.data.request_id)
    const [admin] = (await db.query("SELECT account_id, school_id FROM accounts WHERE role='Admin' AND account_status='Active' LIMIT 1")).rows
    if (!admin) throw new Error('No active admin account for print download smoke test.')
    const adminToken = jwt.sign({ accountId: Number(admin.account_id), userId: Number(admin.account_id), schoolId: admin.school_id, role: 'Admin' }, env.jwt.secret, { issuer: env.jwt.issuer, audience: env.jwt.audience, expiresIn: 60 })
    const downloaded = await fetch(new URL(`/api/v1/admin/printing/requests/${printRequestId}/document`, baseUrl), {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const bytes = Buffer.from(await downloaded.arrayBuffer())
    if (downloaded.status !== 200 || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error(`Admin print download failed: HTTP ${downloaded.status}`)
    await db.query("UPDATE print_requests SET payment_status='Paid' WHERE request_id=$1", [printRequestId])
    const started = await fetch(new URL(`/api/v1/admin/printing/requests/${printRequestId}/status`, baseUrl), {
      method: 'PATCH', headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'Printing' }),
    })
    const startResult = await started.json()
    if (started.status !== 200 || startResult.data?.job_status !== 'Printing') throw new Error(`Print start failed: HTTP ${started.status}, ${startResult.code ?? 'unknown'}`)
    const notifications = (await db.query('SELECT notification_id,delivered_at FROM notifications WHERE dedupe_key=$1', [`print:${printRequestId}:printing`])).rows
    if (notifications.length !== 1 || !notifications[0].delivered_at) throw new Error('Starting printing did not deliver exactly one student notification.')
    console.log('Student print quote/upload, admin document download, and immediate printing notification passed.')
  }
  if (process.argv.includes('--borrow')) {
    const [candidate] = (await db.query(`SELECT t.title_id FROM titles t
      JOIN physical_copies pc ON pc.title_id=t.title_id
      WHERE t.record_type='Book' AND t.lifecycle_status='Active'
        AND pc.lifecycle_status='Active' AND pc.availability_status='Available' AND pc.material_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.book_title_id=t.title_id AND r.reservation_status IN ('pending','approved','ready_for_pickup'))
      ORDER BY t.title_id LIMIT 1`)).rows
    if (!candidate) throw new Error('No available book for borrow smoke test.')
    const borrowed = await fetch(new URL('/api/v1/borrow/submit-request', baseUrl), {
      method: 'POST', headers: { authorization: `Bearer ${loginJson.data.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title_ids: [Number(candidate.title_id)] }),
    })
    const result = await borrowed.json()
    if (borrowed.status !== 201 || !result.success) throw new Error(`Borrow request failed: HTTP ${borrowed.status}, ${result.code ?? 'unknown'}`)
    borrowTransactionId = Number(result.data.items[0].transactionId)
    const cancelled = await fetch(new URL(`/api/v1/circulation/requests/${borrowTransactionId}/cancel`, baseUrl), {
      method: 'PUT', headers: { authorization: `Bearer ${loginJson.data.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Temporary deployment smoke test' }),
    })
    const cancellation = await cancelled.json()
    if (cancelled.status !== 200 || !cancellation.success) throw new Error(`Borrow cancellation failed: HTTP ${cancelled.status}, ${cancellation.code ?? 'unknown'}`)
    console.log('Student borrow request and cancellation passed.')
  }
  console.log('Registration, login, and ten linked-student pages passed.')
} catch (error) {
  console.error(`Registration smoke test failed: ${error.message}`)
  process.exitCode = 1
} finally {
  if (connected) {
    await db.query('BEGIN')
    try {
      if (borrowTransactionId) {
        const [loan] = (await db.query('SELECT material_id,physical_copy_id FROM borrow_transactions WHERE transaction_id=$1', [borrowTransactionId])).rows
        await db.query('DELETE FROM admin_notifications WHERE borrow_transaction_id=$1', [borrowTransactionId])
        await db.query('DELETE FROM borrow_transactions WHERE transaction_id=$1', [borrowTransactionId])
        if (loan?.physical_copy_id) await db.query("UPDATE physical_copies SET availability_status='Available' WHERE physical_copy_id=$1", [loan.physical_copy_id])
        if (loan?.material_id) await db.query("UPDATE materials SET availability_status='Available' WHERE material_id=$1", [loan.material_id])
      }
      if (printRequestId) {
        const [file] = (await db.query('SELECT file_path FROM print_requests WHERE request_id=$1', [printRequestId])).rows
        await db.query('DELETE FROM notifications WHERE source_type=$1 AND source_id=$2', ['Print Request', printRequestId])
        await db.query('DELETE FROM print_file_download_audit WHERE request_id=$1', [printRequestId])
        await db.query('DELETE FROM print_status_history WHERE request_id=$1', [printRequestId])
        await db.query('DELETE FROM print_requests WHERE request_id=$1', [printRequestId])
        if (file?.file_path?.startsWith('supabase://printing-documents/') && env.supabase.url && env.supabase.secretKey) {
          const storage = createClient(env.supabase.url, env.supabase.secretKey).storage.from('printing-documents')
          const { error } = await storage.remove([file.file_path.slice('supabase://printing-documents/'.length)])
          if (error) throw error
        }
      }
      const accounts = (await db.query('SELECT account_id, user_id FROM accounts WHERE school_id = $1', [schoolId])).rows
      const users = (await db.query('SELECT user_id FROM users WHERE school_id = $1', [schoolId])).rows
      for (const account of accounts) {
        await db.query('DELETE FROM student_profiles WHERE account_id = $1', [account.account_id])
        await db.query('UPDATE accounts SET user_id = NULL WHERE account_id = $1', [account.account_id])
        await db.query('DELETE FROM accounts WHERE account_id = $1', [account.account_id])
      }
      for (const user of users) {
        await db.query('DELETE FROM attendance_qr_credentials WHERE user_id = $1', [user.user_id])
        await db.query('DELETE FROM users WHERE user_id = $1', [user.user_id])
      }
      await db.query('COMMIT')
      console.log('Temporary smoke-test identity removed.')
    } catch (error) {
      await db.query('ROLLBACK')
      console.error(`Smoke-test cleanup failed: ${error.message}`)
      process.exitCode = 1
    }
    await db.end()
  }
}
