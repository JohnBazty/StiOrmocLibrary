import { randomUUID } from 'node:crypto'
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { borrowerEligibility, requireEligible } from '../circulation/desk-circulation.policy.ts'
import { roleReservationLimit } from '../circulation/borrowing-policy.types.ts'
import { createBorrowingPolicyService } from '../circulation/borrowing-policy.service.ts'
import { cancelPendingCounterClaim } from './reservation-claim.repository.ts'
import { positiveId } from './reservation.validation.ts'
import { recordRequestEvent, requestEventStatus, requestLabels, requestInstructions } from './book-request-events.ts'

const active = "('pending','approved','ready_for_pickup')"
const fail = (code: string, message: string) => new HttpError(422,code,message)
const object = (v: unknown) => v && typeof v === 'object' ? v as Record<string,unknown> : {}
function requestKey(v: unknown) {
  if (v == null) return null
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(v)) throw fail('REQUEST_KEY_INVALID','The request confirmation ID is invalid.')
  return v
}
async function commitments(q: PoolConnection, userId: number) {
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM (
    SELECT DISTINCT COALESCE(pc.title_id,-bt.material_id) AS title_id FROM borrow_transactions bt
      LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
      WHERE bt.user_id=? AND bt.transaction_status IN ('Pending','Borrowed','Overdue')
    UNION SELECT COALESCE(book_title_id,-material_id) FROM reservations WHERE user_id=? AND reservation_status IN ${active}
    ) commitments`,[userId,userId])
  return Number(rows[0]?.total ?? 0)
}
async function lock(q: PoolConnection) {
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
async function linkedUser(q: PoolConnection, accountId:number, staff=false) {
  const [rows] = await q.execute<RowDataPacket[]>('SELECT user_id,role,account_status FROM accounts WHERE account_id=? FOR UPDATE',[accountId])
  const a=rows[0]
  if(!a?.user_id || a.account_status!=='Active') throw fail('CIRCULATION_PROFILE_NOT_LINKED','This account must be active and linked to a library profile.')
  if (staff ? !['Librarian','Staff'].includes(a.role) : !['Student','Faculty'].includes(a.role)) throw new HttpError(403,'REQUEST_ROLE_FORBIDDEN','Your role cannot perform this book request action.')
  return Number(a.user_id)
}

/** The caller holds the shared circulation lock. Honor prior reservations first. */
async function availableCopies(q: PoolConnection, titleId: number) {
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT pc.* FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id
    WHERE pc.title_id=? AND pc.lifecycle_status='Active' AND t.lifecycle_status='Active' AND t.record_type='Book'
      AND pc.material_id IS NOT NULL AND pc.availability_status='Available' AND pc.condition_status NOT IN ('Lost','Damaged','For Repair')
      AND NOT EXISTS(SELECT 1 FROM borrow_transactions bt WHERE (bt.physical_copy_id=pc.physical_copy_id OR bt.material_id=pc.material_id) AND bt.transaction_status IN ('Pending','Borrowed','Overdue'))
      AND NOT EXISTS(SELECT 1 FROM in_library_uses iu WHERE iu.physical_copy_id=pc.physical_copy_id AND iu.ended_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.assigned_physical_copy_id=pc.physical_copy_id AND r.reservation_status IN ${active})
    ORDER BY pc.physical_copy_id FOR UPDATE OF pc,t`, [titleId])
  return rows
}

