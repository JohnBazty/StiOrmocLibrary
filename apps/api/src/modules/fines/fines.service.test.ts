import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool, RowDataPacket } from 'mysql2/promise'
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
  const result=await service.list({search:verificationCode,status:'all',type:'all',period:'all',date:null,month:null,week:null,termId:null,from:null,to:null,page:1,limit:25})
  assert.equal(result.pagination.total,1)
  assert.deepEqual(result.items[0]?.receipts,[{receiptId:8,receiptNumber:receipt.receiptNumber,verificationCode,status:'Issued'}])

  const missing=await service.list({search:'NOT-A-RECEIPT',status:'all',type:'all',period:'all',date:null,month:null,week:null,termId:null,from:null,to:null,page:1,limit:25})
  assert.equal(missing.pagination.total,0)
})
