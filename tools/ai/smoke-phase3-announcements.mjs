/** Rollback-only Supabase check for the student dashboard announcement card. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db } from '../../apps/api/src/config/db.js'
import { env } from '../../apps/api/src/config/env.js'
import { DashboardRepository } from '../../apps/api/src/modules/dashboard/dashboard.repository.ts'

if (env.db.driver !== 'postgres') throw new Error('This check requires Supabase Postgres.')
const connection = await db.getConnection()
const marker = `Phase 3 ${randomUUID().slice(0, 8)}`
try {
  await connection.beginTransaction()
  const [accounts] = await connection.execute("SELECT account_id,role FROM accounts WHERE role IN ('Student','Faculty') AND account_status='Active' LIMIT 1")
  const [creators] = await connection.execute('SELECT user_id FROM users LIMIT 1')
  assert.ok(accounts[0] && creators[0], 'Need one learner and one creator for the check')
  const actor = { accountId: Number(accounts[0].account_id), role: String(accounts[0].role) }
  const repository = new DashboardRepository(connection)
  const insert = (label, status, publishOffsetSeconds, expirationOffsetSeconds = null) => connection.execute(
    `INSERT INTO announcements(title,message_body,priority,announcement_status,publish_at,expires_at,published_at,created_by_user_id)
     VALUES (?,?, 'Normal', ?, NOW() + (?::integer * INTERVAL '1 second'),
       CASE WHEN ?::integer IS NULL THEN NULL ELSE NOW() + (?::integer * INTERVAL '1 second') END,
       CASE WHEN ?='Published' THEN NOW() ELSE NULL END, ?)`,
    [`${marker} ${label}`, 'Temporary dashboard verification.', status, publishOffsetSeconds, expirationOffsetSeconds, expirationOffsetSeconds, status, Number(creators[0].user_id)],
  )
  await insert('future', 'Scheduled', 86400)
  await insert('expired', 'Published', -10, -1)
  await insert('due', 'Scheduled', -1)
  let dashboard = await repository.user(actor)
  assert.equal(dashboard.announcement?.title, `${marker} due`)
  await insert('immediate', 'Published', 0)
  dashboard = await repository.user(actor)
  assert.equal(dashboard.announcement?.title, `${marker} immediate`)
  console.log('PASS: due scheduled and immediate announcements are visible; future and expired announcements are hidden.')
} finally {
  await connection.rollback()
  connection.release()
  await db.end()
}
