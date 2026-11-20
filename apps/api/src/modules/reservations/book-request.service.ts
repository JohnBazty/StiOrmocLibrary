import { randomUUID } from 'node:crypto'
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { borrowerEligibility, requireEligible } from '../circulation/desk-circulation.policy.ts'
import { roleReservationLimit } from '../circulation/borrowing-policy.types.ts'
import { createBorrowingPolicyService } from '../circulation/borrowing-policy.service.ts'
import { cancelPendingCounterClaim } from './reservation-claim.repository.ts'
import { positiveId, validateMove } from './reservation.validation.ts'
import { recordRequestEvent, requestEventStatus, requestLabels, requestInstructions } from './book-request-events.ts'
import { loadOpeningHours, pickupDeadline, nextCloseAfter } from './pickup-deadline.ts'
import { notifyLibrarians } from '../notifications/library-alerts.ts'
import { dayCount, readReservationSettings, waitingExpiryCutoff, settingsForRole } from './reservation-settings.service.ts'
import { requireScheduledPickup } from './borrowing-schedule-calendar.ts'

const active = "('pending','approved','ready_for_pickup')"
const fail = (code: string, message: string) => new HttpError(422,code,message)
const object = (v: unknown) => v && typeof v === 'object' ? v as Record<string,unknown> : {}
function requestKey(v: unknown) {
  if (v == null) return null
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(v)) throw fail('REQUEST_KEY_INVALID','The request confirmation ID is invalid.')
  return v
}
type AccountHold = { total: number; loans: number | null; requests: number | null }

export async function accountHold(q: PoolConnection, userId: number): Promise<AccountHold> {
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT
    (SELECT COUNT(*) AS total FROM (
      SELECT DISTINCT COALESCE(pc.title_id,-bt.material_id) AS title_id FROM borrow_transactions bt
        LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
        WHERE bt.user_id=? AND bt.transaction_status IN ('Pending','Borrowed','Overdue') AND to_jsonb(bt)->>'lost_confirmed_at' IS NULL
      UNION SELECT COALESCE(book_title_id,-material_id) FROM reservations WHERE user_id=? AND reservation_status IN ${active}
    ) commitments) AS total,
    (SELECT COUNT(*) FROM (
      SELECT DISTINCT COALESCE(pc.title_id,-bt.material_id) AS title_id FROM borrow_transactions bt
        LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
        WHERE bt.user_id=? AND bt.transaction_status IN ('Pending','Borrowed','Overdue') AND to_jsonb(bt)->>'lost_confirmed_at' IS NULL
    ) loan_titles) AS loans,
    (SELECT COUNT(*) FROM (
      SELECT DISTINCT COALESCE(r.book_title_id,-r.material_id) AS title_id FROM reservations r
      WHERE r.user_id=? AND r.reservation_status IN ${active}
        AND NOT EXISTS (
          SELECT 1 FROM borrow_transactions bt
          LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
          WHERE bt.user_id=r.user_id AND bt.transaction_status IN ('Pending','Borrowed','Overdue') AND to_jsonb(bt)->>'lost_confirmed_at' IS NULL
            AND COALESCE(pc.title_id,-bt.material_id)=COALESCE(r.book_title_id,-r.material_id)
        )
    ) request_titles) AS requests`,[userId,userId,userId,userId])
  const row = rows[0] ?? {}
  const loans = Number(row.loans)
  const requests = Number(row.requests)
  return { total: Number(row.total ?? 0), loans: Number.isFinite(loans) ? loans : null, requests: Number.isFinite(requests) ? requests : null }
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function borrowLimitMessage(limit: number, hold: AccountHold, cartSize = 0) {
  if (hold.loans === null || hold.requests === null) return `The approved borrowing limit is ${limit} active books or requests.`
  const parts = []
  if (hold.loans > 0) parts.push(countLabel(hold.loans, 'active loan', 'active loans'))
  if (hold.requests > 0) parts.push(countLabel(hold.requests, 'book request', 'book requests'))
  const held = parts.length ? parts.join(' and ') : 'no active loans or requests'
  const room = Math.max(0, limit - hold.total)
  const next = hold.loans > 0 && hold.requests > 0
    ? 'Return a borrowed book or cancel a request'
    : hold.loans > 0 ? 'Return a borrowed book' : 'Cancel a request'
  if (hold.total < limit && cartSize > room) {
    return `You have ${held}. This cart has ${countLabel(cartSize, 'book', 'books')}, which would make ${hold.total + cartSize}. The limit is ${limit}. Remove ${cartSize - room === 1 ? 'a book' : 'books'} from the cart${hold.loans > 0 ? ' or return a borrowed book' : ''}, then try again.`
  }
  return `You have ${held}. That fills the limit of ${limit}. ${next}, then try again.`
}

async function commitments(q: PoolConnection, userId: number) {
  return (await accountHold(q, userId)).total
}
export async function lock(q: PoolConnection) {
  // Consistent lock order with attendance, Phase 5 returns and desk receipts.
  await q.execute('SELECT settings_id FROM library_profile_settings WHERE settings_id=1 FOR UPDATE')
}
async function requestRow(q: PoolConnection,id:number) {
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT r.*,t.title,
    (r.pickup_deadline AT TIME ZONE 'Asia/Manila') AS deadline FROM reservations r
    JOIN titles t ON t.title_id=r.book_title_id WHERE r.reservation_id=? FOR UPDATE OF r`,[id])
  if (!rows[0]) throw new HttpError(404,'RESERVATION_NOT_FOUND','The book request does not exist.')
  return rows[0]
}
export async function linkedUser(q: PoolConnection, accountId:number, staff=false) {
  const [rows] = await q.execute<RowDataPacket[]>('SELECT user_id,role,account_status FROM accounts WHERE account_id=? FOR UPDATE',[accountId])
  const a=rows[0]
  if(!a?.user_id || a.account_status!=='Active') throw fail('CIRCULATION_PROFILE_NOT_LINKED','This account must be active and linked to a library profile.')
  if (staff ? !['Librarian','Staff'].includes(a.role) : !['Student','Faculty'].includes(a.role)) throw new HttpError(403,'REQUEST_ROLE_FORBIDDEN','Your role cannot perform this book request action.')
  return Number(a.user_id)
}

