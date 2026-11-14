import assert from 'node:assert/strict'
import test from 'node:test'
import { createCirculationCaseService, openDamageCaseAtReturn } from './circulation-case.service.ts'
import { createCaseTestDatabase, LIBRARIAN_ACCOUNT, STAFF_ACCOUNT } from './circulation-case.test.helper.ts'

const now = new Date('2026-11-12T09:00:00+08:00')

async function seededCase(transactionId = 900) {
  const db = await createCaseTestDatabase()
  const loan = transactionId === 900
    ? { transactionId: 900, physicalCopyId: 50, borrowerUserId: 7 }
    : { transactionId: 901, physicalCopyId: 51, borrowerUserId: 8 }
  const opened = await openDamageCaseAtReturn(db.connection as never, {
    ...loan, actorUserId: 3, baselineCondition: 'Good', observedCondition: 'Damaged', description: 'Water damage on pages 10-40.', openedAt: now,
  })
  return { ...db, caseId: opened.caseId, service: createCirculationCaseService(db.pool, () => now) }
}

async function one<T>(pg: Awaited<ReturnType<typeof createCaseTestDatabase>>['pg'], sql: string) {
  return (await pg.query<T>(sql)).rows[0]
}

test('opening a damage case at return is idempotent and records one Opened event and one borrower notice', async () => {
  const { pg, connection, caseId } = await seededCase()
  const again = await openDamageCaseAtReturn(connection as never, {
    transactionId: 900, physicalCopyId: 50, borrowerUserId: 7, actorUserId: 3,
    baselineCondition: 'Good', observedCondition: 'Damaged', description: 'Second look.', openedAt: now,
  })
  assert.equal(again.caseId, caseId)
  assert.equal(again.created, false)
  assert.equal((await pg.query("SELECT 1 FROM circulation_cases")).rows.length, 1)
  assert.equal((await pg.query("SELECT 1 FROM circulation_case_events WHERE event_type='Opened'")).rows.length, 1)
  assert.equal((await pg.query("SELECT 1 FROM notifications WHERE user_id=7")).rows.length, 1)
})

test('lost disposition charges the book price once, links the report, and writes the copy off', async () => {
  const { pg, service, caseId } = await seededCase()
  const detail = await service.recordDisposition(LIBRARIAN_ACCOUNT, caseId, { disposition: 'lost', reason: 'Pages torn out, cannot be repaired.' })
  assert.ok(detail.case.lostBookReportId)
  const report = await one<{ report_status: string; replacement_charge: string; purchase_price_snapshot: string; charge_resolution: string; payment_status: string; user_id: string }>(pg,
    'SELECT report_status, replacement_charge, purchase_price_snapshot, charge_resolution, payment_status, user_id FROM lost_book_reports')
  assert.deepEqual({ ...report, user_id: Number(report.user_id) }, {
    report_status: 'Confirmed', replacement_charge: '450.00', purchase_price_snapshot: '450.00', charge_resolution: 'Book Price', payment_status: 'Unpaid', user_id: 7,
  })
  const copy = await one<{ condition_status: string; availability_status: string }>(pg, 'SELECT condition_status, availability_status FROM physical_copies WHERE physical_copy_id=50')
  assert.deepEqual(copy, { condition_status: 'Lost', availability_status: 'Unavailable' })
  assert.equal((await pg.query("SELECT 1 FROM inventory_audit_events WHERE event_type='Lost Override' AND physical_copy_id=50")).rows.length, 1)
  assert.equal((await pg.query("SELECT 1 FROM circulation_case_events WHERE event_type='Linked Lost Report'")).rows.length, 1)
  assert.equal((await pg.query("SELECT 1 FROM notifications WHERE user_id=7 AND message_body LIKE '%PHP 450.00%'")).rows.length, 1)

  await assert.rejects(
    service.recordDisposition(LIBRARIAN_ACCOUNT, caseId, { disposition: 'lost', reason: 'Clicked twice by mistake.' }),
    (error: { code?: string }) => error.code === 'CASE_LOST_ALREADY_CHARGED',
  )
  assert.equal((await pg.query('SELECT 1 FROM lost_book_reports')).rows.length, 1)
})

test('lost disposition and case review use the copy cost before the legacy title price', async () => {
  const { pg, service, caseId } = await seededCase()
  await pg.exec('UPDATE physical_copies SET cost_php=625.00 WHERE physical_copy_id=50')
  assert.equal((await service.getCaseDetail(caseId)).loan?.titlePrice, 625)
  await service.recordDisposition(LIBRARIAN_ACCOUNT, caseId, { disposition: 'lost', reason: 'Damaged beyond repair during the loan.' })
  const report = await one<{ replacement_charge: string; purchase_price_snapshot: string }>(pg,
    'SELECT replacement_charge, purchase_price_snapshot FROM lost_book_reports')
  assert.deepEqual(report, { replacement_charge: '625.00', purchase_price_snapshot: '625.00' })
})

