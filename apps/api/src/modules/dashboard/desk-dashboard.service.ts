import { db, type Pool, type PoolConnection, type RowDataPacket } from '../../config/db.js'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { HttpError } from '../../core/http-error.ts'
import { academicCte, csvCell, deskFilters, invalidDeskFilter, type DeskFilters } from './desk-dashboard.rules.ts'
import { requireVerificationSender } from '../auth/school-email.sender.ts'
import { eligibleEmailLoanSql, loanDueInstantSql, schoolEmail } from '../notifications/overdue-email.worker.ts'

type Actor = { accountId: number; role: string }
type Reader = Pick<Pool, 'execute'>
const count = (v: unknown) => Number(v ?? 0)
const activeLoan = "bt.transaction_status IN ('Borrowed','Overdue') AND bt.lost_confirmed_at IS NULL"
const dueToday = `${loanDueInstantSql}>=NOW() AND bt.due_at::date=(NOW() AT TIME ZONE 'Asia/Manila')::date`
const preparing = "r.request_kind='Reservation' AND r.reservation_status='approved' AND r.assigned_physical_copy_id IS NOT NULL"
const esc = (q: string) => '%' + q.replace(/[\\%_]/g, '\\$&') + '%'
const groupSql = `CASE WHEN p.department='SHS' AND p.level IN ('11','12') THEN 'Grade '||p.level
 WHEN p.department='College' AND p.program IN ('BSIT','BSHM','BSTM') THEN p.program
 WHEN p.role IN ('Faculty','Staff','Librarian','Admin') THEN 'Faculty / Staff' ELSE 'Other / Not recorded' END`

function taskSource(f: DeskFilters) {
  if (f.tab === 'holds') return `${academicCte}, tasks AS (
    SELECT r.reservation_id id,p.*,t.title,COALESCE(pc.barcode,'') barcode,r.reserved_at occurred_at,
      'Preparing' status,FALSE lost_reported,NULL::text reminder_status,r.queue_position
    FROM reservations r JOIN people p ON p.user_id=r.user_id
    JOIN titles t ON t.title_id=r.book_title_id LEFT JOIN physical_copies pc ON pc.physical_copy_id=r.assigned_physical_copy_id
    WHERE ${preparing})`
  return `${academicCte}, tasks AS (
    SELECT bt.transaction_id id,p.*,COALESCE(t.title,m.title) title,COALESCE(pc.barcode,'') barcode,bt.due_at occurred_at,
      CASE WHEN ${loanDueInstantSql}<NOW() THEN 'Overdue' ELSE 'Due today' END status,
      EXISTS(SELECT 1 FROM lost_book_reports l WHERE l.transaction_id=bt.transaction_id AND l.report_status IN ('Pending','Reported','Confirmed')) lost_reported,
      CASE WHEN NOT COALESCE(p.email ~* '^[^[:space:]@]+@(ormoc[.]sti[.]edu[.]ph|sti[.]edu)$',FALSE) THEN 'No school email'
        WHEN d.status='Pending' THEN 'Queued' WHEN d.status='Unconfirmed' THEN 'Needs checking' ELSE d.status END reminder_status,
      0::integer queue_position
    FROM borrow_transactions bt JOIN people p ON p.user_id=bt.user_id
    JOIN materials m ON m.material_id=bt.material_id LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
    LEFT JOIN titles t ON t.title_id=pc.title_id
    LEFT JOIN desk_overdue_email_deliveries d ON d.transaction_id=bt.transaction_id AND d.renewal_count=COALESCE(bt.renewal_count,0)
    WHERE ${activeLoan} AND ${f.tab === 'due' ? dueToday : `${loanDueInstantSql}<NOW()`})`
}
function filterSql(f: DeskFilters) {
  return { sql: `(?='' OR department=?) AND (?='' OR program=?) AND (?='' OR level=?)
    AND (?='' OR full_name ILIKE ? OR school_id ILIKE ? OR title ILIKE ? OR barcode ILIKE ?)
    AND (?::bigint IS NULL OR id=?::bigint)`, values: [f.department,f.department,f.program,f.program,f.level,f.level,f.q,...Array(4).fill(esc(f.q)),f.id,f.id] }
}
function publicTask(r: RowDataPacket, tab: string) {
  return { id: count(r.id), kind: tab === 'holds' ? 'Hold' : 'Loan', borrower: String(r.full_name), schoolId: String(r.school_id),
    role: String(r.role), department: String(r.department), program: String(r.program), level: String(r.level), title: String(r.title),
    barcode: String(r.barcode), date: new Date(r.occurred_at).toISOString(), status: String(r.status),
    lostReported: Boolean(r.lost_reported), reminderStatus: r.reminder_status ? String(r.reminder_status) : null }
}
async function taskRows(q: Reader, f: DeskFilters, limit: number, offset: number) {
  const where = filterSql(f)
  const [rows] = await q.execute<RowDataPacket[]>(`${taskSource(f)} SELECT * FROM tasks WHERE ${where.sql}
    ORDER BY ${f.tab === 'holds' ? 'queue_position,' : ''} occurred_at,id LIMIT ? OFFSET ?`, [...where.values,limit,offset])
  return rows.map(r => publicTask(r,f.tab))
}