/** The caller holds the shared circulation lock. Honor prior reservations first. */
export async function availableCopies(q: PoolConnection, titleId: number, lockRows = true) {
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT pc.* FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id
    WHERE pc.title_id=? AND pc.lifecycle_status='Active' AND t.lifecycle_status='Active' AND t.record_type='Book'
      AND pc.material_id IS NOT NULL AND pc.availability_status='Available' AND pc.condition_status NOT IN ('Lost','Damaged','For Repair')
      AND NOT EXISTS(SELECT 1 FROM borrow_transactions bt WHERE (bt.physical_copy_id=pc.physical_copy_id OR bt.material_id=pc.material_id) AND bt.transaction_status IN ('Pending','Borrowed','Overdue') AND to_jsonb(bt)->>'lost_confirmed_at' IS NULL)
      AND NOT EXISTS(SELECT 1 FROM in_library_uses iu WHERE iu.physical_copy_id=pc.physical_copy_id AND iu.ended_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.assigned_physical_copy_id=pc.physical_copy_id AND r.reservation_status IN ${active})
    ORDER BY pc.physical_copy_id ${lockRows ? 'FOR UPDATE OF pc,t' : ''}`, [titleId])
  return rows
}

/** Staff-only note on why a waiting request was passed over. Written only when the reason changes, so repeated passes cause no writes. */
const skipRequest = (q: PoolConnection, r: RowDataPacket, reason: string, now: Date) =>
  q.execute('UPDATE reservations SET last_skip_reason=?,last_skipped_at=? WHERE reservation_id=? AND (last_skip_reason IS DISTINCT FROM ? OR last_skipped_at IS NULL)',[reason.slice(0,200),now,r.reservation_id,reason.slice(0,200)])

/** Allocate by title identity and ordered waiting position; never automatically ready. */
export async function allocateWaitingRequests(q: PoolConnection,titleId:number,now=new Date()) {
  const [copies] = await q.execute<RowDataPacket[]>(`SELECT pc.*,t.title FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id
    WHERE pc.title_id=? AND pc.lifecycle_status='Active' AND t.lifecycle_status='Active' AND t.record_type='Book'
      AND pc.material_id IS NOT NULL AND pc.availability_status='Available' AND pc.condition_status NOT IN ('Lost','Damaged','For Repair')
      AND NOT EXISTS(SELECT 1 FROM borrow_transactions bt WHERE (bt.physical_copy_id=pc.physical_copy_id OR bt.material_id=pc.material_id) AND bt.transaction_status IN ('Pending','Borrowed','Overdue') AND to_jsonb(bt)->>'lost_confirmed_at' IS NULL)
      AND NOT EXISTS(SELECT 1 FROM in_library_uses iu WHERE iu.physical_copy_id=pc.physical_copy_id AND iu.ended_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.assigned_physical_copy_id=pc.physical_copy_id AND r.reservation_status IN ${active})
    ORDER BY pc.physical_copy_id FOR UPDATE OF pc,t`,[titleId])
  if(!copies.length) return []
  const [waiting] = await q.execute<RowDataPacket[]>(`SELECT * FROM reservations WHERE book_title_id=?
    AND request_kind='Reservation' AND reservation_status IN ('pending','approved') AND assigned_physical_copy_id IS NULL
    ORDER BY queue_position,reserved_at,reservation_id FOR UPDATE`,[titleId])
  const assigned:number[]=[]
  for(const r of waiting) {
    if(!copies.length) break
    const eligible=await borrowerEligibility(q,Number(r.user_id),now,'Online')
    if(eligible.blockers.length) { await skipRequest(q,r,eligible.blockers[0],now); continue }
    if(eligible.limit!==null && await commitments(q,Number(r.user_id))>eligible.limit) { await skipRequest(q,r,'Over borrowing limit',now); continue }
    const [rules]=await q.execute<RowDataPacket[]>('SELECT is_borrowable FROM borrowing_policy_material_rules WHERE borrowing_policy_version_id=? AND material_type=\'Book\'',[eligible.policy.borrowing_policy_version_id])
    if(!rules[0]?.is_borrowable) { await skipRequest(q,r,'Book not borrowable under policy',now); continue }
    const copy=copies.shift()!
    await q.execute(`UPDATE reservations SET reservation_status='approved',accession_id=?,assigned_physical_copy_id=?,
      preparation_started_at=?,pickup_deadline=NULL,last_skip_reason=NULL,last_skipped_at=NULL,updated_at=NOW() WHERE reservation_id=?`,[copy.material_id,copy.physical_copy_id,now,r.reservation_id])
    await q.execute("UPDATE physical_copies SET availability_status='Reserved',row_version=row_version+1,updated_at=NOW() WHERE physical_copy_id=?",[copy.physical_copy_id])
    await q.execute("UPDATE materials SET availability_status='Reserved',updated_at=NOW() WHERE material_id=?",[copy.material_id])
    await recordRequestEvent(q,Number(r.reservation_id),'preparing',now)
    await q.execute(`INSERT INTO admin_notifications(event_type,actor_user_id,reservation_id,book_title_id,message_title,message_body)
      VALUES ('reservation_preparation_required',?,?,?,'Prepare requested copy',?)`,[r.user_id,r.reservation_id,titleId,
      `Prepare ${copy.title}, barcode ${copy.barcode}, at ${copy.shelf_location ?? 'location not recorded'}. Mark ready after pulling the copy.`])
    assigned.push(Number(r.reservation_id))
  }
  return assigned
}

export async function releaseBookRequest(q: PoolConnection,r:RowDataPacket,status:'cancelled'|'expired',actor:number|null,now:Date) {
  if(!['pending','approved','ready_for_pickup'].includes(String(r.reservation_status))) return false
  // Keep the assignment and fixed deadline as history; terminal states no longer own the copy.
  await q.execute('UPDATE reservations SET reservation_status=?,last_skip_reason=NULL,last_skipped_at=NULL,updated_at=NOW() WHERE reservation_id=?',[status,r.reservation_id])
  await cancelPendingCounterClaim(q,Number(r.reservation_id),actor,status==='expired'?(r.request_kind==='CartHandover'?'Cart handover expired at closing.':r.assigned_physical_copy_id?'Pickup deadline expired.':'Waiting-list limit passed.'):'Book request cancelled.')
  if(r.assigned_physical_copy_id) {
    await q.execute(`UPDATE physical_copies SET availability_status=CASE WHEN lifecycle_status='Active' AND condition_status NOT IN ('Lost','Damaged','For Repair') THEN 'Available' ELSE 'Unavailable' END,
      row_version=row_version+1,updated_at=NOW() WHERE physical_copy_id=? AND availability_status='Reserved'`,[r.assigned_physical_copy_id])
    await q.execute(`UPDATE materials m SET availability_status=pc.availability_status,updated_at=NOW()
      FROM physical_copies pc WHERE pc.physical_copy_id=? AND m.material_id=pc.material_id`,[r.assigned_physical_copy_id])
  }
  await q.execute(`UPDATE reservations SET queue_position=queue_position-1,updated_at=NOW()
    WHERE book_title_id=? AND request_kind='Reservation' AND reservation_status IN ${active} AND queue_position>? AND ?='Reservation'`,[r.book_title_id,r.queue_position,r.request_kind])
  await recordRequestEvent(q,Number(r.reservation_id),status,now)
  await allocateWaitingRequests(q,Number(r.book_title_id),now)
  return true
}

/** The caller holds the shared circulation lock. A lost copy frees its holds without costing borrowers their place. */
export async function releaseLostCopyHolds(q: PoolConnection,physicalCopyId:number,actor:number|null,now=new Date(),cause:'lost'|'unusable'='lost') {
  const lost=cause==='lost',tag=lost?'copy-lost':'copy-unusable'
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT * FROM reservations WHERE assigned_physical_copy_id = ?
    AND reservation_status IN ${active} ORDER BY reservation_id FOR UPDATE`,[physicalCopyId])
  for(const r of rows) {
    if(r.request_kind==='CartHandover') { await releaseBookRequest(q,r,'cancelled',actor,now); continue }
    await q.execute(`UPDATE reservations SET reservation_status='pending',accession_id=NULL,assigned_physical_copy_id=NULL,
      preparation_started_at=NULL,ready_at=NULL,pickup_deadline=NULL,updated_at=NOW() WHERE reservation_id=?`,[r.reservation_id])
    await cancelPendingCounterClaim(q,Number(r.reservation_id),actor,lost?'Assigned copy reported lost.':'Assigned copy damaged or under repair.')
    // Direct notice: request events are unique per status, so 'waiting' was already recorded at creation.
    await q.execute(`INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,
      action_path,priority,dedupe_key,scheduled_for,delivered_at)
      SELECT r.user_id,?,COALESCE(t.title,'Your requested book')||': '||?||' You keep your place on the waiting list, and staff will prepare another copy when one is free.',
        'Reservation Arrival','Reservation',r.reservation_id,
        CASE WHEN u.user_role='Faculty' THEN '/faculty/reservations' ELSE '/student/reservations' END,'Important',?,NOW(),NOW()
      FROM reservations r JOIN users u ON u.user_id=r.user_id LEFT JOIN titles t ON t.title_id=r.book_title_id
      WHERE r.reservation_id=? ON CONFLICT(user_id,dedupe_key) DO NOTHING`,
      [lost?'Held copy reported missing':'Held copy needs repair',lost?'the copy set aside for you was reported missing.':'the copy set aside for you is damaged or being repaired.',
        `book-request:${r.reservation_id}:${tag}:${physicalCopyId}`,r.reservation_id])
    // Supersedes the earlier "Prepare requested copy" notice that pointed at the lost copy.
    await notifyLibrarians(q,{key:`reservation:${r.reservation_id}:${tag}:${physicalCopyId}`,title:lost?'Held copy reported lost':'Held copy is damaged or under repair',
      body:`request ${r.reservation_id} is back on the waiting list. Do not prepare ${lost?'the lost':'this'} copy; the next free copy will be assigned.`,
      sourceId:Number(r.reservation_id),personUserId:Number(r.user_id),path:'/librarian/reservations?status=active',type:'Reservation Arrival'})
  }
  const titles=new Set(rows.filter(r=>r.request_kind!=='CartHandover'&&r.book_title_id).map(r=>Number(r.book_title_id)))
  for(const titleId of titles) await allocateWaitingRequests(q,titleId,now)
  return rows.length
}

