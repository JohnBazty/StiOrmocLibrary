import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { createConductService, conductInput } from './conduct.service.ts'
import { after } from 'node:test'
import { createConductTestDb, resetConductTestDb } from './conduct-test-db.ts'

const librarian = { accountId: 1, role: 'Librarian' }
const input = { schoolId: 'STU-TEST', category: 'Noise', details: 'Synthetic incident for verification', incidentAt: '2026-01-01T03:00:00Z' }

let shared: Awaited<ReturnType<typeof createConductTestDb>> | undefined
async function setup() {
  shared ??= await createConductTestDb()
  return { pg: shared.pg, pool: shared.pool, service: createConductService(shared.pool) }
}
after(async () => { await shared?.pg.close() })
async function save(service: ReturnType<typeof createConductService>, body: Record<string, unknown>) {
  const preview = await service.preview(librarian, body)
  return { preview, saved: await service.record(librarian, { ...body, reviewToken: preview.reviewToken, requestKey: randomUUID() }) }
}

test('conduct validation rejects invalid dates and ignores any amount a client sends', () => {
  assert.throws(() => conductInput({ ...input, incidentAt: 'invalid' }))
  assert.throws(() => conductInput({ ...input, incidentAt: '2999-01-01T00:00:00Z' }))
  assert.throws(() => conductInput({ ...input, category: '' }))
  assert.throws(() => conductInput({ ...input, details: 'short' }))
  const parsed = conductInput({ ...input, amount: 1, priorWarnings: 0, reviewReason: 'ignored text here' }) as Record<string, unknown>
  assert.equal('amount' in parsed, false)
  assert.equal('priorWarnings' in parsed, false)
  assert.equal(parsed.fromPaperLog, false)
})

test('real Postgres: two warnings then a server-priced fine, retries, notifications and owner privacy', async () => {
  const { pg, service } = await setup()
  try {
    await assert.rejects(service.preview({ accountId: 2, role: 'Student' }, input))
    for (const action of ['First warning', 'Second warning', 'Fine']) {
      const body = { ...input, amount: 1 } // a client-sent amount must have no effect
      const preview = await service.preview(librarian, body)
      assert.equal(preview.action, action)
      const saved = await service.record(librarian, { ...body, reviewToken: preview.reviewToken, requestKey: randomUUID() })
      assert.equal(saved.action, action === 'Fine' ? 'Fine issued' : action)
      if (action !== 'Fine') {
        assert.equal((await pg.query('SELECT * FROM fines')).rows.length, 0)
        assert.equal((await pg.query('SELECT * FROM clearance_statuses')).rows.length, 0)
        assert.equal(preview.amount, null)
      } else assert.equal(preview.amount, 50)
    }
    const fines = (await pg.query<{ fine_amount: string; fine_type: string }>('SELECT * FROM fines')).rows
    assert.equal(fines.length, 1)
    assert.equal(Number(fines[0].fine_amount), 50)
    assert.equal((await pg.query('SELECT * FROM notifications')).rows.length, 3)
    assert.equal((await pg.query('SELECT * FROM conduct_students')).rows.length, 0, 'no history review row is written any more')
    assert.equal((await pg.query<{ standing_status: string }>('SELECT standing_status FROM clearance_statuses')).rows[0].standing_status, 'Not Cleared')

    const retry = { ...input }
    const preview = await service.preview(librarian, retry)
    const key = randomUUID()
    const again = await service.record(librarian, { ...retry, reviewToken: preview.reviewToken, requestKey: key })
    assert.equal((await service.record(librarian, { ...retry, reviewToken: preview.reviewToken, requestKey: key })).incident_id, again.incident_id)
    await assert.rejects(service.record(librarian, { ...retry, details: 'Changed synthetic payload', reviewToken: preview.reviewToken, requestKey: key }), { code: 'CONDUCT_RETRY_CHANGED' })

    // Shared offense counting: a different category continues the same total count (already past 2 warnings -> Fine).
    assert.equal((await service.preview(librarian, { ...input, category: 'Eating or food' })).action, 'Fine')
    assert.equal((await service.list({ accountId: 3, role: 'Student' }, {}, true)).items.length, 0)
    assert.equal((await service.list({ accountId: 2, role: 'Student' }, {}, true)).items.length, 4)
    await service.event(librarian, 1, { type: 'Correction', reason: 'Synthetic correction preserves facts' })
    await assert.rejects(service.event(librarian, 1, { type: 'Voided', reason: 'Synthetic review of earlier warning' }), { code: 'CONDUCT_LATER_REVIEW' })
    await assert.rejects(service.event(librarian, 3, { type: 'Voided', reason: 'Synthetic linked fine must be retained' }), { code: 'CONDUCT_FINE_VOID' })
    const security = await pg.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname IN ('conduct_students','conduct_incidents','conduct_events','violation_categories')")
    assert.equal(security.rows.length, 4)
    assert.ok(security.rows.every(r => r.relrowsecurity))
    await assert.rejects(pg.exec('DELETE FROM conduct_events'))
    await pg.exec('SET ROLE anon'); await assert.rejects(pg.exec('SELECT * FROM violation_categories')); await pg.exec('RESET ROLE')
  } finally { await resetConductTestDb(pg) }
})

