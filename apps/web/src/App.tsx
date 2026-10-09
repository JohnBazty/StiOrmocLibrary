import { Route, Routes } from 'react-router-dom'
import { PortalLayout } from './layouts/PortalLayout'
import { UserAttendancePage } from './features/attendance/UserAttendancePage'
import { AdminDashboardPage } from './features/dashboard/AdminDashboardPage'
import { AdminAccountDashboardPage } from './features/dashboard/AdminAccountDashboardPage'
import { StaffDashboardPage } from './features/dashboard/StaffDashboardPage'
import { AccountApprovalsPage } from './features/users/AccountApprovalsPage'
import { ProfileAvatarPage } from './features/users/ProfileAvatarPage'
import { UserDashboardPage } from './features/dashboard/UserDashboardPage'
import { FloorPlanImagePage } from './features/floor-plan/FloorPlanImagePage'
import { BookArchivePage } from './features/catalog/BookArchivePage'
import { AdminAttendancePage } from './features/attendance/AdminAttendancePage'
import { StaffAttendancePage } from './features/attendance/StaffAttendancePage'
import { AdminUsersPage } from './features/users/AdminUsersPage'
import { CatalogManagementPage } from './features/catalog/CatalogManagementPage'
import { CategoryManagementPage } from './features/categories/CategoryManagementPage'
import { AdminReservationQueuePage } from './features/reservations/AdminReservationQueuePage'
import { AuthenticatedHome, ProtectedRoute } from './features/auth/ProtectedRoute'
import { LoginPage } from './features/auth/LoginPage'
import { RegistrationPage } from './features/auth/RegistrationPage'
import { AdminLoginPage } from './features/auth/AdminLoginPage'
import { InventoryDashboard } from './features/inventory/InventoryDashboard'
import { BookCatalog } from './features/catalog/BookCatalog'
import { ResearchCatalog } from './features/catalog/ResearchCatalog'
import { BorrowingHistory } from './features/circulation/BorrowingHistory'
import { AdminCirculationMonitor } from './features/circulation/AdminCirculationMonitor'
import { StudentReservations } from './features/reservations/StudentReservations'
import { BookCart } from './features/catalog/BookCart'
import { StudentPrintingPage } from './features/printing/StudentPrintingPage'
import { AdminPrintingQueuePage } from './features/printing/AdminPrintingQueuePage'
import { StaffPrintingQueuePage } from './features/printing/StaffPrintingQueuePage'
import { AdminPrintSuppliesPage } from './features/printing/AdminPrintSuppliesPage'
import { NotificationCenterPage } from './features/notifications/NotificationCenterPage'
import { AdminNotificationsPage } from './features/notifications/AdminNotificationsPage'
import { AdminAnnouncementsPage } from './features/notifications/AdminAnnouncementsPage'
import { StaffAnnouncementsPage } from './features/notifications/StaffAnnouncementsPage'
import { StudentClearancePage } from './features/clearance/StudentClearancePage'
import { AdminClearancePage } from './features/clearance/AdminClearancePage'
import { AdminFinesPage } from './features/fines/AdminFinesPage'
import { StudentFinesPage } from './features/fines/StudentFinesPage'
import { AdminInvoicesPage } from './features/invoices/AdminInvoicesPage'
import { MyInvoicesPage } from './features/invoices/MyInvoicesPage'

