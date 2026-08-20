import { Route, Routes } from 'react-router-dom'
import { PortalLayout } from './layouts/PortalLayout'
import {
  BorrowingPage, CatalogPage, ClearancePage, NotificationsPage, PrintingPage, ResearchPage,
  StudentAttendancePage, StudentDashboard, StudentReservationsPage,
} from './pages/student/StudentPages'
import {
  AdminAttendancePage, AdminClearancePage, AdminDashboard, CirculationPage, FinesPage,
  PrintingManagementPage, ReportsPage, SuppliesPage, UsersPage,
} from './pages/admin/AdminPages'
import { CatalogManagementPage } from './features/catalog/CatalogManagementPage'
import { CategoryManagementPage } from './features/categories/CategoryManagementPage'
import { AdminReservationQueuePage } from './features/reservations/AdminReservationQueuePage'
import { AuthenticatedHome, ProtectedRoute } from './features/auth/ProtectedRoute'
import { LoginPage } from './features/auth/LoginPage'
import { RegistrationPage } from './features/auth/RegistrationPage'
import { AdminLoginPage } from './features/auth/AdminLoginPage'
import { RoleDashboardPage } from './features/auth/RoleDashboardPage'
import { InventoryDashboard } from './features/inventory/InventoryDashboard'

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
          <Route path="/student/catalog" element={<CatalogPage />} />
          <Route path="/student/research" element={<ResearchPage />} />
          <Route path="/student/borrowing" element={<BorrowingPage />} />
          <Route path="/student/reservations" element={<StudentReservationsPage />} />
          <Route path="/student/printing" element={<PrintingPage />} />
          <Route path="/student/attendance" element={<StudentAttendancePage />} />
          <Route path="/student/notifications" element={<NotificationsPage />} />
          <Route path="/student/clearance" element={<ClearancePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['Admin']} />}>
        <Route element={<PortalLayout role="admin" />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/catalog" element={<CatalogManagementPage />} />
          <Route path="/admin/categories" element={<CategoryManagementPage />} />
          <Route path="/admin/circulation" element={<CirculationPage />} />
          <Route path="/admin/reservations" element={<AdminReservationQueuePage />} />
          <Route path="/admin/fines" element={<FinesPage />} />
          <Route path="/admin/inventory" element={<InventoryDashboard />} />
          <Route path="/admin/printing" element={<PrintingManagementPage />} />
          <Route path="/admin/supplies" element={<SuppliesPage />} />
          <Route path="/admin/attendance" element={<AdminAttendancePage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/clearance" element={<AdminClearancePage />} />
          <Route path="/admin/reports" element={<ReportsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['Librarian']} />}>
        <Route path="/librarian/dashboard" element={<RoleDashboardPage role="Librarian" />} />
      </Route>
      <Route element={<ProtectedRoute roles={['Faculty']} />}>
        <Route path="/faculty/dashboard" element={<RoleDashboardPage role="Faculty" />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