test('shared offense counting across different categories and per-level warning limits', async () => {
  const { pg, service } = await setup()
  try {
    // 1st violation in Noise -> 1st warning
    const first = await save(service, { ...input, category: 'Noise' })
    assert.equal(first.preview.action, 'First warning')
    assert.equal(first.preview.studentLevel, '1st Year')
    // 2nd violation in a DIFFERENT category (Eating or food) -> 2nd warning (counted as #2, not #1)
    const second = await save(service, { ...input, category: 'Eating or food' })
    assert.equal(second.preview.action, 'Second warning')
    assert.equal(second.preview.warningsUsed, 1)
    assert.deepEqual(second.preview.history.map(h => h.category), ['Noise'])
    // 3rd violation in another DIFFERENT category (Other conduct) -> Fine
    const third = await save(service, { ...input, category: 'Other conduct' })
    assert.equal(third.preview.action, 'Fine')
    assert.equal(third.preview.amount, 50)
    // Voiding the 1st warning is blocked because a later violation in another category depends on it.
    await assert.rejects(service.event(librarian, first.saved.incident_id, { type: 'Voided', reason: 'Attempt to void shared warning' }), { code: 'CONDUCT_LATER_REVIEW' })

    // Per-level warning rule: Grade 11 gets 1 warning, 1st Year gets 3 warnings.
    await pg.exec(`UPDATE violation_settings SET warnings_before_fine=2,level_warnings='{"Grade 11":1,"1st Year":3}'::jsonb`)
    const g11First = await save(service, { ...input, schoolId: 'OTHER-TEST', category: 'Noise' })
    assert.equal(g11First.preview.studentLevel, 'Grade 11')
    assert.equal(g11First.preview.warningsBeforeFine, 1)
    assert.equal(g11First.preview.action, 'First warning')
    const g11Second = await save(service, { ...input, schoolId: 'OTHER-TEST', category: 'Eating or food' })
    assert.equal(g11Second.preview.action, 'Fine')

    // Category restricted to specific levels rejects a student outside those levels.
    await pg.exec("UPDATE violation_categories SET allowed_levels=ARRAY['4th Year'] WHERE name='Other conduct'")
    const blocked = await service.standing(librarian, { schoolId: 'OTHER-TEST', category: 'Other conduct' })
    assert.equal(blocked.levelAllowed, false)
    assert.match(String(blocked.levelReason), /4th Year/)
    const blockedPreview = await service.preview(librarian, { ...input, schoolId: 'OTHER-TEST', category: 'Other conduct' })
    await assert.rejects(service.record(librarian, { ...input, schoolId: 'OTHER-TEST', category: 'Other conduct', reviewToken: blockedPreview.reviewToken, requestKey: randomUUID() }), { code: 'CONDUCT_CATEGORY_LEVEL' })
  } finally { await resetConductTestDb(pg) }
})

