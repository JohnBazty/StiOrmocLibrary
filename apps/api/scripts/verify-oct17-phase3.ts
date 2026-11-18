import assert from 'node:assert/strict'
import { db, dbDriver } from '../src/config/db.js'
import { createLibraryActivityService } from '../src/modules/notifications/library-activity.service.ts'
import { notifyLibrarians } from '../src/modules/notifications/library-alerts.ts'
import { generateLibrarianAlerts } from '../src/modules/notifications/library-alerts.worker.ts'
import { createNotificationRepository } from '../src/modules/notifications/notification.repository.ts'

// TEMP tables shadow product names only on this connection. No source rows are
// copied. Their identities/sequences are temporary too. Finally always rolls back.
if(dbDriver!=='postgres') throw new Error('This check requires the configured Postgres database.')
const q=await db.getConnection()
try {
  await q.beginTransaction()
  const schemas:Record<string,string>={
    users:'user_id bigint PRIMARY KEY,full_name text,school_id text,account_status text',
    accounts:'account_id bigint PRIMARY KEY,user_id bigint,role text,account_status text',
    titles:'title_id bigint PRIMARY KEY,title text',
    materials:'material_id bigint PRIMARY KEY,title text',
    physical_copies:'physical_copy_id bigint,title_id bigint',
    borrow_transactions:'transaction_id bigint PRIMARY KEY,user_id bigint,material_id bigint,physical_copy_id bigint,due_at timestamp,returned_at timestamp,lost_confirmed_at timestamp,transaction_status text',
    admin_notifications:'admin_notification_id bigint PRIMARY KEY,event_type text,actor_user_id bigint,borrow_transaction_id bigint,book_title_id bigint,message_title text,message_body text,created_at timestamp',
    attendance_logs:'log_id bigint,user_id bigint,reason_for_visit text,attendance_date date,time_in time,time_out time,checked_in_at timestamp,checked_out_at timestamp',
    reservations:'reservation_id bigint PRIMARY KEY,user_id bigint,material_id bigint,book_title_id bigint,request_kind text,reservation_status text',
    book_request_events:'event_id bigint,reservation_id bigint,event_status text,occurred_at timestamptz',
    print_requests:'request_id bigint PRIMARY KEY,user_id bigint,file_name text,job_status text',
    print_status_history:'print_status_history_id bigint,request_id bigint,to_status text,created_at timestamp',
    print_payment_receipts:'print_receipt_id bigint,request_id bigint,student_name_snapshot text,school_id_snapshot text,file_name_snapshot text,amount_received numeric,received_at timestamp,reversed_at timestamp',
    notifications:`notification_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id bigint,message_title text,message_body text,trigger_type text,
      source_type text,source_id bigint,action_path text,priority text,dedupe_key text,scheduled_for timestamp,delivered_at timestamp,
      notification_timestamp timestamp DEFAULT (NOW() AT TIME ZONE 'UTC'),is_read integer DEFAULT 0,read_at timestamp,deleted_at timestamp,expires_at timestamp,
      UNIQUE(user_id,dedupe_key)`,
  }
  for(const [name,columns] of Object.entries(schemas)) await q.execute(`CREATE TEMP TABLE ${name} (${columns}) ON COMMIT DROP`,[])
  await q.execute("INSERT INTO users VALUES (1,'QA Librarian A','QA-L1','Active'),(2,'QA Librarian B','QA-L2','Active'),(3,'QA Student','0000123','Active'),(4,'QA Staff','QA-S','Active'),(5,'QA Inactive','QA-L3','Active')",[])
  await q.execute("INSERT INTO accounts VALUES (11,1,'Librarian','Active'),(12,2,'Librarian','Active'),(13,3,'Student','Active'),(14,4,'Staff','Active'),(15,5,'Librarian','Archived'),(16,1,'Librarian','Active')",[])
  await q.execute("INSERT INTO titles VALUES (1,'QA Book'); INSERT INTO materials VALUES (1,'QA Book'); INSERT INTO physical_copies VALUES (1,1)",[])
  await q.execute("INSERT INTO borrow_transactions VALUES (41,3,1,1,'2026-10-21 15:17',NULL,NULL,'Borrowed'),(42,3,1,1,'2026-10-20',NOW(),NULL,'Returned'),(43,3,1,1,'2026-10-20',NULL,NOW(),'Overdue')",[])
  await q.execute("INSERT INTO admin_notifications VALUES (1,'checkout_confirmed',3,41,1,'Checkout confirmed','QA Student borrowed QA Book.','2026-10-20 15:17'),(2,'return_completed',3,42,1,'Return completed','QA Book returned.','2026-10-21 15:17')",[])
  await q.execute("INSERT INTO attendance_logs VALUES (1,3,'Study','2026-10-22','07:30','08:00','2026-10-22 07:30','2026-10-22 08:00')",[])
  await q.execute("INSERT INTO reservations VALUES (1,3,1,1,'Reservation','ready_for_pickup'),(2,3,1,1,'CartHandover','approved')",[])
  await q.execute("INSERT INTO book_request_events VALUES (1,1,'ready_for_pickup','2026-10-22T00:01Z'),(2,2,'received','2026-10-22T00:02Z'),(3,1,'expired','2026-10-23T00:01Z')",[])
  await q.execute("INSERT INTO print_requests VALUES (1,3,'QA.pdf','Pending'); INSERT INTO print_status_history VALUES (1,1,'Pending','2026-10-22 00:03')",[])
  await q.execute("INSERT INTO print_payment_receipts VALUES (1,1,'QA Student','0000123','QA.pdf',20,'2026-10-22 08:04',NULL)",[])

  const activity=createLibraryActivityService(q,true)
  const all=await activity.list('Librarian')
  assert.equal(all.items.length,9)
  assert.equal(new Set(all.items.map(item=>item.id)).size,9)
  assert.equal(all.items.find(item=>item.id==='entry:1')?.createdAt,'2026-10-21T23:30:00.000Z')
  assert.equal(all.items.find(item=>item.id==='print:1')?.createdAt,'2026-10-22T00:03:00.000Z')
  assert.match(all.items.find(item=>item.id==='reservation:2')!.title,/Cart awaiting handover/)
  assert.match(all.items.find(item=>item.id==='reservation:2')!.actionPath,/\/circulation\?q=0000123/)
  assert.equal((await activity.list('Librarian','attendance')).items.length,2)
  assert.match(all.items.find(item=>item.id==='desk:2')!.actionPath,/kind=returns/)

  const now=new Date('2026-10-22T01:00:00Z')
  assert.equal((await generateLibrarianAlerts(q,now)).inserted,6)
  assert.equal((await generateLibrarianAlerts(q,now)).inserted,0)
  const [recipients]=await q.execute('SELECT DISTINCT user_id FROM notifications ORDER BY user_id',[])
  assert.deepEqual((recipients as Array<{user_id:string}>).map(row=>Number(row.user_id)),[1,2])
  await q.execute('SAVEPOINT failed_operation',[])
  await notifyLibrarians(q,{key:'reservation:9:expired',title:'Expired',body:'QA rollback',sourceId:9,personUserId:3,path:'/librarian/reservations',type:'Reservation Arrival'})
  await q.execute('ROLLBACK TO SAVEPOINT failed_operation',[])
  const [rolledBack]=await q.execute("SELECT COUNT(*) AS count FROM notifications WHERE dedupe_key='library:reservation:9:expired'",[])
  assert.equal(Number((rolledBack as Array<{count:string}>)[0].count),0)

  const repository=createNotificationRepository(q as never)
  const before=await repository.list({accountId:11,role:'Librarian'},{})
  assert.equal(before.unreadCount,3)
  await assert.rejects(repository.markRead({accountId:12,role:'Librarian'},before.items[0].notificationId),{status:404})
  await repository.markAllRead({accountId:11,role:'Librarian'})
  await repository.removeAll({accountId:11,role:'Librarian'})
  assert.equal((await generateLibrarianAlerts(q,now)).inserted,0)
  assert.equal((await repository.list({accountId:11,role:'Librarian'},{})).unreadCount,0)
  assert.equal((await repository.list({accountId:12,role:'Librarian'},{})).unreadCount,3)
  console.log('PASS: all activity sources, Manila times, cart/loan separation, active Librarian recipients, duplicate prevention, rollback, owner-scoped read/delete and retry persistence. Disposable fixtures only.')
} finally {await q.rollback();q.release();await db.end()}