/** Waiting-list limit (SPEC R4). The caller holds the shared circulation lock, so Mark ready and allocation cannot race this. */
async function expireWaiting(q: PoolConnection,now:Date,limit:number) {
  // Students and faculty each have their own waiting-list limit (revisions 2026-11-20).
  const settings=await readReservationSettings(q)
  let expired=0
  for(const role of ['Student','Faculty'] as const) expired+=await expireWaitingFor(q,now,limit,role,waitingExpiryCutoff(now,settingsForRole(settings,role)))
  return expired
}
async function expireWaitingFor(q: PoolConnection,now:Date,limit:number,role:'Student'|'Faculty',cutoff:Date|null) {
  if(!cutoff) return 0
  const [rows]=await q.execute<RowDataPacket[]>(`SELECT * FROM reservations WHERE request_kind='Reservation' AND reservation_status IN ('pending','approved')
    AND assigned_physical_copy_id IS NULL AND reserved_at<=(?::timestamptz AT TIME ZONE 'Asia/Manila')
    AND (SELECT u.user_role FROM users u WHERE u.user_id=reservations.user_id) ${role==='Faculty'?"='Faculty'":"IS DISTINCT FROM 'Faculty'"}
    -- A copy freed since the last allocation run goes to this queue first; advanceWaiting assigns it.
    AND NOT EXISTS (SELECT 1 FROM physical_copies pc WHERE pc.title_id=reservations.book_title_id AND pc.lifecycle_status='Active'
      AND pc.availability_status='Available' AND pc.condition_status NOT IN ('Lost','Damaged','For Repair'))
    ORDER BY reserved_at,reservation_id LIMIT ? FOR UPDATE`,[cutoff,limit])
  let expired=0
  for(const candidate of rows) {
    // An earlier release in this run may have given it a copy or moved its queue position.
    const [fresh]=await q.execute<RowDataPacket[]>('SELECT * FROM reservations WHERE reservation_id=? FOR UPDATE',[candidate.reservation_id])
    const r=fresh[0]
    if(!r || r.request_kind!=='Reservation' || !['pending','approved'].includes(String(r.reservation_status)) || r.assigned_physical_copy_id) continue
    if(await releaseBookRequest(q,r,'expired',null,now)) expired++
  }
  return expired
}

