import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { PrintingRepository } from './printing.repository.ts'

test('printing refunds project before filters, totals and pagination; oldest active job stays first',async()=>{
  const sql=new PGlite()
  try{
    await sql.exec(`CREATE TABLE users(user_id int,full_name text,school_id text,user_role text);
      CREATE TABLE print_requests(request_id int,user_id int,file_name text,number_of_copies int,print_type text,paper_size text,page_count int,total_sheets int,
        calculated_cost numeric,payment_status text,job_status text,created_at timestamp,paid_at timestamp,completed_at timestamp);
      CREATE TABLE print_payment_receipts(request_id int,print_receipt_id int,receipt_number text,verification_code text,receipt_status text,received_at timestamp);
      INSERT INTO users VALUES(1,'QA Borrower','QA-001','Student');
      INSERT INTO print_requests(request_id,user_id,file_name,calculated_cost,payment_status,job_status,created_at) VALUES
        (1,1,'first.pdf',5,'Unpaid','Printing','2026-11-01 08:00:00'),
        (2,1,'refunded.pdf',5,'Unpaid','Pending','2026-11-01 09:00:00'),
        (3,1,'later.pdf',5,'Unpaid','Pending','2026-11-01 10:00:00'),
        (4,1,'pending-refund.pdf',5,'Unpaid','Pending','2026-11-01 11:00:00');`)
    const pool={execute:async(query:string,values:unknown[]=[])=>{
      let index=0;return[(await sql.query(query.replace(/\?/g,()=>'$'+(++index)),values)).rows]
    }}
    const repo=new PrintingRepository(pool as never)
    repo.serviceStatus=async()=>({accepting_requests:1}) as never
    const views=[{request_id:2,user_id:1,payment_status:'Refunded',local_payment_id:'refund',refund_pending:false,cancel_job:true},
      {request_id:4,user_id:1,payment_status:'Refund pending',local_payment_id:'pending',refund_pending:true,cancel_job:false}]
    const filters={q:'',status:'',payment:'',page:1,limit:1}
    assert.equal((await repo.queue(filters,views)).rows[0].request_id,1)
    assert.equal((await repo.queue({...filters,page:2},views)).rows[0].request_id,3)
    const refunded=await repo.queue({...filters,payment:'Refunded',limit:25},views)
    assert.equal(refunded.pagination.total,1);assert.equal(refunded.rows[0].job_status,'Cancelled')
    const pending=await repo.queue({...filters,payment:'Refund pending'},views)
    assert.equal(pending.rows[0].refund_pending,true)
    const summary=await repo.summary(views)
    assert.equal(summary.pending_jobs,2);assert.equal(summary.unpaid_jobs,2)
    const cancelledViews=views.map(row=>({...row,payment_status:'Refunded',refund_pending:false,cancel_job:true}))
    assert.equal((await repo.latestOpenForUser(1,cancelledViews))?.request_id,3,'Dashboard must skip refunded/cancelled requests')
    assert.equal(await repo.latestOpenForUser(99,cancelledViews),null,'Another borrower has no access to these requests')
    const wrongOwner=await repo.queue({...filters,payment:'Refunded'},views.map(row=>({...row,user_id:99})))
    assert.equal(wrongOwner.pagination.total,0)
    const paidView={request_id:3,user_id:1,payment_status:'Paid',paid_centavos:500,local_payment_id:'paid',refund_pending:false,cancel_job:false}
    assert.equal((await repo.queue({...filters,payment:'Paid'},[paidView])).pagination.total,1)
    assert.equal((await repo.queue({...filters,payment:'Paid'},[{...paidView,paid_centavos:499}])).pagination.total,0)
  }finally{await sql.close()}
})
