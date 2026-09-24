import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'

type DashboardActor = { accountId: number; role: string }
type IdentityRow = RowDataPacket & { account_id: number; user_id: number | null; school_id: string; full_name: string; program: string | null }

const number = (value: unknown) => Number(value ?? 0)
const money = (value: unknown) => Number(number(value).toFixed(2))

export class DashboardRepository {
  private readonly pool: Pool
  constructor(pool: Pool = db) { this.pool = pool }

  private async identity(accountId: number) {
    const [rows] = await this.pool.execute<IdentityRow[]>(
      `SELECT a.account_id,a.user_id,a.school_id,
              COALESCE(NULLIF(u.full_name,''),NULLIF(CONCAT_WS(' ',sp.first_name,sp.last_name),''),a.school_id) AS full_name,
              COALESCE(NULLIF(sp.program_strand,''),NULLIF(u.course_or_strand,'')) AS program
         FROM accounts a
         LEFT JOIN users u ON u.user_id=a.user_id
         LEFT JOIN student_profiles sp ON sp.account_id=a.account_id
        WHERE a.account_id=? OR a.user_id=? ORDER BY (a.account_id=?) DESC LIMIT 1`, [accountId,accountId,accountId],
    )
    if (!rows[0]) throw new HttpError(404, 'DASHBOARD_ACCOUNT_NOT_FOUND', 'The signed-in account was not found.')
    return rows[0]
  }