export function createBookRequestService(database:Pool=db,clock=()=>new Date()) {
  async function transaction<T>(run:(q:PoolConnection)=>Promise<T>) {
    const q=await database.getConnection()
    try { await q.beginTransaction(); await lock(q); const result=await run(q); await q.commit(); return result }
    catch(e) { await q.rollback(); throw e } finally { q.release() }
  }
  async function submit(q:PoolConnection,userId:number,titleId:number,key:string|null,kind:'Reservation'|'CartHandover'='Reservation') {
    const now=clock()
    if(key) {
      const [existing]=await q.execute<RowDataPacket[]>('SELECT reservation_id,book_title_id,request_kind FROM reservations WHERE user_id=? AND client_request_id=?',[userId,key])
      if(existing[0]) {
        if(Number(existing[0].book_title_id)!==titleId || existing[0].request_kind!==kind) throw new HttpError(409,'REQUEST_KEY_REUSED','This confirmation ID belongs to a different book or action.')
        return {...await requestRow(q,Number(existing[0].reservation_id)),replayed:true}
      }
    }
    const eligible=await borrowerEligibility(q,userId,now,'Online');requireEligible(eligible)
    if(!['Student','Faculty'].includes(String(eligible.user?.user_role))) throw new HttpError(403,'REQUEST_ROLE_FORBIDDEN','Only Student and Faculty accounts can request books online.')
    const [titles]=await q.execute<RowDataPacket[]>(`SELECT t.*,MIN(pc.material_id) AS material_id FROM titles t
      JOIN physical_copies pc ON pc.title_id=t.title_id WHERE t.title_id=? AND t.lifecycle_status='Active'
      AND pc.lifecycle_status='Active' AND pc.material_id IS NOT NULL GROUP BY t.title_id`,[titleId])
    if(!titles[0]) throw fail('BOOK_RESERVATION_UNAVAILABLE','This title has no active physical copy for requests.')
    if(titles[0].record_type!=='Book') throw fail('RESEARCH_VIEW_ONLY','Research and thesis records cannot be borrowed.')
    const [rules]=await q.execute<RowDataPacket[]>('SELECT is_borrowable FROM borrowing_policy_material_rules WHERE borrowing_policy_version_id=? AND material_type=\'Book\'',[eligible.policy.borrowing_policy_version_id])
    if(!rules[0]?.is_borrowable) throw fail('RESEARCH_VIEW_ONLY','The approved policy does not allow take-home borrowing of this material.')
    const [duplicates]=await q.execute<RowDataPacket[]>(`SELECT reservation_id FROM reservations WHERE user_id=? AND book_title_id=? AND reservation_status IN ${active}
      UNION ALL SELECT bt.transaction_id FROM borrow_transactions bt JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
      WHERE bt.user_id=? AND pc.title_id=? AND bt.transaction_status IN ('Pending','Borrowed','Overdue') AND to_jsonb(bt)->>'lost_confirmed_at' IS NULL`,[userId,titleId,userId,titleId])
    if(duplicates.length) throw fail('BOOK_ALREADY_IN_ACCOUNT','You already have this title in a book request or active loan.')
    const hold=await accountHold(q,userId)
    if(eligible.limit!==null && hold.total>=eligible.limit) throw fail('STUDENT_BORROW_LIMIT_REACHED',borrowLimitMessage(eligible.limit,hold))
    const policy=await createBorrowingPolicyService(database,clock).resolveActive(q,now)
    const reservationLimit=roleReservationLimit(policy,String(eligible.user?.user_role))
    const [counts]=await q.execute<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM reservations WHERE user_id=? AND request_kind='Reservation' AND reservation_status IN ${active}`,[userId])
    if(kind==='Reservation' && reservationLimit!==null && Number(counts[0]?.n)>=reservationLimit) throw fail('STUDENT_BORROW_LIMIT_REACHED',`The approved reservation limit is ${reservationLimit}.`)
    if(kind==='Reservation') {
      const [copyTotals]=await q.execute<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM physical_copies WHERE title_id=? AND lifecycle_status='Active'`,[titleId])
      const [waitTotals]=await q.execute<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM reservations WHERE book_title_id=? AND request_kind='Reservation' AND reservation_status IN ${active}`,[titleId])
      const copyCap=Number(copyTotals[0]?.n ?? 0)
      if(copyCap<=0 || Number(waitTotals[0]?.n ?? 0)>=copyCap) {
        throw fail('WAITLIST_FULL', copyCap<=0
          ? 'This title has no active copy for a waiting list.'
          : `The waiting list for this title is full (${copyCap} ${copyCap===1?'copy':'copies'}).`)
      }
    }
    await allocateWaitingRequests(q,titleId,now)
    const copies=await availableCopies(q,titleId)
    if(kind==='Reservation' && copies.length) throw fail('BOOK_AVAILABLE_USE_CART','This book has an available copy. Add it to your cart instead of reserving it.')
    if(kind==='CartHandover' && !copies.length) throw fail('BOOK_NO_LONGER_AVAILABLE',`${titles[0].title} has no available copy now. Your cart has been kept. Remove it from the cart and use Reserve book in the catalog to join its waiting list.`)
    // A cart handover is held until the next closing time, then expires.
    let cartDeadline:Date|null=null
    if(kind==='CartHandover') {const hoursOpen=await loadOpeningHours(q,now);cartDeadline=nextCloseAfter(now,hoursOpen.schedule,hoursOpen.closedDates)}
    const [queue]=await q.execute<RowDataPacket[]>(`SELECT COALESCE(MAX(queue_position),0)+1 AS position FROM reservations WHERE book_title_id=? AND request_kind='Reservation' AND reservation_status IN ${active}`,[titleId])
    const [insert]=await q.execute<ResultSetHeader>(`INSERT INTO reservations(user_id,material_id,book_title_id,borrowing_policy_version_id,
      queue_position,reservation_status,reserved_at,client_request_id,request_kind,accession_id,assigned_physical_copy_id,preparation_started_at,pickup_deadline)
      VALUES (?,?,?,?,?,?,(?::timestamptz AT TIME ZONE 'Asia/Manila'),?,?,?,?,?,(?::timestamptz AT TIME ZONE 'Asia/Manila'))`,
      [userId,titles[0].material_id,titleId,policy.versionId,kind==='Reservation'?queue[0].position:1,kind==='Reservation'?'pending':'approved',now,key,kind,kind==='CartHandover'?copies[0].material_id:null,kind==='CartHandover'?copies[0].physical_copy_id:null,kind==='CartHandover'?now:null,cartDeadline])
    const id=Number(insert.insertId)
    await recordRequestEvent(q,id,'received',now)
    if(kind==='CartHandover') {
      await q.execute("UPDATE physical_copies SET availability_status='Reserved',row_version=row_version+1,updated_at=NOW() WHERE physical_copy_id=?",[copies[0].physical_copy_id])
      await q.execute("UPDATE materials SET availability_status='Reserved',updated_at=NOW() WHERE material_id=?",[copies[0].material_id])
    }
    const r=await requestRow(q,id)
    if(kind==='Reservation') await recordRequestEvent(q,id,'waiting',now)
    return r
  }
  function result(r:RowDataPacket|Record<string,any>) {
    const state=requestEventStatus(String(r.reservation_status),Boolean(r.assigned_physical_copy_id))
    return {reservationId:Number(r.reservation_id),userId:Number(r.user_id),materialId:Number(r.material_id),
      requestKind:r.request_kind,queuePosition:r.request_kind==='CartHandover'?null:Number(r.queue_position),status:String(r.reservation_status),requestStatus:state,statusLabel:r.request_kind==='CartHandover'&&state==='preparing'?'Awaiting handover':requestLabels[state],
      pickupDeadline:r.deadline??null,replayed:r.replayed??false,instructions:r.request_kind==='CartHandover'&&state==='preparing'?'Bring these books to the library desk. Staff will confirm handover before your loan starts.':requestInstructions(state,r.deadline?new Date(r.deadline):null)}
  }
  return {
    async createForAccount(accountId:unknown,body:unknown) {
      const input=object(body)
      return transaction(async q=> {
        const userId=await linkedUser(q,positiveId(accountId,'accountId'))
        let titleId=input.bookTitleId??input.book_title_id
        if(titleId==null) {const [r]=await q.execute<RowDataPacket[]>('SELECT title_id FROM physical_copies WHERE material_id=?',[positiveId(input.materialId??input.material_id,'materialId')]);titleId=r[0]?.title_id}
        return result(await submit(q,userId,positiveId(titleId,'bookTitleId'),requestKey(input.requestId)))
      })
    },
    async create(userId:unknown,body:unknown) {
      const input=object(body)
      return transaction(async q=> {
        const [r]=await q.execute<RowDataPacket[]>('SELECT title_id FROM physical_copies WHERE material_id=?',[positiveId(input.materialId??input.material_id,'materialId')])
        return result(await submit(q,positiveId(userId,'userId'),positiveId(r[0]?.title_id,'bookTitleId'),requestKey(input.requestId)))
      })
    },
    async submitCart(accountId:unknown,titleIds:number[],keyValue:unknown) {
      const key=requestKey(keyValue)??randomUUID()
      return transaction(async q=> {
        const userId=await linkedUser(q,positiveId(accountId,'accountId'))
        const sorted=[...titleIds].sort((a,b)=>a-b)
        const eligible=await borrowerEligibility(q,userId,clock(),'Online');requireEligible(eligible)
        if(eligible.limit!==null) {
          const hold=await accountHold(q,userId)
          if(hold.total+sorted.length>eligible.limit) throw fail('STUDENT_BORROW_LIMIT_REACHED',borrowLimitMessage(eligible.limit,hold,sorted.length))
        }
        const [prior]=await q.execute<RowDataPacket[]>(`SELECT book_title_id FROM reservations
          WHERE user_id=? AND LEFT(client_request_id,?)=? ORDER BY book_title_id`,[userId,key.length+1,`${key}_`])
        if(prior.length && JSON.stringify(prior.map(r=>Number(r.book_title_id)))!==JSON.stringify(sorted))
          throw new HttpError(409,'REQUEST_KEY_REUSED','This confirmation ID belongs to a different selection of books.')
        const items=[]
        for(const titleId of sorted) {
          const r=await submit(q,userId,titleId,`${key}_${titleId}`,'CartHandover')
          const [bt]=await q.execute<RowDataPacket[]>('SELECT transaction_id FROM borrow_transactions WHERE reservation_id=?',[r.reservation_id])
          items.push({...result(r),transactionId:bt[0]?.transaction_id??null,titleId,title:r.title,physicalCopyId:r.assigned_physical_copy_id??null})
        }
        return {requestGroupId:key,status:'pending_claim',instructions:'Sent to the library desk. Bring the selected books to staff for handover. Your loan starts only when staff confirm.',items}
      })
    },
    async cancel(accountId:unknown,id:unknown,staff=false) {
      return transaction(async q=> {
        const userId=await linkedUser(q,positiveId(accountId,'accountId'),staff)
        const r=await requestRow(q,positiveId(id,'reservationId'))
        if(!staff && Number(r.user_id)!==userId) throw new HttpError(404,'RESERVATION_NOT_FOUND','The book request does not exist.')
        if(r.reservation_status==='cancelled') return result(r)
        if(!['pending','approved','ready_for_pickup'].includes(r.reservation_status)) throw fail('RESERVATION_CANCELLATION_INVALID','Only an active request can be cancelled.')
        await releaseBookRequest(q,r,'cancelled',userId,clock())
        return result(await requestRow(q,Number(r.reservation_id)))
      })
    },
    async adjustStatus(accountId:unknown,id:unknown,body:unknown) {
      const input=object(body)
      if(input.status==='cancelled') return this.cancel(accountId,id,true)
      if(!['approved','ready_for_pickup'].includes(String(input.status))) throw fail('RESERVATION_STATUS_INVALID','Choose Mark ready or Cancel request.')
      if(input.pickupDeadline) throw fail('PICKUP_DEADLINE_FIXED',`Pickup deadlines are fixed at ${dayCount((await readReservationSettings(database)).pickupWindowDays)} from Mark ready.`)
      return transaction(async q=> {
        await linkedUser(q,positiveId(accountId,'accountId'),true)
        let r=await requestRow(q,positiveId(id,'reservationId'))
        const scheduledDeadline=await requireScheduledPickup(q,r,clock())
        if(r.request_kind==='CartHandover') throw fail('CART_HANDOVER_USE_DESK','This cart is awaiting handover. Open Borrow & return and choose Start checkout.')
        if(r.reservation_status==='ready_for_pickup') return {...result(r),replayed:true}
        if(!['pending','approved'].includes(r.reservation_status)) throw fail('RESERVATION_TRANSITION_INVALID','This request can no longer be prepared.')
        const [conflictingLoans] = await q.execute<RowDataPacket[]>(`SELECT bt.transaction_id FROM borrow_transactions bt
          JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id OR (bt.physical_copy_id IS NULL AND pc.material_id=bt.material_id)
          WHERE bt.user_id=? AND pc.title_id=? AND bt.transaction_status IN ('Pending','Borrowed','Overdue') AND to_jsonb(bt)->>'lost_confirmed_at' IS NULL
          AND bt.reservation_id IS DISTINCT FROM ? LIMIT 1`,[r.user_id,r.book_title_id,r.reservation_id])
        if(conflictingLoans.length) throw fail('BOOK_ALREADY_IN_ACCOUNT','The borrower already has an active loan or checkout for this title.')
        await allocateWaitingRequests(q,Number(r.book_title_id),clock());r=await requestRow(q,Number(r.reservation_id))
        if(!r.assigned_physical_copy_id) throw fail('NO_AVAILABLE_ACCESSION','This request is waiting for an eligible copy or borrower. Review the account and waitlist.')
        const eligible=await borrowerEligibility(q,Number(r.user_id),clock(),'Online');requireEligible(eligible)
        const [rules]=await q.execute<RowDataPacket[]>('SELECT is_borrowable FROM borrowing_policy_material_rules WHERE borrowing_policy_version_id=? AND material_type=\'Book\'',[eligible.policy.borrowing_policy_version_id])
        if(!rules[0]?.is_borrowable) throw fail('RESEARCH_VIEW_ONLY','The approved policy does not allow take-home borrowing of this material.')
        if(eligible.limit!==null && await commitments(q,Number(r.user_id))>eligible.limit) throw fail('STUDENT_BORROW_LIMIT_REACHED','The borrower exceeds the current borrowing limit.')
        const [copies]=await q.execute<RowDataPacket[]>(`SELECT pc.* FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id
          WHERE pc.physical_copy_id=? AND pc.lifecycle_status='Active' AND t.lifecycle_status='Active'
          AND pc.availability_status='Reserved' AND pc.condition_status NOT IN ('Lost','Damaged','For Repair') FOR UPDATE OF pc,t`,[r.assigned_physical_copy_id])
        if(!copies.length) throw fail('DESK_COPY_BLOCKED','The assigned copy is unavailable. Review its physical condition before marking ready.')
        if(input.status==='approved') return result(r) // Compatible legacy Prepare action, never another approval gate.
        // One settings read: the stored deadline and the notice wording use the same window.
        const now=clock(),settings=await readReservationSettings(q),hoursOpen=await loadOpeningHours(q,now,settings.pickupWindowDays)
        const deadline=scheduledDeadline??pickupDeadline(now,hoursOpen.schedule,hoursOpen.closedDates,settings.pickupWindowDays)
        await q.execute(`UPDATE reservations SET reservation_status='ready_for_pickup',ready_at=?,
          pickup_deadline=(?::timestamptz AT TIME ZONE 'Asia/Manila'),updated_at=NOW() WHERE reservation_id=?`,[now,deadline,r.reservation_id])
        await recordRequestEvent(q,Number(r.reservation_id),'ready_for_pickup',now,settings.pickupWindowDays)
        return result(await requestRow(q,Number(r.reservation_id)))
      })
    },
    async swapCandidates(accountId:unknown,id:unknown) {
      return transaction(async q=> {
        await linkedUser(q,positiveId(accountId,'accountId'),true)
        const r=await requestRow(q,positiveId(id,'reservationId'))
        if(r.request_kind!=='Reservation' || !['approved','ready_for_pickup'].includes(r.reservation_status) || !r.assigned_physical_copy_id) throw fail('SWAP_NOT_ALLOWED','Only a request with a prepared copy can have its copy swapped.')
        const copies=await availableCopies(q,Number(r.book_title_id),false)
        return copies.map(c=>({physicalCopyId:Number(c.physical_copy_id),barcode:c.barcode??null,accessionNumber:c.accession_number??null,shelfLocation:c.shelf_location??null}))
      })
    },
    async swapCopy(accountId:unknown,id:unknown,body:unknown) {
      const copyId=positiveId(object(body).physicalCopyId,'physicalCopyId')
      return transaction(async q=> {
        const actor=await linkedUser(q,positiveId(accountId,'accountId'),true)
        const r=await requestRow(q,positiveId(id,'reservationId'))
        if(r.request_kind!=='Reservation' || !['approved','ready_for_pickup'].includes(r.reservation_status) || !r.assigned_physical_copy_id) throw fail('SWAP_NOT_ALLOWED','Only a request with a prepared copy can have its copy swapped.')
        if(copyId===Number(r.assigned_physical_copy_id)) throw fail('SWAP_COPY_SAME','The request already holds this copy.')
        // Lock both copies in id order so two opposite swaps cannot deadlock.
        const [locked]=await q.execute<RowDataPacket[]>('SELECT physical_copy_id,title_id,material_id FROM physical_copies WHERE physical_copy_id IN (?,?) ORDER BY physical_copy_id FOR UPDATE',[r.assigned_physical_copy_id,copyId])
        const target=locked.find(c=>Number(c.physical_copy_id)===copyId)
        if(!target) throw new HttpError(404,'PHYSICAL_COPY_NOT_FOUND','The copy does not exist.')
        if(Number(target.title_id)!==Number(r.book_title_id)) throw fail('SWAP_COPY_WRONG_TITLE','The copy belongs to a different title.')
        const [others]=await q.execute<RowDataPacket[]>(`SELECT reservation_id FROM reservations WHERE assigned_physical_copy_id=? AND reservation_status IN ${active} AND reservation_id<>?`,[copyId,r.reservation_id])
        if(others.length) throw new HttpError(409,'SWAP_COPY_HELD','Another request already holds this copy.')
        if(!(await availableCopies(q,Number(r.book_title_id))).some(c=>Number(c.physical_copy_id)===copyId)) throw fail('SWAP_COPY_UNAVAILABLE','The copy is not available and in usable condition.')
        await q.execute('UPDATE reservations SET accession_id=?,assigned_physical_copy_id=?,updated_at=NOW() WHERE reservation_id=?',[target.material_id,copyId,r.reservation_id])
        await q.execute("UPDATE borrow_transactions SET physical_copy_id=?,material_id=?,updated_at=NOW() WHERE reservation_id=? AND transaction_status='Pending'",[copyId,target.material_id,r.reservation_id])
        await q.execute(`UPDATE physical_copies SET availability_status=CASE WHEN lifecycle_status='Active' AND condition_status NOT IN ('Lost','Damaged','For Repair') THEN 'Available' ELSE 'Unavailable' END,
          row_version=row_version+1,updated_at=NOW() WHERE physical_copy_id=? AND availability_status='Reserved'`,[r.assigned_physical_copy_id])
        await q.execute("UPDATE physical_copies SET availability_status='Reserved',row_version=row_version+1,updated_at=NOW() WHERE physical_copy_id=?",[copyId])
        await q.execute(`UPDATE materials m SET availability_status=pc.availability_status,updated_at=NOW()
          FROM physical_copies pc WHERE pc.physical_copy_id IN (?,?) AND m.material_id=pc.material_id`,[r.assigned_physical_copy_id,copyId])
        await q.execute("INSERT INTO reservation_audit_events(reservation_id,action,from_copy_id,to_copy_id,actor_user_id) VALUES (?,'swap_copy',?,?,?)",[r.reservation_id,r.assigned_physical_copy_id,copyId,actor])
        return result(await requestRow(q,Number(r.reservation_id)))
      })
    },
    async moveInQueue(accountId:unknown,id:unknown,body:unknown) {
      const {direction,reason}=validateMove(body)
      return transaction(async q=> {
        const actor=await linkedUser(q,positiveId(accountId,'accountId'),true)
        const r=await requestRow(q,positiveId(id,'reservationId'))
        const [queue]=await q.execute<RowDataPacket[]>(`SELECT reservation_id,queue_position,reservation_status,assigned_physical_copy_id FROM reservations
          WHERE book_title_id=? AND request_kind='Reservation' AND reservation_status IN ${active} ORDER BY queue_position,reserved_at,reservation_id FOR UPDATE`,[r.book_title_id])
        const from=queue.findIndex(x=>Number(x.reservation_id)===Number(r.reservation_id))
        if(from<0 || queue[from].reservation_status!=='pending' || queue[from].assigned_physical_copy_id) throw fail('QUEUE_MOVE_NOT_PENDING','Only a waiting request can be moved.')
        const to=direction==='up'?from-1:from+1
        if(to<0 || to>=queue.length) throw fail('QUEUE_MOVE_NOOP','The request is already at that end of the queue.')
        if(queue[to].assigned_physical_copy_id) throw fail('QUEUE_MOVE_ABOVE_ASSIGNED','A request cannot swap places with one that already has a copy.')
        const order=[...queue];[order[from],order[to]]=[order[to],order[from]]
        for(const [index,row] of order.entries()) if(Number(row.queue_position)!==index+1)
          await q.execute('UPDATE reservations SET queue_position=?,updated_at=NOW() WHERE reservation_id=?',[index+1,row.reservation_id])
        await q.execute("INSERT INTO reservation_audit_events(reservation_id,action,from_position,to_position,reason,actor_user_id) VALUES (?,'move',?,?,?,?)",[r.reservation_id,from+1,to+1,reason,actor])
        return {reservationId:Number(r.reservation_id),fromPosition:from+1,toPosition:to+1}
      })
    },
    async expire(now:Date,batchSize=100) {
      const limit=Math.min(500,Math.max(1,batchSize))
      return transaction(async q=> {
        const [rows]=await q.execute<RowDataPacket[]>(`SELECT r.* FROM reservations r WHERE to_jsonb(r)->>'scheduled_pickup_date' IS NULL AND (((reservation_status='ready_for_pickup' OR (request_kind='CartHandover' AND reservation_status='approved'))
            AND pickup_deadline<=(?::timestamptz AT TIME ZONE 'Asia/Manila'))
          -- Carts made before cart deadlines existed have none; release them after 24 hours so their copy is not held forever.
          OR (request_kind='CartHandover' AND reservation_status='approved' AND pickup_deadline IS NULL
            AND reserved_at<=(?::timestamptz AT TIME ZONE 'Asia/Manila')-INTERVAL '24 hours')
          ) ORDER BY pickup_deadline NULLS LAST,reservation_id LIMIT ? FOR UPDATE`,[now,now,limit])
        for(const r of rows) await releaseBookRequest(q,r,'expired',null,now)
        return {expiredCount:rows.length+await expireWaiting(q,now,limit),releasedAccessions:rows.filter(r=>r.accession_id).map(r=>Number(r.accession_id))}
      })
    },
    async advanceWaiting(now:Date) {
      return transaction(async q=> {
        const [titles]=await q.execute<RowDataPacket[]>(`SELECT DISTINCT r.book_title_id FROM reservations r WHERE r.reservation_status IN ('pending','approved')
          AND r.assigned_physical_copy_id IS NULL AND r.book_title_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM physical_copies pc WHERE pc.title_id=r.book_title_id AND pc.lifecycle_status='Active'
            AND pc.availability_status='Available' AND pc.condition_status NOT IN ('Lost','Damaged','For Repair'))
          ORDER BY r.book_title_id LIMIT 100`)
        let assigned=0;for(const t of titles) assigned+=(await allocateWaitingRequests(q,Number(t.book_title_id),now)).length
        return {assigned}
      })
    },
  }
}