test('a Library setup change while the librarian is reviewing makes the saved review stale', async () => {
  const { pg, service } = await setup()
  try {
    for (const change of [
      "UPDATE violation_categories SET fine_amount=75 WHERE name='Noise'",
      'UPDATE violation_settings SET warnings_before_fine=1',
      `UPDATE violation_settings SET level_warnings='{"1st Year":0}'::jsonb`,
    ]) {
      const preview = await service.preview(librarian, input)
      await pg.exec(change)
      await assert.rejects(service.record(librarian, { ...input, reviewToken: preview.reviewToken, requestKey: randomUUID() }), { code: 'CONDUCT_STALE' })
      await pg.exec("UPDATE violation_categories SET fine_amount=50 WHERE name='Noise'; UPDATE violation_settings SET warnings_before_fine=2,level_warnings='{}'::jsonb")
    }
    assert.equal((await pg.query('SELECT * FROM conduct_incidents')).rows.length, 0)
  } finally { await resetConductTestDb(pg) }
})

test('a rule that fines at once, the threshold comes from setup, and retired or unknown categories are refused', async () => {
  const { pg, service } = await setup()
  try {
    await pg.exec("UPDATE violation_settings SET warnings_before_fine=0; UPDATE violation_categories SET fine_amount=120.5 WHERE name='Other conduct'")
    const preview = await service.preview(librarian, { ...input, category: 'Other conduct' })
    assert.equal(preview.action, 'Fine')
    assert.equal(preview.amount, 120.5)
    await pg.exec('UPDATE violation_settings SET warnings_before_fine=3')
    const actions: string[] = []
    for (let i = 0; i < 4; i++) actions.push((await save(service, input)).preview.action)
    assert.deepEqual(actions, ['First warning', 'Second warning', 'Final warning', 'Fine'])
    await pg.exec("UPDATE violation_categories SET is_active=FALSE WHERE name='Eating or food'")
    const retired = { ...input, category: 'Eating or food' }
    assert.equal((await service.standing(librarian, { schoolId: 'OTHER-TEST', category: 'Eating or food' })).categoryActive, false, 'retired categories still show standing')
    const p = await service.preview(librarian, retired)
    await assert.rejects(service.record(librarian, { ...retired, schoolId: 'OTHER-TEST', reviewToken: p.reviewToken, requestKey: randomUUID() }), { code: 'CONDUCT_CATEGORY_RETIRED' })
    await assert.rejects(service.preview(librarian, { ...input, category: 'Not a category' }), { code: 'CONDUCT_CATEGORY' })
    await assert.rejects(service.preview(librarian, { ...input, schoolId: 'NOBODY' }), { code: 'CONDUCT_PERSON' })
  } finally { await resetConductTestDb(pg) }
})

test('saved lifetime reviews and old Final warning rows still count, so the next offense is a fine', async () => {
  const { pg, service } = await setup()
  try {
    await pg.exec("INSERT INTO conduct_students(user_id,category,prior_warnings,reason,reviewed_by_account_id) VALUES(3,'Noise',2,'Synthetic earlier review reason',1)")
    const standing = await service.standing(librarian, { schoolId: 'OTHER-TEST', category: 'Noise' })
    assert.equal(standing.warningsUsed, 2)
    assert.equal(standing.nextStep, 'Fine')
    assert.equal(standing.earlierWarnings?.count, 2)
    await pg.exec("INSERT INTO conduct_incidents(user_id,category,incident_at,location,details,action,recorded_by_account_id,request_key,payload_hash) VALUES(2,'Noise','2025-01-01T00:00:00Z','Library','Synthetic old final warning','Final warning',1,gen_random_uuid(),'x'),(2,'Noise','2025-01-02T00:00:00Z','Library','Synthetic old second warn','Second warning',1,gen_random_uuid(),'y'),(2,'Noise','2025-01-03T00:00:00Z','Library','Synthetic old first warn','First warning',1,gen_random_uuid(),'z')")
    assert.equal((await service.preview(librarian, input)).action, 'Fine')
  } finally { await resetConductTestDb(pg) }
})