function NotFound() {
  return <div className="flex min-h-screen items-center justify-center bg-[#003399]/5 p-6 text-center"><div><p className="text-sm font-bold text-[#003399]">404</p><h1 className="mt-2 font-display text-3xl font-bold text-[#003399]">This shelf is empty.</h1><p className="mt-2 text-sm text-[#003399]/65">The page you requested is not part of the library system.</p><a href="/" className="mt-5 inline-flex rounded-xl bg-[#003399] px-4 py-2.5 text-sm font-bold text-[#FFFFFF]">Return to library</a></div></div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthenticatedHome />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegistrationPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />

      <Route element={<ProtectedRoute roles={['Student']} />}>
        <Route element={<PortalLayout role="student" />}>
          <Route path="/student/dashboard" element={<UserDashboardPage />} />
          <Route path="/student/catalog" element={<BookCatalog />} />
          <Route path="/student/floor-plan" element={<FloorPlanImagePage />} />
          <Route path="/student/cart" element={<BookCart />} />
          <Route path="/student/research" element={<ResearchCatalog />} />
          <Route path="/student/borrowing" element={<BorrowingHistory />} />
          <Route path="/student/reservations" element={<StudentReservations />} />
          <Route path="/student/printing" element={<StudentPrintingPage />} />
          <Route path="/student/attendance" element={<UserAttendancePage />} />
          <Route path="/student/notifications" element={<NotificationCenterPage />} />
          <Route path="/student/fines" element={<StudentFinesPage />} />
          <Route path="/student/invoices" element={<MyInvoicesPage />} />
          <Route path="/student/clearance" element={<StudentClearancePage />} />
          <Route path="/student/profile" element={<ProfileAvatarPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['Admin']} />}>
        <Route element={<PortalLayout role="admin" />}>
          <Route path="/admin/dashboard" element={<AdminAccountDashboardPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/user-archive" element={<AdminUsersPage archive />} />
          <Route path="/admin/approvals" element={<AccountApprovalsPage />} />
          <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
          <Route path="/admin/clearance" element={<AdminClearancePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['Librarian']} />}>
        <Route element={<PortalLayout role="librarian" />}>
          <Route path="/librarian/dashboard" element={<AdminDashboardPage />} />
          <Route path="/librarian/catalog" element={<CatalogManagementPage />} />
          <Route path="/librarian/book-archive" element={<BookArchivePage />} />
          <Route path="/librarian/categories" element={<CategoryManagementPage />} />
          <Route path="/librarian/circulation" element={<AdminCirculationMonitor />} />
          <Route path="/librarian/reservations" element={<AdminReservationQueuePage />} />
          <Route path="/librarian/fines" element={<AdminFinesPage />} />
          <Route path="/librarian/invoices" element={<AdminInvoicesPage />} />
          <Route path="/librarian/inventory" element={<InventoryDashboard />} />
          <Route path="/librarian/floor-plan" element={<FloorPlanImagePage />} />
          <Route path="/librarian/printing" element={<AdminPrintingQueuePage />} />
          <Route path="/librarian/supplies" element={<AdminPrintSuppliesPage />} />
          <Route path="/librarian/attendance" element={<AdminAttendancePage />} />
          <Route path="/librarian/clearance" element={<AdminClearancePage />} />
          <Route path="/librarian/announcements" element={<AdminAnnouncementsPage />} />
          <Route path="/librarian/profile" element={<ProfileAvatarPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute roles={['Staff']} />}>
        <Route element={<PortalLayout role="staff" />}>
          <Route path="/staff/dashboard" element={<StaffDashboardPage />} />
          <Route path="/staff/circulation" element={<AdminCirculationMonitor />} />
          <Route path="/staff/reservations" element={<AdminReservationQueuePage />} />
          <Route path="/staff/printing" element={<StaffPrintingQueuePage />} />
          <Route path="/staff/attendance" element={<StaffAttendancePage />} />
          <Route path="/staff/announcements" element={<StaffAnnouncementsPage />} />
          <Route path="/staff/profile" element={<ProfileAvatarPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute roles={['Faculty']} />}>
        <Route element={<PortalLayout role="faculty" />}>
          <Route path="/faculty/dashboard" element={<UserDashboardPage />} />
          <Route path="/faculty/catalog" element={<BookCatalog />} />
          <Route path="/faculty/floor-plan" element={<FloorPlanImagePage />} />
          <Route path="/faculty/cart" element={<BookCart />} />
          <Route path="/faculty/research" element={<ResearchCatalog />} />
          <Route path="/faculty/borrowing" element={<BorrowingHistory />} />
          <Route path="/faculty/reservations" element={<StudentReservations />} />
          <Route path="/faculty/attendance" element={<UserAttendancePage />} />
          <Route path="/faculty/notifications" element={<NotificationCenterPage />} />
          <Route path="/faculty/fines" element={<StudentFinesPage />} />
          <Route path="/faculty/invoices" element={<MyInvoicesPage />} />
          <Route path="/faculty/clearance" element={<StudentClearancePage />} />
          <Route path="/faculty/profile" element={<ProfileAvatarPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
