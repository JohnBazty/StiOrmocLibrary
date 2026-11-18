import assert from 'node:assert/strict'
import { mkdir,writeFile } from 'node:fs/promises'
import express from 'express'
import request from 'supertest'
import { db,dbDriver } from '../src/config/db.js'
import { createLiveReportsService,parseReportFilters,exportLiveReport } from '../src/modules/reports/live-reports.service.ts'
import { createLiveReportsRouter } from '../src/modules/reports/live-reports.routes.ts'
import { verifyIntegrityProtectedCsv } from '../src/modules/reports/csv-integrity.ts'

// All fixtures live in connection-local TEMP tables within one outer transaction.
// Nested service boundaries are no-ops in this adapter so the final rollback also
// removes fixtures. Real service READ ONLY transactions are checked separately.
if(dbDriver!=='postgres')throw Error('Requires configured Postgres.')
const q=await db.getConnection()
const collect=async(stream:AsyncIterable<unknown>)=>{const chunks:Buffer[]=[];for await(const part of stream)chunks.push(Buffer.from(part as Buffer));return Buffer.concat(chunks)}
try{
  await q.beginTransaction()
  await q.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',[])
  const tables:Record<string,string>={
    accounts:'account_id bigint,role text,account_status text,user_id bigint',
    users:'user_id bigint,full_name text,school_id text,user_role text,account_status text',
    academic_terms:'academic_term_id bigint,academic_year text,term_name text,starts_on date,ends_on date',
    titles:'title_id bigint,title text',materials:'material_id bigint,title text,barcode text',
    physical_copies:'physical_copy_id bigint,title_id bigint,barcode text',
    borrow_transactions:'transaction_id bigint,user_id bigint,material_id bigint,physical_copy_id bigint,transaction_status text,borrowed_at timestamp,due_at timestamp,returned_at timestamp,created_at timestamp,lost_confirmed_at timestamp',
    reservations:'reservation_id bigint,user_id bigint,material_id bigint,book_title_id bigint,request_kind text,reservation_status text,queue_position int,assigned_physical_copy_id bigint,reserved_at timestamp,ready_at timestamptz,pickup_deadline timestamp',
    print_requests:'request_id bigint,user_id bigint,file_name text,page_count int,number_of_copies int,print_type text,paper_size text,calculated_cost numeric,payment_status text,job_status text,created_at timestamp',
    print_cash_payments:'print_cash_payment_id bigint,request_id bigint,amount_paid numeric,received_at timestamp',
    fines:'fine_id bigint,user_id bigint,transaction_id bigint,fine_type text,payment_status text,fine_amount numeric,applied_date timestamp',
    fine_infractions:'fine_id bigint,category text',
    fine_payment_receipts:'fine_payment_receipt_id bigint,receipt_status text',
    fine_payment_allocations:'fine_id bigint,lost_book_report_id bigint,fine_payment_receipt_id bigint,amount_allocated numeric',
    fine_adjustments:'fine_id bigint,amount_adjusted numeric',
    lost_book_reports:'lost_book_report_id bigint,user_id bigint,transaction_id bigint,replacement_charge numeric,payment_status text,report_status text,verified_at timestamp,reported_at timestamp',
  }
  for(const[name,columns]of Object.entries(tables))await q.execute(`CREATE TEMP TABLE ${name} (${columns}) ON COMMIT DROP`,[])
  await q.execute("INSERT INTO users VALUES (1,'QA Librarian','QA-L','Librarian','Active'),(2,'QA Reader','0000123','Student','Active'),(3,'QA Other','0000999','Faculty','Active'); INSERT INTO accounts VALUES (1,'Librarian','Active',1); INSERT INTO academic_terms VALUES (1,'2026-2027','QA confirmed term','2026-01-01','2026-01-31'),(2,'2026-2027','QA unconfirmed term','2026-01-01',NULL)",[])
  await q.execute("INSERT INTO titles VALUES (1,'100% QA Focus Book'),(2,'Boundary Book'); INSERT INTO materials VALUES (1,'100% QA Focus Book','QA-B1'),(2,'Boundary Book','QA-B2'); INSERT INTO physical_copies VALUES (1,1,'QA-B1'),(2,2,'QA-B2')",[])
  await q.execute("INSERT INTO borrow_transactions SELECT n,2,1,1,'Borrowed','2026-01-22 12:00'::timestamp,'2026-01-23 12:00'::timestamp,NULL,'2026-01-22 04:00'::timestamp,NULL FROM generate_series(1,45) n",[])
  await q.execute("INSERT INTO borrow_transactions VALUES (46,2,1,1,'Returned','2026-01-20','2026-01-21','2026-01-22 08:00','2026-01-20',NULL),(48,3,2,2,'Borrowed','2026-01-21 23:59:59','2026-01-23',NULL,'2026-01-21',NULL),(49,3,2,2,'Borrowed','2026-01-22 00:00:00','2026-01-23',NULL,'2026-01-21',NULL),(50,3,2,2,'Borrowed','2026-01-22 23:59:59.999','2026-01-23',NULL,'2026-01-22',NULL),(51,3,2,2,'Borrowed','2026-01-23 00:00:00','2026-01-24',NULL,'2026-01-22',NULL)",[])
  await q.execute("INSERT INTO reservations VALUES (1,2,1,1,'Reservation','pending',1,NULL,'2026-01-22',NULL,NULL),(2,2,1,1,'CartHandover','approved',1,1,'2026-01-22',NULL,NULL)",[])
  await q.execute("INSERT INTO print_requests SELECT n,2,CONCAT('QA-',n,'.pdf'),2,1,'Monochrome','A4',20,'Paid','Completed',stamp FROM (VALUES (11,'2026-01-21 15:59:59'::timestamp),(12,'2026-01-21 16:00:00'::timestamp),(13,'2026-01-22 15:59:59.999'::timestamp),(14,'2026-01-22 16:00:00'::timestamp)) f(n,stamp); INSERT INTO print_cash_payments VALUES (1,11,20,'2026-01-22 09:00'),(2,12,20,'2026-01-23 09:00')",[])
  await q.execute("INSERT INTO fines SELECT n,CASE WHEN n=1 THEN 2 ELSE 3 END,CASE WHEN n=1 THEN 1 ELSE 48 END,'Overdue','Unpaid',100,'2026-01-22 01:00' FROM generate_series(1,5301) n; INSERT INTO fine_payment_receipts VALUES (1,'Issued'),(2,'Reversed'); INSERT INTO fine_payment_allocations VALUES (1,NULL,1,40),(1,NULL,2,20); INSERT INTO fine_adjustments VALUES (1,10)",[])
  await q.execute("CREATE TEMP TABLE authors(title_id bigint,author_name text,author_order int) ON COMMIT DROP; CREATE TEMP TABLE categories(category_id bigint,category_name text) ON COMMIT DROP; CREATE TEMP TABLE research_records(title_id bigint,viewing_status text,research_code text,adviser_name text) ON COMMIT DROP",[])
  await q.execute("ALTER TABLE titles ADD record_type text DEFAULT 'Book', ADD lifecycle_status text DEFAULT 'Active', ADD isbn text DEFAULT '', ADD publication_year int DEFAULT 2026, ADD category_id bigint; ALTER TABLE materials ADD availability_status text DEFAULT 'Available'; ALTER TABLE physical_copies ADD material_id bigint, ADD lifecycle_status text DEFAULT 'Active', ADD condition_status text DEFAULT 'Good', ADD availability_status text DEFAULT 'Available', ADD accession_number text DEFAULT 'QA', ADD shelf_location text DEFAULT 'QA Shelf'",[])
  await q.execute("UPDATE physical_copies SET material_id=physical_copy_id; UPDATE materials SET availability_status='Borrowed' WHERE material_id=2; INSERT INTO physical_copies(physical_copy_id,title_id,barcode,material_id,lifecycle_status,condition_status) VALUES (3,1,'QA-Archived',1,'Archived','Good'),(4,1,'QA-Damaged',1,'Active','Damaged'); INSERT INTO authors VALUES (1,'QA Author',1)",[])
  await q.execute(`CREATE TEMP VIEW october17_print_services AS SELECT CONCAT('P-',p.request_id) id,'Online request'::text source,u.full_name name,u.school_id,u.user_role role,p.file_name,p.page_count,p.number_of_copies,p.print_type,p.paper_size,p.calculated_cost,p.payment_status,p.job_status status,p.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila' service_time FROM print_requests p JOIN users u ON u.user_id=p.user_id; CREATE TEMP VIEW october17_print_revenue AS SELECT CONCAT('P-',c.print_cash_payment_id) id,CONCAT('P-',p.request_id) request_id,'Online request'::text source,u.full_name name,u.school_id,u.user_role role,p.file_name,c.amount_paid,c.received_at received FROM print_cash_payments c JOIN print_requests p ON p.request_id=c.request_id JOIN users u ON u.user_id=p.user_id`,[])
  const connection={...q,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},execute:async(sql:string,values:unknown[]=[])=>{
    if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')return [[],[]]
    assert.match(sql,/^\s*SELECT/i,'Report must only read source data')
    return q.execute(sql,values as never[])
  }}
  const service=createLiveReportsService({getConnection:async()=>connection} as never,'postgres')
  const holdings=await service.read(1,parseReportFilters({kind:'holdings'}))
  assert.equal(holdings.total,3)
  assert.ok(!holdings.rows.some(row=>row.barcode==='QA-Archived'))
  assert.equal(holdings.rows.find(row=>row.barcode==='QA-Damaged')!.availability,'Unavailable')
  assert.equal(holdings.rows.find(row=>row.barcode==='QA-B2')!.availability,'Borrowed')
  assert.equal((await service.read(1,parseReportFilters({kind:'holdings',q:'qa author'}))).total,2)
  const filters=parseReportFilters({q:'0000123',status:'Borrowed',period:'custom',from:'2026-01-22',to:'2026-01-22',page:'2'})
  const data=await service.read(1,filters)
  assert.equal(data.total,45)
  assert.equal(data.columnLabels.school_id,'Student / Faculty ID')
  assert.equal(data.rows[0].id,'45') // pg bigint remains text; leading-zero school IDs remain text too.
  assert.equal(data.rows[0].school_id,'0000123')
  assert.equal((await service.read(1,parseReportFilters({q:'qa reader'}))).total,46)
  assert.equal((await service.read(1,parseReportFilters({q:'%'}))).total,46)
  assert.equal((await service.read(1,parseReportFilters({q:'_'}))).total,0)
  const boundaries=await service.read(1,parseReportFilters({q:'Boundary Book',period:'custom',from:'2026-01-22',to:'2026-01-22'}))
  assert.deepEqual(boundaries.rows.map(row=>row.id),['50','49'])
  assert.equal((await service.read(1,parseReportFilters({kind:'returns',period:'custom',from:'2026-01-22',to:'2026-01-22'}))).total,1)
  const semester=await service.read(1,parseReportFilters({q:'0000123',status:'Borrowed',period:'semester',termId:'1'}))
  assert.equal(semester.total,45)
  assert.match(semester.label,/2026-01-01 to 2026-01-31/)
  await assert.rejects(service.read(1,parseReportFilters({period:'semester',termId:'2'})),{code:'REPORT_FILTER_INVALID'})
  const jobs=await service.read(1,parseReportFilters({kind:'printing',period:'custom',from:'2026-01-22',to:'2026-01-22'}))
  assert.deepEqual(jobs.rows.map(row=>row.id),['P-13','P-12'])
  assert.equal(jobs.rows[1].submitted,'2026-01-22 00:00')
  const revenue=await service.read(1,parseReportFilters({kind:'printRevenue',period:'custom',from:'2026-01-22',to:'2026-01-22'}))
  assert.equal(revenue.total,1);assert.equal(revenue.rows[0].request_id,'P-11')
  const obligations=await service.read(1,parseReportFilters({kind:'fines',q:'0000123',status:'Accruing'}))
  assert.equal(obligations.total,1);assert.equal(Number(obligations.rows[0].paid),40);assert.equal(Number(obligations.rows[0].outstanding),50)
  const requests=await service.read(1,parseReportFilters({kind:'requests'}))
  assert.equal(requests.rows.find(row=>row.request_type==='Cart handover')!.status,'Awaiting handover')
  assert.equal(requests.rows.find(row=>row.request_type==='Book reservation')!.status,'Waiting for a copy')

  const app=express();app.use((_r,s,n)=>{s.locals.authenticatedUser={role:'Librarian',accountId:1};n()});app.use(createLiveReportsRouter(service))
  const params=new URLSearchParams({q:'0000123',status:'Borrowed',period:'custom',from:'2026-01-22',to:'2026-01-22',page:'2'})
  const preview=await request(app).get(`/?${params}`)
  assert.equal(preview.body.data.total,45);assert.equal(preview.body.data.rows.length,20)
  const download=await request(app).get(`/export?${params}&format=csv`)
  assert.equal(download.status,200)
  assert.equal(verifyIntegrityProtectedCsv(Buffer.from(download.text)).valid,true)
  assert.equal((download.text.match(/"0000123"/g)??[]).length,45)
  assert.doesNotMatch(download.text,/Boundary Book|0000999/)
  const empty=await service.read(1,parseReportFilters({q:'Nothing matches this'}))
  assert.equal(empty.total,0);assert.equal(empty.columns.length,10)
  const emptyCsv=await collect(exportLiveReport(empty,'csv'))
  assert.match(emptyCsv.toString(),/Student \/ Faculty ID/);assert.match(emptyCsv.toString(),/Nothing matches this/)

  await mkdir('output/oct17-phase4',{recursive:true})
  await writeFile('output/oct17-phase4/filtered.csv',download.text)
  await writeFile('output/oct17-phase4/empty.csv',emptyCsv)
  await writeFile('output/oct17-phase4/filtered.pdf',await collect(exportLiveReport(data,'pdf')))
  await writeFile('output/oct17-phase4/empty.pdf',await collect(exportLiveReport(empty,'pdf')))
  const long={...data,title:'QA long-text report',columns:['id','school_id','title'],rows:[{id:1,school_id:'0000123',title:'START_SENTINEL '+('Extremely long research description with Unicode José and Niño. '.repeat(650))+' END_SENTINEL'}],total:1}
  await writeFile('output/oct17-phase4/long-text.pdf',await collect(exportLiveReport(long,'pdf')))
  await q.execute("INSERT INTO print_requests SELECT n,3,'QA ceiling.pdf',1,1,'Monochrome','A4',1,'Unpaid','Pending','2026-02-01' FROM generate_series(100,20100) n",[])
  await assert.rejects(service.read(1,parseReportFilters({kind:'printing'})),{code:'REPORT_FILTER_INVALID'})
  assert.equal((await service.read(1,parseReportFilters({kind:'printing',q:'QA-12.pdf'}))).total,1)
  console.log('PASS: 45 matching rows across preview pages; literal/case/leading-zero search; return/semester/Manila midnight filters; payments by received date; oldest fine beyond 5000 rows; correct balance math; cart/reservation distinction; active holdings; empty exports; signed CSV and long-text PDF; 20000-row ceiling and narrow search. TEMP fixtures rolled back.')
}finally{await q.rollback();q.release();await db.end()}