test('paper-log records only back-fill earlier warnings: they count, never fine or notify, and are tagged in history', async () => {
  const { pg, service } = await setup()
  try {
    const paper = { ...input, incidentAt: '2025-06-01T03:00:00Z', fromPaperLog: true }
    assert.equal((await service.standing(librarian, { schoolId: 'STU-TEST', category: 'Noise' })).paperLogAllowed, true)
    const first = await save(service, paper)
    assert.equal(first.preview.action, 'First warning')
    assert.equal((await pg.query('SELECT * FROM notifications')).rows.length, 0)
    const second = await save(service, { ...paper, incidentAt: '2025-07-01T03:00:00Z' })
    assert.equal(second.preview.action, 'Second warning')
    const rows = (await pg.query<{ source: string; fine_id: string | null }>('SELECT source,fine_id FROM conduct_incidents')).rows
    assert.ok(rows.every(r => r.source === 'Paper log' && r.fine_id === null))
    const standing = await service.standing(librarian, { schoolId: 'STU-TEST', category: 'Noise' })
    assert.equal(standing.nextStep, 'Fine')
    assert.equal(standing.paperLogAllowed, false)
    assert.match(String(standing.paperLogReason), /already at the fine step/)
    assert.deepEqual(standing.history.map(h => h.source), ['Paper log', 'Paper log'])
    // At the fine step a paper-log entry is refused, never turned into a warning.
    await assert.rejects(service.preview(librarian, { ...paper, incidentAt: '2025-08-01T03:00:00Z' }), { status: 409, code: 'CONDUCT_PAPER_LOG_FINE_STEP', message: 'This person is already at the fine step. Paper-log entries only add earlier warnings.' })
    // A recorded offense after the paper log is a real fine.
    assert.equal((await save(service, input)).saved.action, 'Fine issued')
    await assert.rejects(pg.exec("INSERT INTO fines(user_id) VALUES(2); INSERT INTO conduct_incidents(user_id,category,incident_at,location,details,action,fine_id,recorded_by_account_id,request_key,payload_hash,source) VALUES(2,'Noise',NOW(),'Library','Synthetic invalid paper fine','Fine issued',(SELECT MAX(fine_id) FROM fines),1,gen_random_uuid(),'q','Paper log')"))
  } finally { await resetConductTestDb(pg) }
})

test('paper-log rules: students only, warnings must exist, dated before today, in date order, and before any system record', async () => {
  const { pg, service } = await setup()
  try {
    const paper = { ...input, incidentAt: '2025-06-01T03:00:00Z', fromPaperLog: true }
    // Faculty get warnings (never fines), so their earlier paper-log warnings can be copied too.
    const faculty = await service.standing(librarian, { schoolId: 'FAC-TEST', category: 'Noise' })
    assert.equal(faculty.paperLogAllowed, true)
    await pg.exec('UPDATE violation_settings SET warnings_before_fine=0')
    await assert.rejects(service.preview(librarian, { ...paper, category: 'Other conduct' }), { code: 'CONDUCT_PAPER_LOG_NO_WARNINGS' })
    assert.equal((await service.standing(librarian, { schoolId: 'STU-TEST', category: 'Other conduct' })).paperLogAllowed, false)
    await pg.exec('UPDATE violation_settings SET warnings_before_fine=2')
    // A paper-log entry is recorded on the day it was issued, today included (never in the future).
    const today = new Date(Date.now() - 60_000).toISOString()
    assert.equal((await service.preview(librarian, { ...paper, incidentAt: today })).fromPaperLog, true)
    await save(service, { ...paper, incidentAt: '2025-07-01T03:00:00Z' })
    await assert.rejects(service.preview(librarian, { ...paper, incidentAt: '2025-06-01T03:00:00Z' }), { code: 'CONDUCT_PAPER_LOG_ORDER' })
    await save(service, { ...paper, incidentAt: '2025-07-01T03:00:00Z' }) // same instant as the latest is allowed
  } finally { await resetConductTestDb(pg) }
})

