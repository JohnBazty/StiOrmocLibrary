import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db, dbDriver } from '../../config/db.js'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { HttpError } from '../../core/http-error.ts'
import { libraryState } from '../attendance/attendance-operations.service.ts'
import { createClearanceService } from '../clearance/clearance.service.ts'
import { readCollectionSnapshot } from '../catalog/collection-review.service.ts'

export function createWorkspaceTasksService(database: Pool = db) {
  return { async read(accountId: number) {
    if (dbDriver !== 'postgres') throw new HttpError(503, 'WORKSPACE_UNAVAILABLE', 'The live workspace requires the Postgres revision schema.')
    const q = await database.getConnection()
    try {
      await q.beginTransaction()
      await q.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
      await requireLibraryActor(q, accountId, 'desk.operate')
      const [actors] = await q.execute<RowDataPacket[]>('SELECT role FROM accounts WHERE account_id=?', [accountId])
      const actor = actors[0]
      const prefix = actor.role === 'Librarian' ? '/librarian' : '/staff'
      const [rows] = await q.execute<RowDataPacket[]>(`SELECT
        (SELECT COUNT(*) FROM borrow_transactions WHERE transaction_status IN ('Borrowed','Overdue') AND lost_confirmed_at IS NULL) loans,
        (SELECT COUNT(*) FROM borrow_transactions WHERE transaction_status IN ('Borrowed','Overdue') AND due_at<(NOW() AT TIME ZONE 'Asia/Manila') AND lost_confirmed_at IS NULL) overdue,
        (SELECT COUNT(*) FROM in_library_uses WHERE ended_at IS NULL AND hand_back_by<NOW()) handbacks,
        (SELECT COUNT(*) FROM reservations WHERE request_kind='Reservation' AND reservation_status='approved' AND assigned_physical_copy_id IS NOT NULL) preparation,
        (SELECT COUNT(*) FROM reservations WHERE reservation_status='ready_for_pickup' AND pickup_deadline>(NOW() AT TIME ZONE 'Asia/Manila')) pickups,
        (SELECT COUNT(*) FROM reservations WHERE request_kind='CartHandover' AND reservation_status='approved') cart_handovers,
        (SELECT COUNT(*) FROM print_requests WHERE job_status IN ('Pending','Printing','Ready for Pickup')) printing`)
      const r = rows[0], state = await libraryState(q)
      const [printStatus] = await q.execute<RowDataPacket[]>('SELECT accepting_requests FROM printing_service_settings WHERE settings_id=1')
      const cards = [
        { label: 'Active take-home loans', value: Number(r.loans), path: `${prefix}/circulation` },
        { label: 'Overdue returns', value: Number(r.overdue), path: `${prefix}/circulation` },
        { label: 'Overdue in-library handbacks', value: Number(r.handbacks), path: `${prefix}/circulation` },
        { label: 'Carts awaiting handover', value: Number(r.cart_handovers), path: `${prefix}/circulation` },
        { label: 'Books to prepare', value: Number(r.preparation), path: `${prefix}/reservations` },
        { label: 'Ready for pickup', value: Number(r.pickups), path: `${prefix}/reservations` },
        { label: 'Active print jobs', value: Number(r.printing), path: `${prefix}/printing` },
        { label: 'Occupied seats', value: state.current, path: `${prefix}/attendance` },
      ]
      const [pickups] = await q.execute<RowDataPacket[]>(`SELECT r.reservation_id id,t.title,u.full_name borrower,
        to_char(r.pickup_deadline,'YYYY-MM-DD HH24:MI') deadline
        FROM reservations r JOIN users u ON u.user_id=r.user_id JOIN titles t ON t.title_id=r.book_title_id
        WHERE r.reservation_status='ready_for_pickup' AND r.pickup_deadline>(NOW() AT TIME ZONE 'Asia/Manila')
        ORDER BY r.pickup_deadline,r.reservation_id LIMIT 5`)
      if (actor.role === 'Librarian') {
        const [admin] = await q.execute<RowDataPacket[]>(`SELECT
          (SELECT COUNT(*) FROM accounts WHERE account_status='Active') users,
          (SELECT COUNT(*) FROM registration_requests WHERE status='PendingApproval') registrations,
          (SELECT COUNT(*) FROM profile_avatar_submissions WHERE status='Pending') photos,
          (SELECT COUNT(*) FROM lost_book_reports WHERE report_status='Pending') losses,
          (SELECT COUNT(*) FROM ink_repository WHERE available_bottles<=low_stock_threshold_bottles)+
          (SELECT COUNT(*) FROM bond_paper_stocks WHERE unopened_reams<=low_stock_threshold_reams) low_supplies`)
        const clearance = await createClearanceService(q as unknown as Pool).activeStudentSummary()
        const collection = await readCollectionSnapshot(q)
        cards.push(
          { label: 'Active accounts', value: Number(admin[0].users), path: '/librarian/users' },
          { label: 'Cleared active students', value: clearance.cleared, path: '/librarian/clearance?active=1&status=Cleared' },
          { label: 'Not-cleared active students', value: clearance.notCleared, path: '/librarian/clearance?active=1&status=Not%20Cleared' },
          { label: 'Account approvals', value: Number(admin[0].registrations), path: '/librarian/approvals' },
          { label: 'Picture approvals', value: Number(admin[0].photos), path: '/librarian/approvals' },
          { label: 'Lost-book reports to review', value: Number(admin[0].losses), path: '/librarian/clearance' },
          { label: 'Low supply items', value: Number(admin[0].low_supplies), path: '/librarian/supplies' },
          { label: 'Aging active book records', value: collection.books.filter(b => b.status === 'Active' && b.ageStatus === 'Outdated').length, path: '/librarian/collection-review' },
          { label: 'Book years needing verification', value: collection.books.filter(b => b.status === 'Active' && ['Unknown','Future'].includes(b.ageStatus)).length, path: '/librarian/collection-review' },
          { label: 'Approved collection shortfalls', value: collection.requirements.filter(r => r.status === 'Shortfall').length, path: '/librarian/collection-review' },
        )
      }
      await q.commit()
      return { generatedAt: new Date().toISOString(), role: actor.role, cards, pickups,
        operations: { state: state.state, capacity: state.capacity, serviceVisits: state.serviceVisits,
          allowBorrowing: state.allowBorrowing, allowPrinting: state.allowPrinting && Number(printStatus[0]?.accepting_requests) === 1,
          events: state.events.map(e => ({title:e.title})) },
        enrollment: 'Enrollment not verified — approved active-account policy is temporary.' }
    } catch (e) { await q.rollback(); throw e } finally { q.release() }
  } }
}
export const workspaceTasksService = createWorkspaceTasksService()