  private async libraryProfile() {
    const [profileRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT library_name,seat_capacity,information_text,map_asset_path
         FROM library_profile_settings WHERE settings_id=1 LIMIT 1`,
    )
    const [scheduleRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT day_of_week,is_open,TIME_FORMAT(opens_at,'%h:%i %p') opens_at,TIME_FORMAT(closes_at,'%h:%i %p') closes_at
         FROM library_operating_schedule ORDER BY day_of_week`,
    )
    const [closureRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT DATE_FORMAT(closed_date,'%Y-%m-%d') closed_date,reason
         FROM library_closed_days WHERE closed_date>=CURDATE() ORDER BY closed_date LIMIT 1`,
    )
    const profile = profileRows[0] ?? {}
    return {
      name: String(profile.library_name ?? 'STI Ormoc Smart Library'),
      seatCapacity: Math.max(1, number(profile.seat_capacity || 80)),
      information: profile.information_text ? String(profile.information_text) : null,
      mapPath: profile.map_asset_path ? String(profile.map_asset_path) : null,
      schedule: scheduleRows.map((row) => ({ day: number(row.day_of_week), isOpen: Boolean(row.is_open), opensAt: row.opens_at ? String(row.opens_at) : null, closesAt: row.closes_at ? String(row.closes_at) : null })),
      nextClosure: closureRows[0] ? { date: String(closureRows[0].closed_date), reason: String(closureRows[0].reason) } : null,
    }
  }

  async admin(actor: DashboardActor) {
    const identity = await this.identity(actor.accountId)
    const [profile, copyResult, operationsResult, attendanceResult, fineResult, weeklyResult, purposeResult, categoriesResult, circulationResult, activityResult, occupancyResult] = await Promise.all([
      this.libraryProfile(),
      this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) total_books,SUM(availability_status='Available') available_books FROM physical_copies WHERE lifecycle_status='Active'`),
      this.pool.execute<RowDataPacket[]>(`SELECT
          (SELECT COUNT(*) FROM borrow_transactions WHERE transaction_status IN ('Borrowed','Overdue') AND lost_confirmed_at IS NULL) active_borrowed,
          (SELECT COUNT(*) FROM borrow_transactions WHERE (transaction_status='Overdue' OR (transaction_status='Borrowed' AND due_at<NOW())) AND lost_confirmed_at IS NULL) overdue_books,
          (SELECT COUNT(*) FROM borrow_transactions WHERE transaction_status='Returned' AND DATE(returned_at)=CURDATE()) returned_today,
          (SELECT COUNT(*) FROM accounts WHERE role IN ('Student','Faculty') AND account_status='Active') active_users,
          (SELECT COUNT(*) FROM reservations WHERE reservation_status IN ('pending','approved','ready_for_pickup')) active_reservations`),
      this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) daily_attendance FROM attendance_logs WHERE attendance_date=CURDATE()`),
      this.pool.execute<RowDataPacket[]>(`SELECT
          COALESCE((SELECT SUM(GREATEST(0,f.fine_amount-COALESCE(p.paid,0)-COALESCE(a.adjusted,0)))
            FROM fines f
            LEFT JOIN (SELECT x.fine_id,SUM(x.amount_allocated) paid FROM fine_payment_allocations x JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=x.fine_payment_receipt_id AND r.receipt_status='Issued' GROUP BY x.fine_id) p ON p.fine_id=f.fine_id
            LEFT JOIN (SELECT fine_id,SUM(amount_adjusted) adjusted FROM fine_adjustments GROUP BY fine_id) a ON a.fine_id=f.fine_id),0)
          + COALESCE((SELECT SUM(GREATEST(0,l.replacement_charge-COALESCE(p2.paid,0))) FROM lost_book_reports l
            LEFT JOIN (SELECT x.lost_book_report_id,SUM(x.amount_allocated) paid FROM fine_payment_allocations x JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=x.fine_payment_receipt_id AND r.receipt_status='Issued' GROUP BY x.lost_book_report_id) p2 ON p2.lost_book_report_id=l.lost_book_report_id
            WHERE l.report_status='Confirmed' AND l.payment_status='Unpaid'),0) outstanding_fines`),
      this.pool.execute<RowDataPacket[]>(`SELECT WEEKDAY(attendance_date) weekday,COUNT(*) visits FROM attendance_logs
        WHERE attendance_date BETWEEN DATE_SUB(CURDATE(),INTERVAL WEEKDAY(CURDATE()) DAY) AND DATE_ADD(DATE_SUB(CURDATE(),INTERVAL WEEKDAY(CURDATE()) DAY),INTERVAL 5 DAY)
        GROUP BY WEEKDAY(attendance_date) ORDER BY weekday`),
      this.pool.execute<RowDataPacket[]>(`SELECT reason_for_visit label,COUNT(*) value FROM attendance_logs WHERE attendance_date=CURDATE() GROUP BY reason_for_visit ORDER BY value DESC`),
      this.pool.execute<RowDataPacket[]>(`SELECT COALESCE(c.category_name,'Uncategorized') label,COUNT(*) value
        FROM borrow_transactions bt JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
        JOIN titles t ON t.title_id=pc.title_id LEFT JOIN categories c ON c.category_id=t.category_id
        WHERE COALESCE(bt.borrowed_at,bt.created_at)>=DATE_SUB(NOW(),INTERVAL 30 DAY)
        GROUP BY c.category_id,c.category_name ORDER BY value DESC,label LIMIT 5`),
      this.pool.execute<RowDataPacket[]>(`SELECT bt.transaction_id,u.full_name,u.school_id,t.title,pc.barcode,bt.transaction_status,
        DATE_FORMAT(COALESCE(bt.returned_at,bt.due_at,bt.created_at),'%Y-%m-%d %h:%i %p') event_at
        FROM borrow_transactions bt JOIN users u ON u.user_id=bt.user_id
        JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id JOIN titles t ON t.title_id=pc.title_id
        ORDER BY COALESCE(bt.updated_at,bt.created_at) DESC,bt.transaction_id DESC LIMIT 6`),
      this.pool.execute<RowDataPacket[]>(`SELECT admin_notification_id,event_type,message_title,message_body,DATE_FORMAT(created_at,'%Y-%m-%d %h:%i %p') created_at
        FROM admin_notifications ORDER BY created_at DESC,admin_notification_id DESC LIMIT 6`),
      this.pool.execute<RowDataPacket[]>(`SELECT
        SUM(attendance_date=CURDATE() AND time_out IS NULL) currently_inside,
        COALESCE(ROUND(AVG(CASE WHEN attendance_date=CURDATE() AND time_out IS NOT NULL THEN TIME_TO_SEC(TIMEDIFF(time_out,time_in))/60 END)),0) average_minutes,
        (SELECT HOUR(time_in) FROM attendance_logs WHERE attendance_date=CURDATE() GROUP BY HOUR(time_in) ORDER BY COUNT(*) DESC,HOUR(time_in) LIMIT 1) peak_hour
        FROM attendance_logs`),
    ])
    const copies = copyResult[0][0] ?? {}, operations = operationsResult[0][0] ?? {}, attendance = attendanceResult[0][0] ?? {}, fine = fineResult[0][0] ?? {}, occupancy = occupancyResult[0][0] ?? {}
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat']
    const byDay = new Map((weeklyResult[0] as RowDataPacket[]).map((row) => [number(row.weekday), number(row.visits)]))
    const peak = occupancy.peak_hour === null || occupancy.peak_hour === undefined ? null : number(occupancy.peak_hour)
    return {
      generatedAt: new Date().toISOString(), staff: { name: identity.full_name, schoolId: identity.school_id }, profile,
      kpis: {
        totalBooks: number(copies.total_books), activeBorrowed: number(operations.active_borrowed), availableBooks: number(copies.available_books), overdueBooks: number(operations.overdue_books),
        activeUsers: number(operations.active_users), dailyAttendance: number(attendance.daily_attendance), activeReservations: number(operations.active_reservations), outstandingFines: money(fine.outstanding_fines), returnedToday: number(operations.returned_today),
      },
      weeklyAttendance: days.map((label, index) => ({ label, value: byDay.get(index) ?? 0 })),
      purposeBreakdown: (purposeResult[0] as RowDataPacket[]).map((row) => ({ label: String(row.label), value: number(row.value) })),
      popularCategories: (categoriesResult[0] as RowDataPacket[]).map((row) => ({ label: String(row.label), value: number(row.value) })),
      recentCirculation: (circulationResult[0] as RowDataPacket[]).map((row) => ({ id: number(row.transaction_id), userName: String(row.full_name), schoolId: String(row.school_id), title: String(row.title), barcode: String(row.barcode), status: String(row.transaction_status), eventAt: String(row.event_at) })),
      recentActivity: (activityResult[0] as RowDataPacket[]).map((row) => ({ id: number(row.admin_notification_id), type: String(row.event_type), title: String(row.message_title), message: String(row.message_body), createdAt: String(row.created_at) })),
      occupancy: { current: number(occupancy.currently_inside), capacity: profile.seatCapacity, peakHour: peak === null ? null : `${peak % 12 || 12}:00 ${peak < 12 ? 'AM' : 'PM'}`, averageMinutes: number(occupancy.average_minutes) },
    }
  }

  async user(actor: DashboardActor) {
    const identity = await this.identity(actor.accountId)
    const userId = identity.user_id
    const profile = await this.libraryProfile()
    if (!userId) return this.emptyUser(identity, actor.role, profile)
    const [summaryResult, loanResult, reservationResult, printResult, noticeResult, announcementResult, historyResult, recommendationResult, occupancyResult] = await Promise.all([
      this.pool.execute<RowDataPacket[]>(`SELECT
        (SELECT COUNT(*) FROM borrow_transactions WHERE user_id=? AND transaction_status IN ('Borrowed','Overdue') AND lost_confirmed_at IS NULL) active_loans,
        (SELECT COUNT(*) FROM borrow_transactions WHERE user_id=? AND transaction_status='Pending') pending_book_requests,
        (SELECT COUNT(*) FROM reservations WHERE user_id=? AND reservation_status IN ('pending','approved','ready_for_pickup')) active_reservations,
        (SELECT COUNT(*) FROM notifications WHERE user_id=? AND deleted_at IS NULL AND is_read=0 AND (delivered_at IS NULL OR delivered_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW())) unread_notifications,
        (SELECT override_status FROM clearance_overrides WHERE user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY applied_at DESC,clearance_override_id DESC LIMIT 1) override_status,
        COALESCE((SELECT SUM(GREATEST(0,f.fine_amount-COALESCE(p.paid,0)-COALESCE(a.adjusted,0))) FROM fines f
          LEFT JOIN (SELECT x.fine_id,SUM(x.amount_allocated) paid FROM fine_payment_allocations x JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=x.fine_payment_receipt_id AND r.receipt_status='Issued' GROUP BY x.fine_id) p ON p.fine_id=f.fine_id
          LEFT JOIN (SELECT fine_id,SUM(amount_adjusted) adjusted FROM fine_adjustments GROUP BY fine_id) a ON a.fine_id=f.fine_id WHERE f.user_id=?),0)
        + COALESCE((SELECT SUM(replacement_charge) FROM lost_book_reports WHERE user_id=? AND report_status='Confirmed' AND payment_status='Unpaid'),0) outstanding_fines`, [userId,userId,userId,userId,userId,userId,userId]),
      this.pool.execute<RowDataPacket[]>(`SELECT bt.transaction_id,t.title,COALESCE(GROUP_CONCAT(a.author_name ORDER BY a.author_order SEPARATOR ', '),m.author,'Unknown author') author,
        pc.barcode,pc.shelf_location,bt.transaction_status,DATE_FORMAT(bt.due_at,'%Y-%m-%d %h:%i %p') due_at,t.cover_image_path
        FROM borrow_transactions bt JOIN materials m ON m.material_id=bt.material_id
        LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id LEFT JOIN titles t ON t.title_id=pc.title_id LEFT JOIN authors a ON a.title_id=t.title_id
        WHERE bt.user_id=? AND bt.transaction_status IN ('Borrowed','Overdue') AND bt.lost_confirmed_at IS NULL GROUP BY bt.transaction_id ORDER BY (bt.transaction_status='Overdue') DESC,bt.due_at ASC LIMIT 1`, [userId]),
      this.pool.execute<RowDataPacket[]>(`SELECT r.reservation_id,COALESCE(t.title,m.title) title,t.cover_image_path,r.queue_position,r.reservation_status,DATE_FORMAT(r.pickup_deadline,'%Y-%m-%d %h:%i %p') pickup_deadline
        FROM reservations r JOIN materials m ON m.material_id=r.material_id LEFT JOIN titles t ON t.title_id=r.book_title_id
        WHERE r.user_id=? AND r.reservation_status IN ('pending','approved','ready_for_pickup') ORDER BY (r.reservation_status='ready_for_pickup') DESC,r.reserved_at LIMIT 1`, [userId]),
      this.pool.execute<RowDataPacket[]>(`SELECT request_id,file_name,number_of_copies,print_type,calculated_cost,job_status,DATE_FORMAT(created_at,'%Y-%m-%d %h:%i %p') created_at
        FROM print_requests WHERE user_id=? AND job_status<>'Completed' ORDER BY created_at DESC,request_id DESC LIMIT 1`, [userId]),
      this.pool.execute<RowDataPacket[]>(`SELECT notification_id,message_title,message_body,trigger_type,action_path,DATE_FORMAT(notification_timestamp,'%Y-%m-%d %h:%i %p') created_at
        FROM notifications WHERE user_id=? AND deleted_at IS NULL AND (delivered_at IS NULL OR delivered_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY notification_timestamp DESC LIMIT 1`, [userId]),
      this.pool.execute<RowDataPacket[]>(`SELECT announcement_id,title,message_body,priority,DATE_FORMAT(COALESCE(published_at,publish_at),'%Y-%m-%d %h:%i %p') published_at
        FROM announcements WHERE announcement_status='Published' AND (publish_at IS NULL OR publish_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY COALESCE(published_at,publish_at) DESC,announcement_id DESC LIMIT 1`),
      this.pool.execute<RowDataPacket[]>(`SELECT bt.transaction_id,t.title,t.cover_image_path,bt.transaction_status,DATE_FORMAT(COALESCE(bt.returned_at,bt.due_at),'%Y-%m-%d %h:%i %p') event_at
        FROM borrow_transactions bt LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id LEFT JOIN titles t ON t.title_id=pc.title_id
        WHERE bt.user_id=? ORDER BY COALESCE(bt.returned_at,bt.borrowed_at,bt.created_at) DESC LIMIT 4`, [userId]),
      this.pool.execute<RowDataPacket[]>(`SELECT t.title_id,t.title,COALESCE(GROUP_CONCAT(DISTINCT a.author_name ORDER BY a.author_order SEPARATOR ', '),'Unknown author') author,t.cover_image_path,COUNT(DISTINCT CASE WHEN pc.availability_status='Available' THEN pc.physical_copy_id END) available_copies,
        SUM(CASE WHEN borrower.course_or_strand=? THEN 3 ELSE 1 END) score
        FROM titles t JOIN physical_copies pc ON pc.title_id=t.title_id AND pc.lifecycle_status='Active' LEFT JOIN authors a ON a.title_id=t.title_id
        LEFT JOIN borrow_transactions bt ON bt.physical_copy_id=pc.physical_copy_id AND bt.borrowed_at>=DATE_SUB(NOW(),INTERVAL 180 DAY) LEFT JOIN users borrower ON borrower.user_id=bt.user_id
        WHERE t.record_type='Book' AND t.lifecycle_status='Active'
          AND NOT EXISTS (SELECT 1 FROM borrow_transactions own_bt JOIN physical_copies own_pc ON own_pc.physical_copy_id=own_bt.physical_copy_id WHERE own_bt.user_id=? AND own_pc.title_id=t.title_id AND own_bt.transaction_status IN ('Pending','Borrowed','Overdue'))
          AND NOT EXISTS (SELECT 1 FROM reservations own_r WHERE own_r.user_id=? AND own_r.book_title_id=t.title_id AND own_r.reservation_status IN ('pending','approved','ready_for_pickup'))
        GROUP BY t.title_id,t.title,t.cover_image_path HAVING available_copies>0 ORDER BY score DESC,t.title LIMIT 3`, [identity.program ?? '',userId,userId]),
      this.pool.execute<RowDataPacket[]>(`SELECT SUM(attendance_date=CURDATE() AND time_out IS NULL) currently_inside FROM attendance_logs`),
    ])
    const summary = summaryResult[0][0] ?? {}, loan = loanResult[0][0], reservation = reservationResult[0][0], print = printResult[0][0], notice = noticeResult[0][0], announcement = announcementResult[0][0], occupancy = occupancyResult[0][0] ?? {}
    const limit = actor.role === 'Student' ? 2 : null
    const computedClearance = number(summary.active_loans) > 0 || money(summary.outstanding_fines) > 0 ? 'Not Cleared' : 'Cleared'
    return {
      generatedAt: new Date().toISOString(), user: { name: identity.full_name, schoolId: identity.school_id, program: identity.program, role: actor.role }, profile,
      summary: { activeLoans: number(summary.active_loans), activeBookCount: number(summary.active_loans)+number(summary.pending_book_requests)+number(summary.active_reservations), borrowingLimit: limit, activeReservations: number(summary.active_reservations), unreadNotifications: number(summary.unread_notifications), outstandingFines: money(summary.outstanding_fines), clearanceStatus: summary.override_status ? String(summary.override_status) : computedClearance },
      occupancy: { current: number(occupancy.currently_inside), capacity: profile.seatCapacity },
      currentLoan: loan ? { id:number(loan.transaction_id),title:String(loan.title),author:String(loan.author),barcode:String(loan.barcode ?? ''),shelfLocation:String(loan.shelf_location ?? ''),status:String(loan.transaction_status),dueAt:String(loan.due_at ?? ''),coverPath:loan.cover_image_path?String(loan.cover_image_path):null } : null,
      reservation: reservation ? { id:number(reservation.reservation_id),title:String(reservation.title),coverPath:reservation.cover_image_path?String(reservation.cover_image_path):null,queuePosition:number(reservation.queue_position),status:String(reservation.reservation_status),pickupDeadline:reservation.pickup_deadline?String(reservation.pickup_deadline):null } : null,
      printRequest: print ? { id:number(print.request_id),fileName:String(print.file_name),copies:number(print.number_of_copies),printType:String(print.print_type),cost:money(print.calculated_cost),status:String(print.job_status),createdAt:String(print.created_at) } : null,
      latestNotification: notice ? { id:number(notice.notification_id),title:String(notice.message_title),message:String(notice.message_body),type:String(notice.trigger_type),actionPath:notice.action_path?String(notice.action_path):null,createdAt:String(notice.created_at) } : null,
      announcement: announcement ? { id:number(announcement.announcement_id),title:String(announcement.title),message:String(announcement.message_body),priority:String(announcement.priority),publishedAt:String(announcement.published_at) } : null,
      recentHistory: (historyResult[0] as RowDataPacket[]).map((row)=>({id:number(row.transaction_id),title:String(row.title ?? 'Book'),coverPath:row.cover_image_path?String(row.cover_image_path):null,status:String(row.transaction_status),eventAt:String(row.event_at ?? '')})),
      recommendations: (recommendationResult[0] as RowDataPacket[]).map((row)=>({id:number(row.title_id),title:String(row.title),author:String(row.author),availableCopies:number(row.available_copies),coverPath:row.cover_image_path?String(row.cover_image_path):null})),
    }
  }

  private emptyUser(identity: IdentityRow, role: string, profile: Awaited<ReturnType<DashboardRepository['libraryProfile']>>) {
    return { generatedAt:new Date().toISOString(),user:{name:identity.full_name,schoolId:identity.school_id,program:identity.program,role},profile,summary:{activeLoans:0,activeBookCount:0,borrowingLimit:role==='Student'?2:null,activeReservations:0,unreadNotifications:0,outstandingFines:0,clearanceStatus:'Cleared'},occupancy:{current:0,capacity:profile.seatCapacity},currentLoan:null,reservation:null,printRequest:null,latestNotification:null,announcement:null,recentHistory:[],recommendations:[] }
  }
}

export const dashboardRepository = new DashboardRepository()
