import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool, RowDataPacket } from '../../config/db.js'
import { receiptVerificationCode } from './fine-receipt-verification.ts'
import { createFinesService } from './fines.service.ts'

const receipt = {
  receiptId: 8,
  receiptNumber: 'OR-20260904-000008',
  amountReceived: 28,
  receivedAt: '2026-09-04 22:37:00',
  student: { schoolId: '02000871654' },
}
const verificationCode = receiptVerificationCode(receipt)

function database() {
  return {
    async execute(sql: string) {
      if (sql.includes('FROM fines f INNER JOIN users')) return [[{
        fine_id: 2, user_id: 7, fine_type: 'Overdue', fine_amount: 28, payment_status: 'Paid', calculation_basis: 'Hourly',
        overdue_units: 14, rate_applied: 2, maximum_cap_applied: 500, applied_date: '2026-08-25 13:56:25', finalized_at: '2026-08-26 09:00:00',
        notes: null, updated_at: '2026-09-04 22:37:00', school_id: receipt.student.schoolId, full_name: 'Buentheo Nathaniel Noval',
        transaction_status: 'Returned', lost_confirmed_at: null, source_title: 'Business Ethics', category: null, incident_at: null,
        incident_location: null, details: null, paid_amount: 28, adjusted_amount: 0,
      } as RowDataPacket],[]]
      if (sql.includes('FROM lost_book_reports l INNER JOIN users')) return [[],[]]
      if (sql.includes('FROM fine_payment_allocations a')) return [[{
        fine_id: 2, lost_book_report_id: null, fine_payment_receipt_id: receipt.receiptId, receipt_number: receipt.receiptNumber,
        amount_received: receipt.amountReceived, received_at: receipt.receivedAt, receipt_status: 'Issued', school_id: receipt.student.schoolId,
      } as RowDataPacket],[]]
      throw new Error(`Unexpected query: ${sql}`)
    },
  } as unknown as Pool
}

test('admin fine records expose receipt verification data and support verification-code search',async()=>{
  const service=createFinesService(database())
  const result=await service.list({search:verificationCode,status:'all',type:'all',category:null,period:'all',date:null,month:null,week:null,termId:null,from:null,to:null,page:1,limit:25})
  assert.equal(result.pagination.total,1)
  assert.deepEqual(result.items[0]?.receipts,[{receiptId:8,receiptNumber:receipt.receiptNumber,verificationCode,status:'Issued'}])

  const missing=await service.list({search:'NOT-A-RECEIPT',status:'all',type:'all',category:null,period:'all',date:null,month:null,week:null,termId:null,from:null,to:null,page:1,limit:25})
  assert.equal(missing.pagination.total,0)
})

test('outstanding filter includes partially paid balances and excludes fully paid records before pagination',async()=>{
  const base=database()
  const mixed={async execute(sql:string){const result=await base.execute(sql);if(sql.includes('FROM fines f INNER JOIN users'))return [[{...(result[0] as RowDataPacket[])[0],paid_amount:0},{...(result[0] as RowDataPacket[])[0],fine_id:3,school_id:'QA-PAYMENT-USER',full_name:'Disposable Student',fine_amount:100,paid_amount:40,payment_status:'Partially Paid'}],[]];return result}} as unknown as Pool
  const service=createFinesService(mixed)
  const result=await service.list(service.filters({status:'outstanding'}))
  assert.equal(result.pagination.total,1);assert.equal(result.items[0].balance,60)
})

function unpaidDatabase() {
  const base = database()
  return { async execute(sql: string) {
    const result = await base.execute(sql)
    if (sql.includes('FROM fines f INNER JOIN users')) return [[{ ...(result[0] as RowDataPacket[])[0], paid_amount: 0, payment_status: 'Unpaid' }], []]
    return result
  } } as unknown as Pool
}
const staff = { accountId: 1, role: 'Librarian' }

test('staff fines and PDF data apply verified principal before filters without changing school allocations', async () => {
  const service = createFinesService(unpaidDatabase(), { staffPreviewCredits: async () => [
    { userId: 7, kind: 'Fine', targetId: 2, principalCentavos: 2800, paymentId: 'verified-payment' },
  ] })
  const filters = service.filters({})
  const paid = await service.listForStaff(staff, filters)
  assert.equal(paid.items[0].status, 'Paid')
  assert.equal(paid.items[0].paymentAllowed, false)
  assert.equal(paid.summary.collected, 28)
  assert.equal(paid.summary.outstanding, 0)
  assert.equal((await service.listForStaff(staff, service.filters({ status: 'outstanding' }))).pagination.total, 0)
  assert.equal((await service.report(filters, staff)).items[0].balance, 0)
  assert.equal((await service.list(filters)).items[0].balance, 28, 'Official school ledger remains unchanged')
  await assert.rejects(service.listForStaff({ role: 'Student', accountId: 7 }, filters))
})