test('lost disposition for a title without a price needs a staff-entered charge, and a priced title rejects a different charge', async () => {
  const unpriced = await seededCase(901)
  await assert.rejects(
    unpriced.service.recordDisposition(LIBRARIAN_ACCOUNT, unpriced.caseId, { disposition: 'lost', reason: 'Spine broken beyond repair.' }),
    (error: { code?: string }) => error.code === 'CASE_LOST_CHARGE_REQUIRED',
  )
  assert.equal((await unpriced.pg.query('SELECT 1 FROM lost_book_reports')).rows.length, 0)
  await unpriced.service.recordDisposition(LIBRARIAN_ACCOUNT, unpriced.caseId, { disposition: 'lost', reason: 'Spine broken beyond repair.', replacementCharge: 300 })
  const report = await one<{ replacement_charge: string; purchase_price_snapshot: string | null }>(unpriced.pg, 'SELECT replacement_charge, purchase_price_snapshot FROM lost_book_reports')
  assert.deepEqual(report, { replacement_charge: '300.00', purchase_price_snapshot: null })

  const priced = await seededCase()
  await assert.rejects(
    priced.service.recordDisposition(LIBRARIAN_ACCOUNT, priced.caseId, { disposition: 'lost', reason: 'Pages torn out.', replacementCharge: 999 }),
    (error: { code?: string }) => error.code === 'CASE_LOST_CHARGE_MISMATCH',
  )
})

test('desk staff cannot record a disposition or close a case; nothing is written', async () => {
  const { pg, service, caseId } = await seededCase()
  for (const action of [
    () => service.recordDisposition(STAFF_ACCOUNT, caseId, { disposition: 'lost', reason: 'Pages torn out.' }),
    () => service.closeCase(STAFF_ACCOUNT, caseId, { reason: 'Done.' }, 'Resolved'),
  ]) {
    await assert.rejects(action(), (error: { status?: number }) => error.status === 403)
  }
  assert.equal((await pg.query('SELECT 1 FROM lost_book_reports')).rows.length, 0)
  assert.equal((await one<{ status: string }>(pg, 'SELECT status FROM circulation_cases')).status, 'Open')
})

test('desk staff can add a note, which moves an open case under investigation', async () => {
  const { pg, service, caseId } = await seededCase()
  const detail = await service.addNote(STAFF_ACCOUNT, caseId, { notes: 'Borrower says it was wet on checkout.' })
  assert.equal(detail.case.status, 'Under Investigation')
  assert.equal((await pg.query("SELECT 1 FROM circulation_case_events WHERE event_type='Note Added' AND actor_user_id=3")).rows.length, 1)
  await assert.rejects(service.addNote(STAFF_ACCOUNT, caseId, { notes: '   ' }), (error: { code?: string }) => error.code === 'CASE_REASON_REQUIRED')
})

test('repaired disposition restores the copy to Good and Available with audit rows; held keeps it Unavailable', async () => {
  const { pg, service, caseId } = await seededCase()
  await service.recordDisposition(LIBRARIAN_ACCOUNT, caseId, { disposition: 'damaged_held', reason: 'Waiting for the binder.' })
  assert.deepEqual(await one(pg, 'SELECT condition_status, availability_status FROM physical_copies WHERE physical_copy_id=50'), { condition_status: 'Damaged', availability_status: 'Unavailable' })
  await service.recordDisposition(LIBRARIAN_ACCOUNT, caseId, { disposition: 'repaired_available', reason: 'Rebound by the binder.' })
  assert.deepEqual(await one(pg, 'SELECT condition_status, availability_status FROM physical_copies WHERE physical_copy_id=50'), { condition_status: 'Good', availability_status: 'Available' })
  assert.deepEqual(await one(pg, 'SELECT availability_status FROM materials WHERE material_id=100'), { availability_status: 'Available' })
  assert.equal((await pg.query("SELECT 1 FROM inventory_audit_events WHERE physical_copy_id=50")).rows.length, 2)
  assert.equal((await pg.query('SELECT 1 FROM lost_book_reports')).rows.length, 0)
})

test('a decision is refused once the copy is no longer held as damaged, for example after repair and a new loan', async () => {
  const { pg, service, caseId } = await seededCase()
  await service.recordDisposition(LIBRARIAN_ACCOUNT, caseId, { disposition: 'repaired_available', reason: 'Rebound.' })
  await service.closeCase(LIBRARIAN_ACCOUNT, caseId, { reason: 'Repaired.' }, 'Resolved')
  await pg.exec("UPDATE physical_copies SET availability_status='Borrowed' WHERE physical_copy_id=50")
  await service.reopenCase(LIBRARIAN_ACCOUNT, caseId, { reason: 'Second look.' })
  for (const disposition of ['lost', 'damaged_held', 'repaired_available']) {
    await assert.rejects(service.recordDisposition(LIBRARIAN_ACCOUNT, caseId, { disposition, reason: 'Late decision.' }),
      (error: { code?: string }) => error.code === 'CASE_COPY_NOT_HELD')
  }
  assert.deepEqual(await one(pg, 'SELECT condition_status, availability_status FROM physical_copies WHERE physical_copy_id=50'), { condition_status: 'Good', availability_status: 'Borrowed' })
  assert.equal((await pg.query('SELECT 1 FROM lost_book_reports')).rows.length, 0)
})

