import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { PortalLayout } from './layouts/PortalLayout'

// Lazy-loaded pages - route-level code splitting
const UserAttendancePage = lazy(() => import('./features/attendance/UserAttendancePage').then(m => ({ default: m.UserAttendancePage })))
const AdminDashboardPage = lazy(() => import('./features/dashboard/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })))
const AdminAccountDashboardPage = lazy(() => import('./features/dashboard/AdminAccountDashboardPage').then(m => ({ default: m.AdminAccountDashboardPage })))
const StaffDashboardPage = lazy(() => import('./features/dashboard/StaffDashboardPage').then(m => ({ default: m.StaffDashboardPage })))
const ProfileAvatarPage = lazy(() => import('./features/users/ProfileAvatarPage').then(m => ({ default: m.ProfileAvatarPage })))
const UserDashboardPage = lazy(() => import('./features/dashboard/UserDashboardPage').then(m => ({ default: m.UserDashboardPage })))
const FloorPlanImagePage = lazy(() => import('./features/floor-plan/FloorPlanImagePage').then(m => ({ default: m.FloorPlanImagePage })))
const BookArchivePage = lazy(() => import('./features/catalog/BookArchivePage').then(m => ({ default: m.BookArchivePage })))
const AdminAttendancePage = lazy(() => import('./features/attendance/AdminAttendancePage').then(m => ({ default: m.AdminAttendancePage })))
const StaffAttendancePage = lazy(() => import('./features/attendance/StaffAttendancePage').then(m => ({ default: m.StaffAttendancePage })))
const AdminUsersPage = lazy(() => import('./features/users/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })))
const EnrollmentPage = lazy(() => import('./features/users/EnrollmentPage').then(m => ({ default: m.EnrollmentPage })))
const CatalogManagementPage = lazy(() => import('./features/catalog/CatalogManagementPage').then(m => ({ default: m.CatalogManagementPage })))
const CategoryManagementPage = lazy(() => import('./features/categories/CategoryManagementPage').then(m => ({ default: m.CategoryManagementPage })))
const AdminReservationQueuePage = lazy(() => import('./features/reservations/AdminReservationQueuePage').then(m => ({ default: m.AdminReservationQueuePage })))
const AuthenticatedHome = lazy(() => import('./features/auth/ProtectedRoute').then(m => ({ default: m.AuthenticatedHome })))
const ProtectedRoute = lazy(() => import('./features/auth/ProtectedRoute').then(m => ({ default: m.ProtectedRoute })))
const LoginPage = lazy(() => import('./features/auth/LoginPage').then(m => ({ default: m.LoginPage })))
const RegistrationPage = lazy(() => import('./features/auth/RegistrationPage').then(m => ({ default: m.RegistrationPage })))
const PublicAuthLayout = lazy(() => import('./features/auth/PublicAuthLayout').then(m => ({ default: m.PublicAuthLayout })))
const AdminLoginPage = lazy(() => import('./features/auth/AdminLoginPage').then(m => ({ default: m.AdminLoginPage })))
const PasswordRecoveryPage = lazy(() => import('./features/auth/PasswordRecoveryPage').then(m => ({ default: m.PasswordRecoveryPage })))
const LibrarianNotificationsPage = lazy(() => import('./features/notifications/LibrarianNotificationsPage').then(m => ({ default: m.LibrarianNotificationsPage })))
const InventoryDashboard = lazy(() => import('./features/inventory/InventoryDashboard').then(m => ({ default: m.InventoryDashboard })))
const BookCatalog = lazy(() => import('./features/catalog/BookCatalog').then(m => ({ default: m.BookCatalog })))
const LegacyCatalogRedirect = lazy(() => import('./features/catalog/LegacyCatalogRedirect').then(m => ({ default: m.LegacyCatalogRedirect })))
const ResearchCatalog = lazy(() => import('./features/catalog/ResearchCatalog').then(m => ({ default: m.ResearchCatalog })))
const BorrowingHistory = lazy(() => import('./features/circulation/BorrowingHistory').then(m => ({ default: m.BorrowingHistory })))
const AdminCirculationMonitor = lazy(() => import('./features/circulation/AdminCirculationMonitor').then(m => ({ default: m.AdminCirculationMonitor })))
const StudentReservations = lazy(() => import('./features/reservations/StudentReservations').then(m => ({ default: m.StudentReservations })))
const MyBooksPage = lazy(() => import('./features/catalog/MyBooksPage').then(m => ({ default: m.MyBooksPage })))
const BookCart = lazy(() => import('./features/catalog/BookCart').then(m => ({ default: m.BookCart })))
const StudentPrintingPage = lazy(() => import('./features/printing/StudentPrintingPage').then(m => ({ default: m.StudentPrintingPage })))
const AdminPrintingQueuePage = lazy(() => import('./features/printing/AdminPrintingQueuePage').then(m => ({ default: m.AdminPrintingQueuePage })))
const StaffPrintingQueuePage = lazy(() => import('./features/printing/StaffPrintingQueuePage').then(m => ({ default: m.StaffPrintingQueuePage })))
const AdminPrintSuppliesPage = lazy(() => import('./features/printing/AdminPrintSuppliesPage').then(m => ({ default: m.AdminPrintSuppliesPage })))
const NotificationCenterPage = lazy(() => import('./features/notifications/NotificationCenterPage').then(m => ({ default: m.NotificationCenterPage })))
const AdminNotificationsPage = lazy(() => import('./features/notifications/AdminNotificationsPage').then(m => ({ default: m.AdminNotificationsPage })))
const AdminAnnouncementsPage = lazy(() => import('./features/notifications/AdminAnnouncementsPage').then(m => ({ default: m.AdminAnnouncementsPage })))
const StaffAnnouncementsPage = lazy(() => import('./features/notifications/StaffAnnouncementsPage').then(m => ({ default: m.StaffAnnouncementsPage })))
const StudentClearancePage = lazy(() => import('./features/clearance/StudentClearancePage').then(m => ({ default: m.StudentClearancePage })))
const AdminClearancePage = lazy(() => import('./features/clearance/AdminClearancePage').then(m => ({ default: m.AdminClearancePage })))
const AdminFinesPage = lazy(() => import('./features/fines/AdminFinesPage').then(m => ({ default: m.AdminFinesPage })))
const StudentFinesPage = lazy(() => import('./features/fines/StudentFinesPage').then(m => ({ default: m.StudentFinesPage })))
const PublicCatalogPage = lazy(() => import('./features/catalog/PublicCatalogPage').then(m => ({ default: m.PublicCatalogPage })))
const BorrowingPoliciesArchivedPage = lazy(() => import('./features/borrowing-policies/BorrowingPoliciesArchivedPage').then(m => ({ default: m.BorrowingPoliciesArchivedPage })))
const CatalogMaintenancePage = lazy(() => import('./features/catalog/CatalogMaintenancePage').then(m => ({ default: m.CatalogMaintenancePage })))
const CatalogReportsPage = lazy(() => import('./features/catalog/CatalogReportsPage').then(m => ({ default: m.CatalogReportsPage })))
const CollectionReviewPage = lazy(() => import('./features/catalog/CollectionReviewPage').then(m => ({ default: m.CollectionReviewPage })))

const loadingFallback = <div className="flex min-h-screen items-center justify-center bg-[#003399]/5"><div className="text-center"><div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#003399] border-t-transparent"></div><p className="text-sm text-[#003399]/65">Loading...</p></div></div>

function NotFound() {
  return <div className="flex min-h-screen items-center justify-center bg-[#003399]/5 p-6 text-center"><div><p className="text-sm font-bold text-[#003399]">404</p><h1 className="mt-2 font-display text-3xl font-bold text-[#003399]">This shelf is empty.</h1><p className="mt-2 text-sm text-[#003399]/65">The page you requested is not part of the library system.</p><a href="/" className="mt-5 inline-flex rounded-xl bg-[#003399] px-4 py-2.5 text-sm font-bold text-[#FFFFFF]">Return to library</a></div></div>
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={loadingFallback}>{children}</Suspense>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout><PublicCatalogPage restoreDevice /></AppLayout>} />
      <Route path="/workspace" element={<AppLayout><AuthenticatedHome /></AppLayout>} />
      <Route element={<AppLayout><PublicAuthLayout /></AppLayout>}>
        <Route path="/login" element={<AppLayout><LoginPage popup /></AppLayout>} />
        <Route path="/register" element={<AppLayout><RegistrationPage popup /></AppLayout>} />
      </Route>
      <Route path="/admin/login" element={<Navigate to="/staff" replace />} />
      <Route path="/staff" element={<AppLayout><AdminLoginPage /></AppLayout>} />
      <Route path="/forgot-password" element={<AppLayout><PasswordRecoveryPage /></AppLayout>} />

      <Route element={<AppLayout><ProtectedRoute roles={['Student']} /></AppLayout>}>
        <Route element={<AppLayout><PortalLayout role="student" /></AppLayout>}>
          <Route path="/student/dashboard" element={<AppLayout><UserDashboardPage /></AppLayout>} />
          <Route path="/student/catalog" element={<AppLayout><LegacyCatalogRedirect /></AppLayout>} />
          <Route path="/student/library" element={<AppLayout><BookCatalog /></AppLayout>} />
          <Route path="/student/floor-plan" element={<AppLayout><FloorPlanImagePage /></AppLayout>} />
          <Route path="/student/cart" element={<AppLayout><BookCart /></AppLayout>} />
          <Route path="/student/research" element={<AppLayout><ResearchCatalog /></AppLayout>} />
          <Route path="/student/borrowing" element={<AppLayout><BorrowingHistory /></AppLayout>} />
          <Route path="/student/my-books" element={<AppLayout><MyBooksPage /></AppLayout>} />
          <Route path="/student/reservations" element={<AppLayout><StudentReservations /></AppLayout>} />
          <Route path="/student/printing" element={<AppLayout><StudentPrintingPage /></AppLayout>} />
          <Route path="/student/attendance" element={<AppLayout><UserAttendancePage /></AppLayout>} />
          <Route path="/student/notifications" element={<AppLayout><NotificationCenterPage /></AppLayout>} />
          <Route path="/student/fines" element={<AppLayout><StudentFinesPage /></AppLayout>} />
          <Route path="/student/clearance" element={<AppLayout><StudentClearancePage /></AppLayout>} />
          <Route path="/student/profile" element={<AppLayout><ProfileAvatarPage /></AppLayout>} />
        </Route>
      </Route>

      <Route element={<AppLayout><ProtectedRoute roles={['Admin']} /></AppLayout>}>
        <Route element={<AppLayout><PortalLayout role="admin" /></AppLayout>}>
          <Route path="/admin/dashboard" element={<AppLayout><AdminAccountDashboardPage /></AppLayout>} />
          <Route path="/admin/users" element={<AppLayout><AdminUsersPage /></AppLayout>} />
          <Route path="/admin/users/enrollment" element={<AppLayout><EnrollmentPage area="admin" /></AppLayout>} />
          <Route path="/admin/user-archive" element={<AppLayout><AdminUsersPage archive /></AppLayout>} />
          <Route path="/admin/approvals" element={<Navigate to="/admin/users" replace />} />
          <Route path="/admin/notifications" element={<AppLayout><AdminNotificationsPage /></AppLayout>} />
          <Route path="/admin/clearance" element={<AppLayout><AdminClearancePage /></AppLayout>} />
        </Route>
      </Route>

      <Route element={<AppLayout><ProtectedRoute roles={['Librarian']} /></AppLayout>}>
        <Route element={<AppLayout><PortalLayout role="librarian" /></AppLayout>}>
          <Route path="/librarian/dashboard" element={<AppLayout><AdminDashboardPage /></AppLayout>} />
          <Route path="/librarian/accounts" element={<AppLayout><AdminAccountDashboardPage /></AppLayout>} />
          <Route path="/librarian/users" element={<AppLayout><AdminUsersPage /></AppLayout>} />
          <Route path="/librarian/users/enrollment" element={<AppLayout><EnrollmentPage /></AppLayout>} />
          <Route path="/librarian/user-archive" element={<AppLayout><AdminUsersPage archive /></AppLayout>} />
          <Route path="/librarian/approvals" element={<Navigate to="/librarian/users" replace />} />
          <Route path="/librarian/notifications" element={<AppLayout><LibrarianNotificationsPage /></AppLayout>} />
          <Route path="/librarian/catalog" element={<Navigate to="/librarian/maintenance" replace />} />
          <Route path="/librarian/borrowing-policies" element={<AppLayout><BorrowingPoliciesArchivedPage /></AppLayout>} />
          <Route path="/librarian/maintenance" element={<AppLayout><CatalogMaintenancePage /></AppLayout>} />
          <Route path="/librarian/reports" element={<AppLayout><CatalogReportsPage /></AppLayout>} />
          <Route path="/librarian/collection-review" element={<AppLayout><CollectionReviewPage /></AppLayout>} />
          <Route path="/librarian/book-archive" element={<AppLayout><BookArchivePage /></AppLayout>} />
          <Route path="/librarian/categories" element={<AppLayout><CategoryManagementPage /></AppLayout>} />
          <Route path="/librarian/circulation" element={<AppLayout><AdminCirculationMonitor /></AppLayout>} />
          <Route path="/librarian/reservations" element={<AppLayout><AdminReservationQueuePage /></AppLayout>} />
          <Route path="/librarian/fines" element={<AppLayout><AdminFinesPage /></AppLayout>} />
          <Route path="/librarian/inventory" element={<AppLayout><InventoryDashboard /></AppLayout>} />
          <Route path="/librarian/floor-plan" element={<AppLayout><FloorPlanImagePage /></AppLayout>} />
          <Route path="/librarian/printing" element={<AppLayout><AdminPrintingQueuePage /></AppLayout>} />
          <Route path="/librarian/supplies" element={<AppLayout><AdminPrintSuppliesPage /></AppLayout>} />
          <Route path="/librarian/attendance" element={<AppLayout><AdminAttendancePage /></AppLayout>} />
          <Route path="/librarian/clearance" element={<AppLayout><AdminClearancePage /></AppLayout>} />
          <Route path="/librarian/announcements" element={<AppLayout><AdminAnnouncementsPage /></AppLayout>} />
          <Route path="/librarian/profile" element={<AppLayout><ProfileAvatarPage /></AppLayout>} />
        </Route>
      </Route>
      <Route element={<AppLayout><ProtectedRoute roles={['Staff']} /></AppLayout>}>
        <Route element={<AppLayout><PortalLayout role="staff" /></AppLayout>}>
          <Route path="/staff/dashboard" element={<AppLayout><StaffDashboardPage /></AppLayout>} />
          <Route path="/staff/circulation" element={<AppLayout><AdminCirculationMonitor /></AppLayout>} />
          <Route path="/staff/reservations" element={<AppLayout><AdminReservationQueuePage /></AppLayout>} />
          <Route path="/staff/printing" element={<AppLayout><StaffPrintingQueuePage /></AppLayout>} />
          <Route path="/staff/attendance" element={<AppLayout><StaffAttendancePage /></AppLayout>} />
          <Route path="/staff/announcements" element={<AppLayout><StaffAnnouncementsPage /></AppLayout>} />
          <Route path="/staff/notifications" element={<AppLayout><NotificationCenterPage /></AppLayout>} />
          <Route path="/staff/profile" element={<AppLayout><ProfileAvatarPage /></AppLayout>} />
        </Route>
      </Route>
      <Route element={<AppLayout><ProtectedRoute roles={['Faculty']} /></AppLayout>}>
        <Route element={<AppLayout><PortalLayout role="faculty" /></AppLayout>}>
          <Route path="/faculty/dashboard" element={<AppLayout><UserDashboardPage /></AppLayout>} />
          <Route path="/faculty/catalog" element={<AppLayout><LegacyCatalogRedirect /></AppLayout>} />
          <Route path="/faculty/library" element={<AppLayout><BookCatalog /></AppLayout>} />
          <Route path="/faculty/floor-plan" element={<AppLayout><FloorPlanImagePage /></AppLayout>} />
          <Route path="/faculty/cart" element={<AppLayout><BookCart /></AppLayout>} />
          <Route path="/faculty/research" element={<AppLayout><ResearchCatalog /></AppLayout>} />
          <Route path="/faculty/borrowing" element={<AppLayout><BorrowingHistory /></AppLayout>} />
          <Route path="/faculty/my-books" element={<AppLayout><MyBooksPage /></AppLayout>} />
          <Route path="/faculty/reservations" element={<AppLayout><StudentReservations /></AppLayout>} />
          <Route path="/faculty/attendance" element={<AppLayout><UserAttendancePage /></AppLayout>} />
          <Route path="/faculty/notifications" element={<AppLayout><NotificationCenterPage /></AppLayout>} />
          <Route path="/faculty/fines" element={<AppLayout><StudentFinesPage /></AppLayout>} />
          <Route path="/faculty/clearance" element={<AppLayout><StudentClearancePage /></AppLayout>} />
          <Route path="/faculty/profile" element={<AppLayout><ProfileAvatarPage /></AppLayout>} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}