export function createDeskDashboardService(database: Pool = db, senderReady: (address: string) => unknown = requireVerificationSender) {
  async function authorize(actor: Actor, q: Reader = database) {
    if (!Number.isSafeInteger(actor.accountId) || actor.accountId < 1) throw new HttpError(401,'JWT_REQUIRED','Sign in to open the dashboard.')
    await requireLibraryActor(q,actor.accountId,'library.manage')
  }
  return {
    async overview(actor: Actor, query: Record<string, unknown>) {
      await authorize(actor)
      const f=deskFilters(query)
      const [[metrics],[popular],[groups],[programs]] = await Promise.all([
        database.execute<RowDataPacket[]>(`SELECT
          (SELECT COUNT(*) FROM borrow_transactions bt WHERE ${activeLoan} AND ${dueToday}) due_today,
          (SELECT COUNT(*) FROM borrow_transactions bt WHERE ${activeLoan} AND ${loanDueInstantSql}<NOW()) overdue,
          (SELECT COUNT(*) FROM reservations r WHERE ${preparing}) holds,
          (SELECT COUNT(*) FROM physical_copies WHERE lifecycle_status='Active' AND condition_status='For Repair') repair`),
        database.execute<RowDataPacket[]>(`SELECT t.title_id id,t.title,t.record_type kind,COUNT(*) count
          FROM borrow_transactions bt JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id JOIN titles t ON t.title_id=pc.title_id
          WHERE bt.borrowed_at IS NOT NULL AND bt.borrowed_at>=NOW()-(?::integer * INTERVAL '1 day')
          GROUP BY t.title_id,t.title,t.record_type ORDER BY count DESC,t.title,t.title_id LIMIT 5`,[f.days]),
        database.execute<RowDataPacket[]>(`${academicCte} SELECT ${groupSql} label,COUNT(*) count
          FROM borrow_transactions bt JOIN people p ON p.user_id=bt.user_id WHERE bt.borrowed_at IS NOT NULL
          AND bt.borrowed_at>=NOW()-(?::integer * INTERVAL '1 day') GROUP BY label ORDER BY label`,[f.days]),
        database.execute<RowDataPacket[]>(`${academicCte} SELECT DISTINCT program,department FROM people
          WHERE program<>'' AND department IN ('SHS','College') ORDER BY department,program`),
      ])
      const totals = new Map(groups.map(r=>[String(r.label),count(r.count)]))
      return { generatedAt: new Date().toISOString(), days:f.days,
        counts:{dueToday:count(metrics[0]?.due_today),overdue:count(metrics[0]?.overdue),holds:count(metrics[0]?.holds),repair:count(metrics[0]?.repair)},
        topBooks:popular.map(r=>({id:count(r.id),title:String(r.title),kind:String(r.kind),count:count(r.count)})),
        groups:['Grade 11','Grade 12','BSIT','BSHM','BSTM','Faculty / Staff','Other / Not recorded'].map(label=>({label,count:totals.get(label)??0})),
        programs:programs.map(r=>({department:String(r.department),program:String(r.program)})),
        academicBasis:'Current profile details; enrollment verification is unchanged.',
      }
    },
    async tasks(actor: Actor, query: Record<string,unknown>) {
      await authorize(actor)
      const f=deskFilters(query),where=filterSql(f)
      const [[counts],items]=await Promise.all([
        database.execute<RowDataPacket[]>(`${taskSource(f)} SELECT COUNT(*) total FROM tasks WHERE ${where.sql}`,where.values),
        taskRows(database,f,25,(f.page-1)*25),
      ])
      return {items,total:count(counts[0]?.total),page:f.page,limit:25,generatedAt:new Date().toISOString()}
    },
    async search(actor: Actor, query: Record<string,unknown>) {
      await authorize(actor)
      const {q}=deskFilters(query)
      if(q.length<2) return {people:[],books:[]}
      const [[people],[books]]=await Promise.all([
        database.execute<RowDataPacket[]>(`${academicCte} SELECT full_name,school_id,role,program,level,department FROM people
          WHERE account_status='Active' AND role IN ('Student','Faculty') AND (full_name ILIKE ? OR school_id ILIKE ?)
          ORDER BY full_name,school_id LIMIT 10`,[esc(q),esc(q)]),
        database.execute<RowDataPacket[]>(`SELECT title_id,title,isbn,record_type FROM titles WHERE lifecycle_status='Active' AND record_type='Book'
          AND (title ILIKE ? OR isbn ILIKE ?) ORDER BY title,title_id LIMIT 10`,[esc(q),esc(q)]),
      ])
      return {people:people.map(r=>({name:String(r.full_name),schoolId:String(r.school_id),role:String(r.role),program:String(r.program)})),
        books:books.map(r=>({id:count(r.title_id),title:String(r.title),isbn:r.isbn?String(r.isbn):null,kind:String(r.record_type)}))}
    },
    async reminderPreview(actor: Actor, query: Record<string,unknown>) {
      await authorize(actor)
      const f=deskFilters({...query,tab:'overdue',page:'1'}),where=filterSql(f)
      const [rows]=await database.execute<RowDataPacket[]>(`${taskSource(f)} SELECT * FROM tasks WHERE ${where.sql}
        AND reminder_status IS NULL AND account_status='Active' AND login_status='Active' AND role IN ('Student','Faculty') ORDER BY occurred_at,id LIMIT 100`,where.values)
      return {items:rows.map(r=>publicTask(r,'overdue')),limit:100,channel:'School email',deduplication:'One email per overdue loan or renewal. In-app reminders are tracked separately.'}
    },
    async queueReminders(actor: Actor, body: unknown) {
      await authorize(actor)
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='ids')) throw invalidDeskFilter()
      const ids=(body as {ids?:unknown}).ids
      if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length)throw invalidDeskFilter()
      const q=await database.getConnection()
      try {
        await q.beginTransaction(); await authorize(actor,q)
        const [loans]=await q.execute<RowDataPacket[]>(`SELECT bt.transaction_id,COALESCE(bt.renewal_count,0) renewal_count,u.email
          FROM borrow_transactions bt JOIN users u ON u.user_id=bt.user_id JOIN accounts a ON a.user_id=u.user_id
          WHERE bt.transaction_id=ANY(?::bigint[]) AND ${eligibleEmailLoanSql} ORDER BY bt.transaction_id FOR SHARE OF bt,u,a`,[ids])
        let queued=0
        for(const loan of loans){
          const recipient=String(loan.email??'').trim().toLowerCase()
          if(!schoolEmail(recipient))continue
          // Configuration is checked before the durable write; no browser-supplied recipient is accepted.
          try { senderReady(recipient) } catch { throw new HttpError(503,'REMINDER_EMAIL_UNAVAILABLE','The dedicated email sender is unavailable. Please contact the library administrator.') }
          const [result]=await q.execute<any>(`INSERT INTO desk_overdue_email_deliveries(transaction_id,renewal_count,requested_by_account_id,recipient)
            VALUES (?,?,?,?) ON CONFLICT(transaction_id,renewal_count) DO NOTHING`,[loan.transaction_id,loan.renewal_count,actor.accountId,recipient])
          queued+=count(result.affectedRows)
        }
        await q.execute(`INSERT INTO admin_notifications(event_type,message_title,message_body) VALUES ('Dashboard reminders','Overdue emails queued',?)`,[`${queued} school email reminders queued by library account ${actor.accountId}.`])
        await q.commit();return {queued,skipped:ids.length-queued,channel:'School email'}
      } catch(error){await q.rollback();throw error} finally{q.release()}
    },
    async exportCsv(actor: Actor, query: Record<string,unknown>) {
      const f=deskFilters(query);await authorize(actor)
      async function* stream() {
        const q:PoolConnection=await database.getConnection()
        let finished=false
        try {
          await q.beginTransaction();await q.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
          await authorize(actor,q)
          yield '\uFEFF'+['Library task export','Generated (Asia/Manila)',new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'}),'List',f.tab,'Department',f.department||'All','Program',f.program||'All','Level',f.level||'All','Search',f.q].map(csvCell).join(',')+'\r\n'
          yield ['Borrower','School ID','Role','Department','Level','Program','Title','Copy barcode','Due/request date (Asia/Manila)','Status','Academic basis'].map(csvCell).join(',')+'\r\n'
          for(let offset=0;;offset+=200){
            const rows=await taskRows(q,f,200,offset)
            for(const r of rows)yield [r.borrower,r.schoolId,r.role,r.department,r.level,r.program,r.title,r.barcode,new Date(r.date).toLocaleString('en-PH',{timeZone:'Asia/Manila'}),r.status,'Current profile'].map(csvCell).join(',')+'\r\n'
            if(rows.length<200)break
          }
          await q.commit();finished=true
        } finally{if(!finished)await q.rollback();q.release()}
      }
      return stream()
    },
  }
}
export const deskDashboardService=createDeskDashboardService()
