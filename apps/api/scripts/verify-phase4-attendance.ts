/** Explicit integration check: isolated temporary schema; never edits public records. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import type { Pool as MysqlPool } from 'mysql2/promise'
import { env } from '../src/config/env.js'
import { toPgPlaceholders } from '../src/config/sql.js'
import { createAttendanceOperations, requireOperationalService } from '../src/modules/attendance/attendance-operations.service.ts'
import { issueAttendanceCredential, purposeAttendanceQr } from '../src/modules/attendance/attendance-credential.service.ts'
import { concurrentAttendanceReport } from '../src/modules/attendance/attendance-concurrent-report.ts'
import { parseAttendanceFilters } from '../src/modules/attendance/attendance.validation.ts'
import { claimOperationalMinute, jobRunnerStatus } from '../src/modules/jobs/job-runner.ts'
import { AttendanceRepository } from '../src/modules/attendance/attendance.repository.ts'

if(env.db.driver!=='postgres')throw new Error('This check requires the configured Postgres database.')
const schema=`phase4_check_${randomUUID().replaceAll('-','')}`
if(!/^phase4_check_[a-f0-9]{32}$/.test(schema))throw new Error('Invalid isolated schema name.')
const admin=new pg.Client({connectionString:env.db.connectionString,options:'-c timezone=Asia/Manila'})
await admin.connect()
const native=new pg.Pool({connectionString:env.db.connectionString,max:6,options:`-c timezone=UTC -c search_path=${schema}`})
const wrap=(client:Pick<pg.PoolClient,'query'>)=>({
 async execute(sql:string,values:any[]=[]){let query=toPgPlaceholders(sql);const write=/^\s*(INSERT|UPDATE|DELETE)/i.test(query);if(/^\s*INSERT/i.test(query)&&!/\bRETURNING\b/i.test(query))query+=' RETURNING *';const r=await client.query(query,values);return [write?{affectedRows:r.rowCount,insertId:Number(r.rows[0]?.log_id??r.rows[0]?.credential_id??r.rows[0]?.event_id??r.rows[0]?.notification_id??0),rows:r.rows}:r.rows,r]},
})
const pool={...wrap(native),async getConnection(){const c=await native.connect();return {...wrap(c),beginTransaction:()=>c.query('BEGIN'),commit:()=>c.query('COMMIT'),rollback:()=>c.query('ROLLBACK'),release:()=>c.release()}}} as unknown as MysqlPool
let now=new Date('2026-10-12T08:00:00+08:00')
const operations=createAttendanceOperations(pool,()=>now)
const id=()=>randomUUID().replaceAll('-','')
try{
 const before=(await admin.query('SELECT COUNT(*) AS count FROM public.attendance_logs')).rows[0].count
 await admin.query(`CREATE SCHEMA ${schema}`)
 const tables=['users','accounts','attendance_qr_credentials','attendance_logs','attendance_scan_receipts','attendance_operation_settings','library_operational_events','library_profile_settings','library_operating_schedule','library_closed_days','notifications','library_job_runs']
 for(const table of tables)await admin.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`)
 await native.query("INSERT INTO library_profile_settings(settings_id,library_name,seat_capacity) VALUES(1,'Phase 4 isolated test',1)")
 await native.query('INSERT INTO library_operating_schedule SELECT * FROM public.library_operating_schedule')
 await native.query('INSERT INTO attendance_operation_settings(settings_id,preclosing_minutes,configured) VALUES(1,5,TRUE)')
 await native.query("INSERT INTO library_job_runs(job_name) VALUES('operational-minute')")
 const actual=new Date();assert.equal((await claimOperationalMinute(actual,pool)).claimed,true)
 assert.equal((await claimOperationalMinute(actual,pool)).claimed,false)
 const lease=await jobRunnerStatus(pool);assert.ok(Math.abs(new Date(lease!.lease_until).getTime()-actual.getTime()-300000)<1000)
 await native.query("UPDATE library_job_runs SET lease_until=NULL,run_token=NULL,last_success_at=NOW() AT TIME ZONE 'UTC'")
 assert.equal((await claimOperationalMinute(actual,pool)).claimed,false)
 for(let n=1;n<=6;n++){
  const role=n===1?'Staff':n===2?'Librarian':'Student'
  await native.query("INSERT INTO users(user_id,role_id,user_role,institutional_id,school_id,full_name,email,password_hash) VALUES($1,1,$2,$3,$3,$4,$5,'integration-only')",[n,role,`PHASE4-${n}`,`Isolated visitor ${n}`,`phase4.${n}@ormoc.sti.edu.ph`])
  await native.query("INSERT INTO accounts(account_id,user_id,school_id,password_hash,role) VALUES($1,$1,$2,'integration-only',$3)",[n,`PHASE4-${n}`,role])
 }
 const passes=await Promise.all([3,4,5,6].map(n=>issueAttendanceCredential(pool,n)))
 const scan=(user:number,purpose:string,request=id(),action='Entry')=>operations.scan(1,{qr_payload:passes[user-3].payload,purpose,request_id:request,expected_action:action})
 const printRequest=id();assert.equal((await scan(3,'Printing',printRequest)).action,'Entry')
 assert.equal((await scan(3,'Printing',printRequest)).duplicate,true)
 await scan(4,'Study');assert.equal((await operations.state()).current,1);assert.equal((await operations.state()).serviceVisits,1)
 await assert.rejects(scan(5,'Study'),{code:'LIBRARY_AT_CAPACITY'})
 await assert.rejects(scan(4,'Printing',id(),'Exit'),{code:'ATTENDANCE_SCAN_COOLDOWN'})
 const concurrent=await Promise.allSettled([scan(5,'Printing'),scan(5,'Printing')]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(concurrent.filter(r=>r.status==='rejected').length,1)
 now=new Date('2026-10-12T08:01:00+08:00');await scan(4,'Study',id(),'Exit');assert.equal((await operations.state()).current,0)
 // Two different visitors compete for one final seat under the same capacity lock.
 now=new Date('2026-10-12T08:02:00+08:00')
 const lastSeat=await Promise.allSettled([scan(4,'Study'),scan(6,'Research')]);assert.equal(lastSeat.filter(r=>r.status==='fulfilled').length,1)
 assert.equal((lastSeat.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code,'LIBRARY_AT_CAPACITY')
 const vacant=lastSeat[0].status==='fulfilled'?6:4
 await assert.rejects(operations.configure(1,{servicePurposes:['Printing'],preclosingMinutes:5,version:1}),{code:'JWT_ROLE_FORBIDDEN'})
 await assert.rejects(operations.saveEvent(1,null,{}),{code:'EVENT_INVALID'})
 const event={title:'Class',kind:'Class',spaceName:'Reading area',startsAt:'2026-10-12T08:02:00+08:00',endsAt:'2026-10-12T10:00:00+08:00',capacity:0,allowWalkIns:false,allowBorrowing:true,allowPrinting:true}
 await assert.rejects(operations.saveEvent(1,null,event),{code:'JWT_ROLE_FORBIDDEN'})
 await operations.saveEvent(2,null,event);now=new Date('2026-10-12T08:03:00+08:00')
 assert.equal((await operations.state()).capacity,0)
 await assert.rejects(scan(vacant,'Study'),{code:'ATTENDANCE_EVENT_RESTRICTED'})
 await assert.rejects(requireOperationalService(pool,'Borrowing',new Date('2026-10-12T19:00:00+08:00')),{code:'LIBRARY_SERVICE_CLOSED'})
 const signed=purposeAttendanceQr(passes[vacant-3].payload,'Book Borrowing',now)
 await assert.rejects(operations.scan(1,{qr_payload:signed,purpose:'Printing',request_id:id(),expected_action:'Entry'}),{code:'LIBRARY_AT_CAPACITY'})
 const [e]=await operations.events();await operations.cancelEvent(2,Number(e.event_id),Number(e.row_version));assert.equal((await operations.state()).capacity,1)
 await native.query("UPDATE attendance_qr_credentials SET credential_status='Revoked' WHERE user_id=$1",[vacant])
 await assert.rejects(scan(vacant,'Printing'),{code:'ATTENDANCE_QR_REVOKED'})
 await native.query("UPDATE users SET account_status='Deactivated' WHERE user_id=$1",[vacant])
 await native.query("UPDATE attendance_qr_credentials SET credential_status='Active' WHERE user_id=$1",[vacant])
 await assert.rejects(scan(vacant,'Printing'),{code:'ATTENDANCE_ACCOUNT_INACTIVE'})
 now=new Date('2026-10-13T09:00:00+08:00')
 const closed=await operations.autoCheckout();assert.ok(closed.closed>=3);assert.equal((await operations.autoCheckout()).closed,0)
 const history=(await native.query("SELECT to_char(checked_out_at,'YYYY-MM-DD HH24:MI') ended,checkout_source FROM attendance_logs WHERE checkout_source='Automatic closing'")).rows
 assert.ok(history.every(r=>r.ended==='2026-10-12 18:55'&&r.checkout_source==='Automatic closing'))
 now=new Date('2026-10-13T18:55:00+08:00');await assert.rejects(scan(3,'Printing'),{code:'ATTENDANCE_ENTRY_CLOSED'})
 const report=await concurrentAttendanceReport(pool,parseAttendanceFilters({date:'2026-10-12'}),{from:'2026-10-12',to:'2026-10-12',label:'test'},['Printing'],now)
 if(report.peak_occupancy!==1)console.log('Isolated interval diagnostics:',(await native.query("SELECT log_id,reason_for_visit,seat_visit,to_char(checked_in_at,'YYYY-MM-DD HH24:MI:SS') started,to_char(checked_out_at,'YYYY-MM-DD HH24:MI:SS') ended FROM attendance_logs")).rows)
 assert.equal(report.peak_occupancy,1)
 const repository=new AttendanceRepository(pool,()=>now),filters=parseAttendanceFilters({date:'2026-10-12'}),range=await repository.range(filters)
 const summary=await repository.summary(filters,range);assert.equal(summary.peak_occupancy,1);assert.ok(String(summary.average_visit).includes('min'))
 const logs=await repository.logs(filters,range);assert.ok(logs.rows.some(row=>row.checkout_source==='Automatic closing'&&Number(row.duration_minutes)>600))
 assert.equal((await admin.query('SELECT COUNT(*) AS count FROM public.attendance_logs')).rows[0].count,before)
 console.log('Passed: seat/service counts, idempotent retries, cooldown, competing scans and final seat, role restrictions, events/cancellation, signed purpose, revoked/inactive accounts, cutoff/restart recovery, concurrent reports/durations and UTC minute leases. Public attendance unchanged.')
}finally{
 await native.end()
 await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
 await admin.end()
}
