import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { createDeskDashboardService } from './desk-dashboard.service.ts'
import { csvCell, deskFilters } from './desk-dashboard.rules.ts'
import { deliverDeskReminderEmails } from '../notifications/overdue-email.worker.ts'

test('filters are bounded and spreadsheet values cannot become formulas',()=>{
 for(const value of [{department:['SHS']},{tab:'anything'},{page:'-1'},{days:'100000'},{level:'5'},{program:'x\n'},{q:'x'.repeat(81)}])assert.throws(()=>deskFilters(value))
 assert.equal(csvCell(' =SUM(A1)'), '"\' =SUM(A1)"')
 assert.equal(csvCell('a,"b"'), '"a,""b"""')
})

test('Postgres desk counts, academic filters, exports and queued reminders preserve authoritative state',async()=>{
 const pg=new PGlite()
 await pg.exec(`
 SET TIME ZONE 'Asia/Manila';
 CREATE TABLE users(user_id BIGINT PRIMARY KEY,full_name TEXT,school_id TEXT,user_role TEXT,account_status TEXT,course_or_strand TEXT,educational_level TEXT);
 CREATE TABLE accounts(account_id BIGINT PRIMARY KEY,user_id BIGINT,role TEXT,account_status TEXT);
 CREATE TABLE student_profiles(account_id BIGINT,program_strand TEXT,year_grade_level TEXT);
 CREATE TABLE materials(material_id BIGINT PRIMARY KEY,title TEXT);
 CREATE TABLE titles(title_id BIGINT PRIMARY KEY,title TEXT,record_type TEXT,isbn TEXT,lifecycle_status TEXT);
 CREATE TABLE physical_copies(physical_copy_id BIGINT PRIMARY KEY,title_id BIGINT,barcode TEXT,lifecycle_status TEXT,condition_status TEXT);
 CREATE TABLE borrow_transactions(transaction_id BIGINT PRIMARY KEY,user_id BIGINT,material_id BIGINT,physical_copy_id BIGINT,transaction_status TEXT,lost_confirmed_at TIMESTAMPTZ,due_at TIMESTAMP,borrowed_at TIMESTAMPTZ,renewal_count INT DEFAULT 0);
 CREATE TABLE reservations(reservation_id BIGINT PRIMARY KEY,user_id BIGINT,book_title_id BIGINT,assigned_physical_copy_id BIGINT,reserved_at TIMESTAMPTZ,request_kind TEXT,reservation_status TEXT,queue_position INT);
 CREATE TABLE lost_book_reports(transaction_id BIGINT,report_status TEXT);
 CREATE TABLE notifications(notification_id BIGSERIAL PRIMARY KEY,user_id BIGINT,message_title TEXT,message_body TEXT,trigger_type TEXT,source_type TEXT,source_id BIGINT,action_path TEXT,priority TEXT,dedupe_key TEXT,scheduled_for TIMESTAMPTZ,delivered_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,deleted_at TIMESTAMPTZ,UNIQUE(user_id,dedupe_key));
 CREATE TABLE admin_notifications(event_type TEXT,message_title TEXT,message_body TEXT);
 INSERT INTO users VALUES (1,'Librarian','LIB','Librarian','Active',NULL,NULL),(2,'Ana Flores','SHS-11','Student','Active','STEM','Grade 11'),(3,'Ben Cruz','COL-2','Student','Active','BSIT','2nd Year'),(4,'Faculty Member','FAC-1','Faculty','Active',NULL,NULL),(5,'Missing Details','ID-5','Student','Active',NULL,NULL),(6,'Inactive','ID-6','Student','Deactivated','BSHM','4th Year');
 INSERT INTO accounts VALUES (1,1,'Librarian','Active'),(2,2,'Student','Active'),(3,3,'Student','Active'),(4,4,'Faculty','Active');
 INSERT INTO student_profiles VALUES (3,'Bachelor of Science in Information Technology','2nd Year');
 INSERT INTO materials VALUES(1,'Algorithms'),(2,'Tourism'),(3,'Research');
 INSERT INTO titles VALUES(1,'Algorithms','Book','9780000000001','Active'),(2,'Tourism','Book',NULL,'Active'),(3,'Research','Research/Thesis',NULL,'Active');
 INSERT INTO physical_copies VALUES(1,1,'COPY-1','Active','Good'),(2,1,'COPY-2','Active','Good'),(3,2,'COPY-3','Active','For Repair'),(4,2,'COPY-4','Active','Damaged'),(5,3,'COPY-5','Active','Good');
 INSERT INTO borrow_transactions VALUES
 (1,2,1,1,'Overdue',NULL,NOW()-INTERVAL '2 days',NOW()-INTERVAL '5 days',0),
 (2,3,1,2,'Borrowed',NULL,NOW()-INTERVAL '1 day',NOW()-INTERVAL '2 days',1),
 (3,4,3,5,'Returned',NULL,NOW()-INTERVAL '3 days',NOW()-INTERVAL '5 days',0),
 (4,5,2,4,'Borrowed',NULL,((NOW() AT TIME ZONE 'Asia/Manila')::date+TIME '23:59:59') AT TIME ZONE 'Asia/Manila',NOW()-INTERVAL '1 day',0);
 INSERT INTO reservations VALUES(1,2,2,3,NOW()-INTERVAL '2 days','Reservation','approved',1),(2,3,1,NULL,NOW()-INTERVAL '3 days','Reservation','pending',1),(3,3,1,2,NOW()-INTERVAL '4 days','Reservation','ready_for_pickup',1),(4,2,1,1,NOW(),'CartHandover','approved',1);
 INSERT INTO lost_book_reports VALUES(2,'Pending');
 `)
 await pg.exec(`ALTER TABLE users ADD COLUMN email VARCHAR(191);
 UPDATE users SET email='student'||user_id||'@ormoc.sti.edu.ph';
 CREATE ROLE anon; CREATE ROLE authenticated;`)
 await pg.exec(readFileSync(new URL('../../../../../database/supabase/046_desk_overdue_email.sql',import.meta.url),'utf8'))
 let rolledBack=0
 const execute=async(sql:string,values:unknown[]=[])=>{const r=await pg.query(toPgPlaceholders(sql),values);return /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)?[{affectedRows:r.affectedRows??0},r]:[r.rows,r]}
 const connection={execute,query:execute,beginTransaction:()=>pg.exec('BEGIN'),commit:()=>pg.exec('COMMIT'),rollback:()=>{rolledBack++;return pg.exec('ROLLBACK')},release(){}}
 const pool={execute,query:execute,getConnection:async()=>connection} as unknown as Pool
 const service=createDeskDashboardService(pool,()=>true),actor={accountId:1,role:'Librarian'}
 try{
  const overview=await service.overview(actor,{})
  assert.deepEqual(overview.counts,{dueToday:1,overdue:2,holds:1,repair:1})
  assert.equal(overview.groups.reduce((sum,g)=>sum+g.count,0),4)
  assert.equal(overview.groups.find(g=>g.label==='BSIT')?.count,1)
  assert.equal(overview.topBooks[0].title,'Algorithms');assert.equal(overview.topBooks[0].count,2)
  assert.equal((await service.tasks(actor,{department:'SHS',level:'11',program:'STEM'})).items[0].borrower,'Ana Flores')
  const college=await service.tasks(actor,{department:'College',program:'BSIT',level:'2'})
  assert.equal(college.total,1);assert.equal(college.items[0].lostReported,true)
  assert.equal((await service.tasks(actor,{tab:'holds'})).total,1)
  const search=await service.search(actor,{q:'Ana'});assert.equal(search.people[0].schoolId,'SHS-11')
  assert.equal((await service.search(actor,{q:'%'})).people.length,0)
  const exportRows=await service.exportCsv(actor,{department:'College'})
  let csv='';for await(const row of exportRows)csv+=row
  assert.match(csv,/Ben Cruz/);assert.doesNotMatch(csv,/Ana Flores/)
  const interrupted=await service.exportCsv(actor,{})
  for await(const _ of interrupted)break
  assert.equal(rolledBack,1,'early export closes its read transaction')
  await assert.rejects(service.tasks({accountId:2,role:'Student'},{}),(e:any)=>e.status===403)
  await assert.rejects(service.tasks({accountId:0,role:''},{}),(e:any)=>e.status===401)
  await assert.rejects(service.queueReminders(actor,{ids:[1],userId:99}))
  await pg.exec("SET TIME ZONE 'UTC'")
  assert.equal((await service.reminderPreview(actor,{})).items.length,2,'Manila due times stay correct with a UTC database session')
  await pg.exec("SET TIME ZONE 'Asia/Manila'")
  // A posted automatic inbox notice must not suppress the independently tracked email.
  await pg.exec(`INSERT INTO notifications(user_id,source_id,dedupe_key,delivered_at) VALUES(2,1,'loan:1:overdue',NOW())`)
  assert.equal((await service.reminderPreview(actor,{})).items.length,2)
  assert.deepEqual(await service.queueReminders(actor,{ids:[1,2]}),{queued:2,skipped:0,channel:'School email'})
  assert.equal((await service.queueReminders(actor,{ids:[1,2]})).queued,0)
  assert.equal((await service.tasks(actor,{department:'SHS'})).items[0].reminderStatus,'Queued')
  await pg.exec(`UPDATE borrow_transactions SET transaction_status='Returned' WHERE transaction_id=2`)
  const sent:Array<{to:string;subject:string;body:string}>=[]
  const send=async(to:string,subject:string,body:string)=>{sent.push({to,subject,body})}
  const result=await deliverDeskReminderEmails(pool,new Date(),send,()=>true)
  assert.equal(result.overdueEmailsSent,1);assert.equal(result.overdueEmailsCancelled,1)
  assert.equal(sent[0].to,'student2@ormoc.sti.edu.ph');assert.match(sent[0].body,/Algorithms/);assert.match(sent[0].body,/Philippine time/)
  assert.equal((await service.tasks(actor,{})).items[0].reminderStatus,'Sent')
  assert.equal((await service.reminderPreview(actor,{})).items.length,0)
  assert.equal((await deliverDeskReminderEmails(pool,new Date(),send,()=>true)).overdueEmailsSent,0)
  assert.equal(sent.length,1)
  await assert.rejects(service.queueReminders({accountId:2,role:'Librarian'},{ids:[1]}),(e:any)=>e.status===403)
  await assert.rejects(service.queueReminders(actor,{ids:[1,1]}))
  await pg.exec(`UPDATE borrow_transactions SET renewal_count=1,due_at=NOW()+INTERVAL '1 day' WHERE transaction_id=1`)
  assert.equal((await service.queueReminders(actor,{ids:[1]})).queued,0,'renewed future loan is not overdue')
  await pg.exec(`UPDATE borrow_transactions SET due_at=NOW()-INTERVAL '1 hour' WHERE transaction_id=1`)
  assert.equal((await service.queueReminders(actor,{ids:[1]})).queued,1,'new renewal has its own email key')
  const uncertain=await deliverDeskReminderEmails(pool,new Date(),async()=>{throw Error('private provider credentials')},()=>true)
  assert.equal(uncertain.overdueEmailsUnconfirmed,1)
  assert.equal((await service.queueReminders(actor,{ids:[1]})).queued,0,'uncertain delivery must never be resent blindly')
  const failure=(await pg.query<{last_error:string}>(`SELECT last_error FROM desk_overdue_email_deliveries WHERE status='Unconfirmed'`)).rows[0]
  assert.doesNotMatch(failure.last_error,/private provider/)
  await pg.exec(`UPDATE borrow_transactions SET renewal_count=2 WHERE transaction_id=1`)
  const unconfigured=createDeskDashboardService(pool,()=>{throw Error('secret config')})
  await assert.rejects(unconfigured.queueReminders(actor,{ids:[1]}),(e:any)=>e.status===503&&!e.message.includes('secret'))
  assert.equal((await service.queueReminders(actor,{ids:[1]})).queued,1)
  await pg.exec(`UPDATE users SET email='changed@ormoc.sti.edu.ph' WHERE user_id=2`)
  assert.equal((await deliverDeskReminderEmails(pool,new Date(),send,()=>true)).overdueEmailsCancelled,1)
  await pg.exec(`UPDATE borrow_transactions SET renewal_count=3 WHERE transaction_id=1`)
  assert.equal((await service.queueReminders(actor,{ids:[1]})).queued,1)
  assert.equal((await deliverDeskReminderEmails(pool,new Date(),send,()=>{throw Error('not configured')})).overdueEmailsFailed,1)
  await pg.exec(`UPDATE borrow_transactions SET renewal_count=4 WHERE transaction_id=1`)
  await service.queueReminders(actor,{ids:[1]})
  await pg.exec(`UPDATE desk_overdue_email_deliveries SET status='Sending',lease_until=NOW()-INTERVAL '1 minute' WHERE status='Pending'`)
  await deliverDeskReminderEmails(pool,new Date(),send,()=>true)
  assert.equal((await service.tasks(actor,{})).items[0].reminderStatus,'Needs checking')
  await pg.exec(`UPDATE users SET email='other@example.com' WHERE user_id=2; UPDATE borrow_transactions SET renewal_count=5 WHERE transaction_id=1`)
  assert.equal((await service.queueReminders(actor,{ids:[1]})).queued,0,'only saved school email recipients are allowed')
  assert.equal((await service.tasks(actor,{})).items[0].reminderStatus,'No school email')
  const protection=(await pg.query<{rls:boolean;anon:boolean;authenticated:boolean}>(`SELECT c.relrowsecurity rls,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon,
    has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated FROM pg_class c WHERE c.relname='desk_overdue_email_deliveries'`)).rows[0]
  assert.deepEqual(protection,{rls:true,anon:false,authenticated:false})
 }finally{await pg.close()}
})