/** Allocate by title identity and ordered waiting position; never automatically ready. */
export async function allocateWaitingRequests(q: PoolConnection,titleId:number,now=new Date()) {
  const [copies] = await q.execute<RowDataPacket[]>(`SELECT pc.*,t.title FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id
    WHERE pc.title_id=? AND pc.lifecycle_status='Active' AND t.lifecycle_status='Active' AND t.record_type='Book'
      AND pc.material_id IS NOT NULL AND pc.availability_status='Available' AND pc.condition_status NOT IN ('Lost','Damaged','For Repair')
      AND NOT EXISTS(SELECT 1 FROM borrow_transactions bt WHERE (bt.physical_copy_id=pc.physical_copy_id OR bt.material_id=pc.material_id) AND bt.transaction_status IN ('Pending','Borrowed','Overdue'))
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
    if(eligible.blockers.length || (eligible.limit!==null && await commitments(q,Number(r.user_id))>eligible.limit)) continue
    const [rules]=await q.execute<RowDataPacket[]>('SELECT is_borrowable FROM borrowing_policy_material_rules WHERE borrowing_policy_version_id=? AND material_type=\'Book\'',[eligible.policy.borrowing_policy_version_id])
    if(!rules[0]?.is_borrowable) continue
    const copy=copies.shift()!
    await q.execute(`UPDATE reservations SET reservation_status='approved',accession_id=?,assigned_physical_copy_id=?,
      preparation_started_at=?,pickup_deadline=NULL,updated_at=NOW() WHERE reservation_id=?`,[copy.material_id,copy.physical_copy_id,now,r.reservation_id])
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
  await q.execute('UPDATE reservations SET reservation_status=?,updated_at=NOW() WHERE reservation_id=?',[status,r.reservation_id])
  await cancelPendingCounterClaim(q,Number(r.reservation_id),actor,status==='expired'?'Pickup deadline expired.':'Book request cancelled.')
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
      JOIN physical_copies pc ON pc.title_id=t.title_id WHERE t.title_id=? AND t.record_type='Book' AND t.lifecycle_status='Active'
      AND pc.lifecycle_status='Active' AND pc.material_id IS NOT NULL GROUP BY t.title_id`,[titleId])
    if(!titles[0]) throw fail('BOOK_RESERVATION_UNAVAILABLE','This title has no active physical copy for requests.')
    const [rules]=await q.execute<RowDataPacket[]>('SELECT is_borrowable FROM borrowing_policy_material_rules WHERE borrowing_policy_version_id=? AND material_type=\'Book\'',[eligible.policy.borrowing_policy_version_id])
    if(!rules[0]?.is_borrowable) throw fail('RESEARCH_VIEW_ONLY','The approved policy does not allow take-home borrowing of this material.')
    const [duplicates]=await q.execute<RowDataPacket[]>(`SELECT reservation_id FROM reservations WHERE user_id=? AND book_title_id=? AND reservation_status IN ${active}
      UNION ALL SELECT bt.transaction_id FROM borrow_transactions bt JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
      WHERE bt.user_id=? AND pc.title_id=? AND bt.transaction_status IN ('Pending','Borrowed','Overdue')`,[userId,titleId,userId,titleId])
    if(duplicates.length) throw fail('BOOK_ALREADY_IN_ACCOUNT','You already have this title in a book request or active loan.')
    if(eligible.limit!==null && await commitments(q,userId)>=eligible.limit) throw fail('STUDENT_BORROW_LIMIT_REACHED',`The approved borrowing limit is ${eligible.limit} active books or requests.`)
    const policy=await createBorrowingPolicyService(database,clock).resolveActive(q,now)
    const reservationLimit=roleReservationLimit(policy,String(eligible.user?.user_role))
    const [counts]=await q.execute<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM reservations WHERE user_id=? AND request_kind='Reservation' AND reservation_status IN ${active}`,[userId])
    if(kind==='Reservation' && reservationLimit!==null && Number(counts[0]?.n)>=reservationLimit) throw fail('STUDENT_BORROW_LIMIT_REACHED',`The approved reservation limit is ${reservationLimit}.`)
    await allocateWaitingRequests(q,titleId,now)
    const copies=await availableCopies(q,titleId)
    if(kind==='Reservation' && copies.length) throw fail('BOOK_AVAILABLE_USE_CART','This book has an available copy. Add it to your cart instead of reserving it.')
    if(kind==='CartHandover' && !copies.length) throw fail('BOOK_NO_LONGER_AVAILABLE',`${titles[0].title} has no available copy now. Your cart has been kept. Remove it from the cart and use Reserve book in the catalog to join its waiting list.`)
    const [queue]=await q.execute<RowDataPacket[]>(`SELECT COALESCE(MAX(queue_position),0)+1 AS position FROM reservations WHERE book_title_id=? AND request_kind='Reservation' AND reservation_status IN ${active}`,[titleId])
    const [insert]=await q.execute<ResultSetHeader>(`INSERT INTO reservations(user_id,material_id,book_title_id,borrowing_policy_version_id,
      queue_position,reservation_status,reserved_at,client_request_id,request_kind,accession_id,assigned_physical_copy_id,preparation_started_at)
      VALUES (?,?,?,?,?,?,(?::timestamptz AT TIME ZONE 'Asia/Manila'),?,?,?,?,?)`,
      [userId,titles[0].material_id,titleId,policy.versionId,kind==='Reservation'?queue[0].position:1,kind==='Reservation'?'pending':'approved',now,key,kind,kind==='CartHandover'?copies[0].material_id:null,kind==='CartHandover'?copies[0].physical_copy_id:null,kind==='CartHandover'?now:null])
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
      if(input.pickupDeadline) throw fail('PICKUP_DEADLINE_FIXED','Pickup deadlines are fixed at 24 hours from Mark ready.')
      return transaction(async q=> {
        await linkedUser(q,positiveId(accountId,'accountId'),true)
        let r=await requestRow(q,positiveId(id,'reservationId'))
        if(r.request_kind==='CartHandover') throw fail('CART_HANDOVER_USE_DESK','This cart is awaiting handover. Open Borrow & return and choose Start checkout.')
        if(r.reservation_status==='ready_for_pickup') return {...result(r),replayed:true}
        if(!['pending','approved'].includes(r.reservation_status)) throw fail('RESERVATION_TRANSITION_INVALID','This request can no longer be prepared.')
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
        const now=clock(),deadline=new Date(now.getTime()+24*60*60*1000)
        await q.execute(`UPDATE reservations SET reservation_status='ready_for_pickup',ready_at=?,
          pickup_deadline=(?::timestamptz AT TIME ZONE 'Asia/Manila'),updated_at=NOW() WHERE reservation_id=?`,[now,deadline,r.reservation_id])
        await recordRequestEvent(q,Number(r.reservation_id),'ready_for_pickup',now)
        return result(await requestRow(q,Number(r.reservation_id)))
      })
    },
    async expire(now:Date,batchSize=100) {
      return transaction(async q=> {
        const [rows]=await q.execute<RowDataPacket[]>(`SELECT r.* FROM reservations r WHERE reservation_status='ready_for_pickup'
          AND pickup_deadline<=(?::timestamptz AT TIME ZONE 'Asia/Manila') ORDER BY pickup_deadline,reservation_id LIMIT ? FOR UPDATE`,[now,Math.min(500,Math.max(1,batchSize))])
        for(const r of rows) await releaseBookRequest(q,r,'expired',null,now)
        return {expiredCount:rows.length,releasedAccessions:rows.filter(r=>r.accession_id).map(r=>Number(r.accession_id))}
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