test('a paper-log entry is refused once the person has a record made in the system, but a voided one does not block', async () => {
  const { pg, service } = await setup()
  try {
    const paper = { ...input, incidentAt: '2025-06-01T03:00:00Z', fromPaperLog: true }
    const recorded = await save(service, input)
    const standing = await service.standing(librarian, { schoolId: 'STU-TEST', category: 'Noise' })
    assert.equal(standing.paperLogAllowed, false)
    assert.match(String(standing.paperLogReason), /before the first record made in the system/)
    await assert.rejects(service.preview(librarian, paper), { status: 422, code: 'CONDUCT_PAPER_LOG_AFTER_RECORDS', message: 'Paper-log entries must come before the first record made in the system.' })
    // Because progression is shared across categories, another category is also blocked after a system record.
    await assert.rejects(service.preview(librarian, { ...paper, category: 'Eating or food' }), { status: 422, code: 'CONDUCT_PAPER_LOG_AFTER_RECORDS' })
    await service.event(librarian, recorded.saved.incident_id, { type: 'Voided', reason: 'Synthetic mistaken record voided' })
    assert.equal((await service.preview(librarian, paper)).action, 'First warning')
  } finally { await resetConductTestDb(pg) }
})

test('record locks the acting account without blocking foreign-key checks on it', async () => {
  const { pg, pool, service } = await setup()
  try {
    const seen: string[] = []
    const spy = { ...pool, getConnection: async () => { const c = await (pool as unknown as { getConnection: () => Promise<{ execute: (s: string, v?: unknown[]) => Promise<unknown> }> }).getConnection(); const run = c.execute; c.execute = async (sql: string, v?: unknown[]) => { seen.push(sql); return run(sql, v) }; return c } } as never
    const spied = createConductService(spy)
    await spied.record(librarian, { ...input, reviewToken: (await service.preview(librarian, input)).reviewToken, requestKey: randomUUID() })
    assert.ok(seen.some(sql => /FROM accounts WHERE account_id=\? FOR NO KEY UPDATE/.test(sql)))
    assert.ok(!seen.some(sql => /FROM accounts WHERE account_id=\? FOR UPDATE/.test(sql)))
  } finally { await resetConductTestDb(pg) }
})

test('faculty are never fined for a violation: their warnings stop at a final warning', async () => {
  const { pg, service } = await setup()
  try {
    const steps: string[] = []
    for (let offense = 0; offense < 4; offense++) {
      const result = await save(service, { ...input, schoolId: 'FAC-TEST', incidentAt: new Date(Date.now() - (4 - offense) * 60_000).toISOString() })
      assert.equal(result.preview.amount, null)
      steps.push(String(result.preview.action))
    }
    assert.ok(!steps.includes('Fine'), steps.join(', '))
    assert.equal(steps.at(-1), 'Final warning')
    const fines = (await pg.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM fines f JOIN users u ON u.user_id=f.user_id WHERE u.school_id='FAC-TEST'")).rows[0].n
    assert.equal(fines, 0)
  } finally { await resetConductTestDb(pg) }
})
test('a student sees shared warnings left across all categories, plus applicable categories', async () => {
  const { pg, service } = await setup()
  try {
    await save(service, input)
    await pg.exec("UPDATE violation_categories SET is_active=FALSE WHERE name='Other conduct'")
    const own = await service.ownStanding({ accountId: 2, role: 'Student' })
    assert.ok(own)
    assert.equal(own.studentLevel, '1st Year')
    assert.equal(own.warningsUsed, 1)
    assert.equal(own.warningsBeforeFine, 2)
    assert.equal(own.warningsLeft, 1)
    assert.deepEqual(own.categories.map(c => c.category), ['Noise', 'Eating or food'])
    assert.equal(await service.ownStanding({ accountId: 99, role: 'Student' }), null)
  } finally { await resetConductTestDb(pg) }
})

test('the list filters by incident and by a category from setup, and refuses unknown categories', async () => {
  const { pg, service } = await setup()
  try {
    await save(service, input)
    assert.equal((await service.list(librarian, { category: 'Noise' })).items.length, 1)
    assert.equal((await service.list(librarian, { category: 'Eating or food' })).items.length, 0)
    const one = await service.list(librarian, { incidentId: '1' })
    assert.equal(one.items.length, 1)
    assert.equal(one.items[0].source, 'Recorded')
    await assert.rejects(service.list(librarian, { category: 'Unknown' }), { code: 'CONDUCT_CATEGORY' })
    await assert.rejects(service.list(librarian, { incidentId: 'x' }), { code: 'CONDUCT_ID' })
  } finally { await resetConductTestDb(pg) }
})
