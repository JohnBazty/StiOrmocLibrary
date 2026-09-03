import { Route, Routes } from 'react-router-dom'
import { PortalLayout } from './layouts/PortalLayout'
import { StudentAttendancePage, StudentDashboard } from './pages/student/StudentPages'
import {
  AdminDashboard,
  ReportsPage,
} from './pages/admin/AdminPages'
import { AdminAttendancePage } from './features/attendance/AdminAttendancePage'
import { AdminUsersPage } from './features/users/AdminUsersPage'
import { CatalogManagementPage } from './features/catalog/CatalogManagementPage'
import { CategoryManagementPage } from './features/categories/CategoryManagementPage'
import { AdminReservationQueuePage } from './features/reservations/AdminReservationQueuePage'
import { AuthenticatedHome, ProtectedRoute } from './features/auth/ProtectedRoute'
import { LoginPage } from './features/auth/LoginPage'
import { RegistrationPage } from './features/auth/RegistrationPage'
import { AdminLoginPage } from './features/auth/AdminLoginPage'
import { RoleDashboardPage } from './features/auth/RoleDashboardPage'
import { InventoryDashboard } from './features/inventory/InventoryDashboard'
import { BookCatalog } from './features/catalog/BookCatalog'
import { ResearchCatalog } from './features/catalog/ResearchCatalog'
import { BorrowingHistory } from './features/circulation/BorrowingHistory'
import { AdminCirculationMonitor } from './features/circulation/AdminCirculationMonitor'
import { StudentReservations } from './features/reservations/StudentReservations'
import { BookCart } from './features/catalog/BookCart'
import { StudentPrintingPage } from './features/printing/StudentPrintingPage'
import { AdminPrintingQueuePage } from './features/printing/AdminPrintingQueuePage'
import { AdminPrintSuppliesPage } from './features/printing/AdminPrintSuppliesPage'
import { NotificationCenterPage } from './features/notifications/NotificationCenterPage'
import { AdminAnnouncementsPage } from './features/notifications/AdminAnnouncementsPage'
import { StudentClearancePage } from './features/clearance/StudentClearancePage'
import { AdminClearancePage } from './features/clearance/AdminClearancePage'
import { AdminFinesPage } from './features/fines/AdminFinesPage'
import { StudentFinesPage } from './features/fines/StudentFinesPage'

function NotFound() {
  return <div className="flex min-h-screen items-center justify-center bg-[#003399]/5 p-6 text-center"><div><p className="text-sm font-bold text-[#003399]">404</p><h1 className="mt-2 font-display text-3xl font-bold text-[#003399]">This shelf is empty.</h1><p className="mt-2 text-sm text-[#003399]/65">The page you requested is not part of SmartLib.</p><a href="/" className="mt-5 inline-flex rounded-xl bg-[#003399] px-4 py-2.5 text-sm font-bold text-[#FFFFFF]">Return to library</a></div></div>
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
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/student/catalog" element={<BookCatalog />} />
          <Route path="/student/cart" element={<BookCart />} />
          <Route path="/student/research" element={<ResearchCatalog />} />
          <Route path="/student/borrowing" element={<BorrowingHistory />} />
          <Route path="/student/reservations" element={<StudentReservations />} />
          <Route path="/student/printing" element={<StudentPrintingPage />} />
          <Route path="/student/attendance" element={<StudentAttendancePage />} />
          <Route path="/student/notifications" element={<NotificationCenterPage />} />
          <Route path="/student/fines" element={<StudentFinesPage />} />
          <Route path="/student/clearance" element={<StudentClearancePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['Admin']} />}>
        <Route element={<PortalLayout role="admin" />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/catalog" element={<CatalogManagementPage />} />
          <Route path="/admin/categories" element={<CategoryManagementPage />} />
          <Route path="/admin/circulation" element={<AdminCirculationMonitor />} />
          <Route path="/admin/reservations" element={<AdminReservationQueuePage />} />
          <Route path="/admin/fines" element={<AdminFinesPage />} />
          <Route path="/admin/inventory" element={<InventoryDashboard />} />
          <Route path="/admin/printing" element={<AdminPrintingQueuePage />} />
          <Route path="/admin/supplies" element={<AdminPrintSuppliesPage />} />
          <Route path="/admin/attendance" element={<AdminAttendancePage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/clearance" element={<AdminClearancePage />} />
          <Route path="/admin/announcements" element={<AdminAnnouncementsPage />} />
          <Route path="/admin/reports" element={<ReportsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['Librarian']} />}>
        <Route path="/librarian/dashboard" element={<RoleDashboardPage role="Librarian" />} />
      </Route>
      <Route element={<ProtectedRoute roles={['Faculty']} />}>
        <Route element={<PortalLayout role="faculty" />}>
          <Route path="/faculty/dashboard" element={<RoleDashboardPage role="Faculty" />} />
          <Route path="/faculty/catalog" element={<BookCatalog />} />
          <Route path="/faculty/cart" element={<BookCart />} />
          <Route path="/faculty/research" element={<ResearchCatalog />} />
          <Route path="/faculty/borrowing" element={<BorrowingHistory />} />
          <Route path="/faculty/reservations" element={<StudentReservations />} />
          <Route path="/faculty/notifications" element={<NotificationCenterPage />} />
          <Route path="/faculty/fines" element={<StudentFinesPage />} />
          <Route path="/faculty/clearance" element={<StudentClearancePage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