test('a case with a book-price charge cannot be dismissed, and re-closing after reopen notifies again', async () => {
  const { pg, service, caseId } = await seededCase()
  await service.recordDisposition(LIBRARIAN_ACCOUNT, caseId, { disposition: 'lost', reason: 'Pages torn out.' })
  await assert.rejects(service.closeCase(LIBRARIAN_ACCOUNT, caseId, { reason: 'Never mind.' }, 'Dismissed'), (error: { code?: string }) => error.code === 'CASE_CHARGED_CANNOT_DISMISS')
  await service.closeCase(LIBRARIAN_ACCOUNT, caseId, { reason: 'Charged.' }, 'Resolved')
  await service.reopenCase(LIBRARIAN_ACCOUNT, caseId, { reason: 'Borrower disputes.' })
  await service.closeCase(LIBRARIAN_ACCOUNT, caseId, { reason: 'Upheld.' }, 'Resolved')
  assert.equal((await pg.query("SELECT 1 FROM notifications WHERE user_id=7 AND message_title='Damage review closed'")).rows.length, 2)
})

test('event times use the same Manila clock as the case, not the database UTC clock', async () => {
  const { pg, service, caseId } = await seededCase()
  await service.addNote(STAFF_ACCOUNT, caseId, { notes: 'Checked again.' })
  const rows = (await pg.query<{ same: boolean }>(
    'SELECT e.created_at = cc.opened_at AS same FROM circulation_case_events e JOIN circulation_cases cc ON cc.case_id = e.case_id ORDER BY e.event_id')).rows
  assert.deepEqual(rows.map((row) => row.same), [true, true])
})

test('a huge page number is clamped instead of failing the query', async () => {
  const { service } = await seededCase()
  const list = await service.listCases({ page: '1e300' })
  assert.equal(list.items.length, 0)
  assert.equal(list.pagination.page, 10_000)
})

test('resolve needs a reason, blocks further actions, and reopen clears the resolution', async () => {
  const { pg, service, caseId } = await seededCase()
  await assert.rejects(service.closeCase(LIBRARIAN_ACCOUNT, caseId, {}, 'Resolved'), (error: { code?: string }) => error.code === 'CASE_REASON_REQUIRED')
  const resolved = await service.closeCase(LIBRARIAN_ACCOUNT, caseId, { reason: 'Minor wear only.' }, 'Dismissed')
  assert.equal(resolved.case.status, 'Dismissed')
  await assert.rejects(service.addNote(STAFF_ACCOUNT, caseId, { notes: 'Late note.' }), (error: { code?: string }) => error.code === 'CASE_TERMINAL')
  await assert.rejects(service.closeCase(LIBRARIAN_ACCOUNT, caseId, { reason: 'Again.' }, 'Resolved'), (error: { code?: string }) => error.code === 'CASE_TERMINAL')
  const reopened = await service.reopenCase(LIBRARIAN_ACCOUNT, caseId, { reason: 'Found more damage.' })
  assert.equal(reopened.case.status, 'Reopened')
  assert.equal(reopened.case.resolvedAt, null)
  assert.equal((await pg.query('SELECT 1 FROM circulation_case_events')).rows.length, 3)
})

test('worklist filters by status and search text, and detail shows the loan and the event timeline', async () => {
  const { service, caseId } = await seededCase()
  const list = await service.listCases({ status: 'Open', q: 'Clean' })
  assert.equal(list.items.length, 1)
  assert.equal(list.items[0].title, 'Clean Code')
  assert.equal(list.items[0].borrowerName, 'Borrower Seven')
  assert.equal((await service.listCases({ status: 'Resolved' })).items.length, 0)
  assert.equal((await service.listCases({ q: 'no-such-book' })).items.length, 0)
  await assert.rejects(service.listCases({ status: 'Bogus' }), (error: { code?: string }) => error.code === 'CASE_STATUS_INVALID')
  const detail = await service.getCaseDetail(caseId)
  assert.equal(detail.loan?.barcode, 'BOOK-50')
  assert.equal(detail.loan?.titlePrice, 450)
  assert.equal(detail.events[0].eventType, 'Opened')
  await assert.rejects(service.getCaseDetail(12345), (error: { status?: number }) => error.status === 404)
})

test('borrower summaries include only the borrower own cases and no staff notes', async () => {
  const { service } = await seededCase()
  const mine = await service.publicSummariesForTransactions(7, [900])
  assert.equal(mine.get(900)?.status, 'Open')
  assert.ok(!JSON.stringify([...mine.values()]).includes('Water damage'))
  assert.equal((await service.publicSummariesForTransactions(8, [900])).size, 0)
  assert.equal((await service.publicSummariesForTransactions(7, [])).size, 0)
})