test('staff fine partial payments and confirmed refund projections retain only matching borrower credits', async () => {
  let principalCentavos = 1000
  const service = createFinesService(unpaidDatabase(), { staffPreviewCredits: async () => [
    { userId: 7, kind: 'Fine', targetId: 2, principalCentavos, paymentId: 'verified-partial' },
    { userId: 8, kind: 'Fine', targetId: 2, principalCentavos: 2800, paymentId: 'another-borrower' },
  ] })
  const partial = await service.listForStaff(staff, service.filters({}))
  assert.equal(partial.items[0].balance, 18)
  assert.equal(partial.items[0].paid, 10)
  assert.equal(partial.items[0].status, 'Partially Paid')
  principalCentavos = 0 // Confirmed restore refund removes its applied principal.
  const restored = await service.listForStaff(staff, service.filters({}))
  assert.equal(restored.items[0].status, 'Unpaid')
  assert.equal(restored.items[0].balance, 28)
})

function violationDatabase() {
  const base = database()
  const violation = (fineId: number, category: string, incidentId: number) => ({
    fine_id: fineId, user_id: 7, fine_type: 'Infraction', fine_amount: 50, payment_status: 'Unpaid', calculation_basis: 'Manual', overdue_units: 1, rate_applied: 50,
    maximum_cap_applied: null, applied_date: '2026-09-05 10:00:00', finalized_at: '2026-09-05 10:00:00', notes: null, updated_at: '2026-09-05 10:00:00',
    school_id: receipt.student.schoolId, full_name: 'Buentheo Nathaniel Noval', transaction_status: null, lost_confirmed_at: null, source_title: category,
    category, incident_at: '2026-09-05 10:00:00', incident_location: 'Library', details: 'Loud conversation in the reading area', incident_id: incidentId, paid_amount: 0, adjusted_amount: 0,
  })
  return { async execute(sql: string, values?: unknown[]) {
    if (sql.includes('FROM fines f INNER JOIN users')) {
      const [rows] = await base.execute(sql) as [RowDataPacket[], unknown]
      return [[...rows, violation(11, 'Noise', 5), violation(12, 'Eating or food', 6), violation(13, 'Old free text', 7)], []]
    }
    if (sql.includes('FROM fine_infractions')) return [[{ category: 'Old free text' }], []]
    if (sql.includes('FROM violation_categories')) {
      const known = [{ name: 'Noise', is_active: true }, { name: 'Eating or food', is_active: true }, { name: 'Retired rule', is_active: false }]
      return [sql.includes('WHERE name=?') ? known.filter((row) => row.name === values?.[0]) : known, []]
    }
    return base.execute(sql)
  } } as unknown as Pool
}

test('violation fines are labelled by category and link to their violation record', async () => {
  const service = createFinesService(violationDatabase())
  const result = await service.list(service.filters({ type: 'Infraction' }))
  const noise = result.items.find((item) => item.category === 'Noise')!
  assert.equal(noise.typeLabel, 'Violation · Noise')
  assert.equal(noise.incidentId, 5)
  assert.equal(noise.reason, 'Loud conversation in the reading area')
  assert.equal(result.items.every((item) => item.type === 'Infraction'), true)
})

test('the category filter narrows violations, groups older free-text categories, and refuses unknown names', async () => {
  const service = createFinesService(violationDatabase())
  const noise = await service.list(service.filters({ type: 'Infraction', category: 'Noise' }))
  assert.deepEqual(noise.items.map((item) => item.category), ['Noise'])
  const earlier = await service.list(service.filters({ type: 'Infraction', category: '__earlier' }))
  assert.deepEqual(earlier.items.map((item) => item.category), ['Old free text'])
  assert.equal((await service.list(service.filters({ type: 'Overdue' }))).items.every((item) => item.type === 'Overdue'), true)
  await assert.rejects(service.list(service.filters({ type: 'Infraction', category: 'Made up' })), { code: 'FINE_INVALID_CATEGORY' })
  assert.equal((await service.report(service.filters({ type: 'Infraction', category: 'Eating or food' }), staff)).items.length, 1)
})

test('filter options come from setup, keep retired categories, and group older violations', async () => {
  const service = createFinesService(violationDatabase())
  const options = await service.filterOptions()
  assert.deepEqual(options.types.map((type) => type.value), ['Overdue', 'Lost Book', 'Damage Replacement'])
  assert.deepEqual(options.violations.map((item) => [item.category, item.label]), [
    [null, 'All violations'], ['Noise', 'Noise'], ['Eating or food', 'Eating or food'], ['Retired rule', 'Retired rule (retired)'], ['__earlier', 'Other earlier violations'],
  ])
})
