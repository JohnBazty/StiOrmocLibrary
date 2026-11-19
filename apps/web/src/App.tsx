import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { PortalLayout } from './layouts/PortalLayout'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'

const ChangePasswordPage = lazy(() => import('./features/auth/ChangePasswordPage').then(m => ({ default: m.ChangePasswordPage })))
const PaymentResultPage = lazy(() => import('./features/payments/PaymentResultPage').then(m => ({ default: m.PaymentResultPage })))
const AdminPaymentsPage = lazy(() => import('./features/payments/AdminPaymentsPage').then(m => ({ default: m.AdminPaymentsPage })))
const LibraryFundsPage = lazy(() => import('./features/payments/LibraryFundsPage').then(m => ({ default: m.LibraryFundsPage })))
const UserPaymentsPage = lazy(() => import('./features/payments/UserPaymentsPage').then(m => ({ default: m.UserPaymentsPage })))

const StudentQrRosterPage = lazy(() => import('./features/users/StudentQrRosterPage').then(m => ({ default: m.StudentQrRosterPage })))

// Lazy-loaded pages - route-level code splitting
const UserAttendancePage = lazy(() => import('./features/attendance/UserAttendancePage').then(m => ({ default: m.UserAttendancePage })))
const AdminDashboardPage = lazy(() => import('./features/dashboard/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })))
const AdminAccountDashboardPage = lazy(() => import('./features/dashboard/AdminAccountDashboardPage').then(m => ({ default: m.AdminAccountDashboardPage })))
const StaffDashboardPage = lazy(() => import('./features/dashboard/StaffDashboardPage').then(m => ({ default: m.StaffDashboardPage })))
const ProfileAvatarPage = lazy(() => import('./features/users/ProfileAvatarPage').then(m => ({ default: m.ProfileAvatarPage })))
const UserDashboardPage = lazy(() => import('./features/dashboard/UserDashboardPage').then(m => ({ default: m.UserDashboardPage })))
const FloorPlanImagePage = lazy(() => import('./features/floor-plan/FloorPlanImagePage').then(m => ({ default: m.FloorPlanImagePage })))
const BookRegisterPage = lazy(() => import('./features/catalog/BookRegisterPage').then(m => ({ default: m.BookRegisterPage })))
const BookArchivePage = lazy(() => import('./features/catalog/BookArchivePage').then(m => ({ default: m.BookArchivePage })))
const AdminAttendancePage = lazy(() => import('./features/attendance/AdminAttendancePage').then(m => ({ default: m.AdminAttendancePage })))
const StaffAttendancePage = lazy(() => import('./features/attendance/StaffAttendancePage').then(m => ({ default: m.StaffAttendancePage })))
const AdminUsersPage = lazy(() => import('./features/users/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })))
const EnrollmentPage = lazy(() => import('./features/users/EnrollmentPage').then(m => ({ default: m.EnrollmentPage })))
const CatalogManagementPage = lazy(() => import('./features/catalog/CatalogManagementPage').then(m => ({ default: m.CatalogManagementPage })))
const CategoryManagementPage = lazy(() => import('./features/categories/CategoryManagementPage').then(m => ({ default: m.CategoryManagementPage })))
const AdminReservationQueuePage = lazy(() => import('./features/reservations/AdminReservationQueuePage').then(m => ({ default: m.AdminReservationQueuePage })))
const AuthenticatedInbox=lazy(()=>import('./features/auth/ProtectedRoute').then(m=>({default:m.AuthenticatedInbox})))
const AuthenticatedHome = lazy(() => import('./features/auth/ProtectedRoute').then(m => ({ default: m.AuthenticatedHome })))
const ProtectedRoute = lazy(() => import('./features/auth/ProtectedRoute').then(m => ({ default: m.ProtectedRoute })))
const LoginPage = lazy(() => import('./features/auth/LoginPage').then(m => ({ default: m.LoginPage })))
const RegistrationPage = lazy(() => import('./features/auth/RegistrationPage').then(m => ({ default: m.RegistrationPage })))
const ResetPasswordPage=lazy(()=>import('./features/auth/ResetPasswordPage').then(m=>({default:m.ResetPasswordPage})))
const AdminPasswordSetupPage=lazy(()=>import('./features/auth/AdminPasswordSetupPage').then(m=>({default:m.AdminPasswordSetupPage})))
const PublicAuthLayout = lazy(() => import('./features/auth/PublicAuthLayout').then(m => ({ default: m.PublicAuthLayout })))
const PaymentWalletPage = lazy(() => import('./features/payments/PaymentWalletPage').then(m => ({ default: m.PaymentWalletPage })))
const AdminLoginPage = lazy(() => import('./features/auth/AdminLoginPage').then(m => ({ default: m.AdminLoginPage })))
const PasswordRecoveryPage = lazy(() => import('./features/auth/PasswordRecoveryPage').then(m => ({ default: m.PasswordRecoveryPage })))
const LibrarianNotificationsPage = lazy(() => import('./features/notifications/LibrarianNotificationsPage').then(m => ({ default: m.LibrarianNotificationsPage })))
const InventoryDashboard = lazy(() => import('./features/inventory/InventoryDashboard').then(m => ({ default: m.InventoryDashboard })))
const StocktakePage = lazy(() => import('./features/inventory/StocktakePage').then(m => ({ default: m.StocktakePage })))
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
const LibrarySchedulePage = lazy(() => import('./features/notifications/LibrarySchedulePage').then(m => ({ default: m.LibrarySchedulePage })))
const WorkspaceNotificationsPage = lazy(() => import('./features/notifications/WorkspaceNotificationsPage').then(m => ({ default: m.WorkspaceNotificationsPage })))
const AdminAnnouncementsPage = lazy(() => import('./features/notifications/AdminAnnouncementsPage').then(m => ({ default: m.AdminAnnouncementsPage })))
const StaffAnnouncementsPage = lazy(() => import('./features/notifications/StaffAnnouncementsPage').then(m => ({ default: m.StaffAnnouncementsPage })))
const StudentClearancePage = lazy(() => import('./features/clearance/StudentClearancePage').then(m => ({ default: m.StudentClearancePage })))
const AdminClearancePage = lazy(() => import('./features/clearance/AdminClearancePage').then(m => ({ default: m.AdminClearancePage })))
const AdminFinePoliciesPage = lazy(() => import('./features/fines/AdminFinePoliciesPage').then(m => ({ default: m.AdminFinePoliciesPage })))
const AdminFinesPage = lazy(() => import('./features/fines/AdminFinesPage').then(m => ({ default: m.AdminFinesPage })))
const StudentFinesPage = lazy(() => import('./features/fines/StudentFinesPage').then(m => ({ default: m.StudentFinesPage })))
const AdminBorrowingPoliciesPage = lazy(() => import('./features/borrowing-policies/AdminBorrowingPoliciesPage').then(m => ({ default: m.AdminBorrowingPoliciesPage })))
const CatalogMaintenancePage = lazy(() => import('./features/catalog/CatalogMaintenancePage').then(m => ({ default: m.CatalogMaintenancePage })))
const CatalogWorkspace = lazy(() => import('./features/catalog/CatalogWorkspace').then(m => ({ default: m.CatalogWorkspace })))
const CatalogReportsPage = lazy(() => import('./features/catalog/CatalogReportsPage').then(m => ({ default: m.CatalogReportsPage })))

const loadingFallback = <div className="flex min-h-screen items-center justify-center bg-[#0b5ea2]/5"><div className="text-center"><div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#0b5ea2] border-t-transparent"></div><p className="text-sm text-[#0b5ea2]/65">Loading...</p></div></div>

function NotFound() {
  return <div className="flex min-h-screen items-center justify-center bg-[#0b5ea2]/5 p-6 text-center"><div><p className="text-sm font-bold text-[#0b5ea2]">404</p><h1 className="mt-2 font-display text-3xl font-bold text-[#0b5ea2]">This shelf is empty.</h1><p className="mt-2 text-sm text-[#0b5ea2]/65">The page you requested is not part of the library system.</p><a href="/" className="mt-5 inline-flex rounded-xl bg-[#0b5ea2] px-4 py-2.5 text-sm font-bold text-[#FFFFFF]">Return to library</a></div></div>
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  return <RouteErrorBoundary resetKey={pathname}><Suspense fallback={loadingFallback}>{children}</Suspense></RouteErrorBoundary>
}

export default function App() {
  return (
    <Routes>
      <Route path="/inbox" element={<AppLayout><AuthenticatedInbox/></AppLayout>} />
      <Route path="/workspace" element={<AppLayout><AuthenticatedHome /></AppLayout>} />
      <Route element={<AppLayout><PublicAuthLayout /></AppLayout>}>
        <Route path="/" element={null} />
        <Route path="/login" element={<AppLayout><LoginPage popup /></AppLayout>} />
        <Route path="/register" element={<AppLayout><RegistrationPage popup /></AppLayout>} />
      </Route>
      <Route path="/admin/login" element={<Navigate to="/staff" replace />} />
      <Route path="/staff" element={<AppLayout><AdminLoginPage /></AppLayout>} />
      <Route path="/administrator-setup" element={<AppLayout><AdminPasswordSetupPage /></AppLayout>} />
      <Route path="/reset-password" element={<AppLayout><ResetPasswordPage /></AppLayout>} />
      <Route path="/forgot-password" element={<AppLayout><PasswordRecoveryPage /></AppLayout>} />
      <Route path="/change-password" element={<AppLayout><ChangePasswordPage /></AppLayout>} />
      <Route element={<AppLayout><ProtectedRoute roles={['Student', 'Faculty']} /></AppLayout>}>
        <Route path="/payments/result" element={<AppLayout><PaymentResultPage /></AppLayout>} />
        <Route path="/payments/wallet" element={<AppLayout><PaymentWalletPage /></AppLayout>} />
      </Route>

      <Route element={<AppLayout><ProtectedRoute roles={['Student']} /></AppLayout>}>
        <Route element={<AppLayout><PortalLayout role="student" /></AppLayout>}>
          <Route path="/student/dashboard" element={<AppLayout><UserDashboardPage /></AppLayout>} />
          <Route path="/student/transactions" element={<AppLayout><UserPaymentsPage /></AppLayout>} />
          <Route path="/student/payments" element={<Navigate to="/student/transactions" replace />} />
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
          <Route path="/student/library-schedule" element={<AppLayout><LibrarySchedulePage /></AppLayout>} />
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
          <Route path="/admin/users/faculty-enrollment" element={<AppLayout><EnrollmentPage area="admin" role="Faculty" /></AppLayout>} />
          <Route path="/admin/users/enrollment" element={<AppLayout><EnrollmentPage area="admin" /></AppLayout>} />
          <Route path="/admin/student-qr-roster" element={<AppLayout><StudentQrRosterPage /></AppLayout>} />
          <Route path="/admin/user-archive" element={<Navigate to="/admin/student-qr-roster" replace />} />
          <Route path="/admin/approvals" element={<Navigate to="/admin/users" replace />} />
          <Route path="/admin/library-schedule" element={<AppLayout><LibrarySchedulePage /></AppLayout>} />
          <Route path="/admin/notifications" element={<AppLayout><WorkspaceNotificationsPage workspace="admin" /></AppLayout>} />
          <Route path="/admin/clearance" element={<AppLayout><AdminClearancePage /></AppLayout>} />
        </Route>
      </Route>

      <Route element={<AppLayout><ProtectedRoute roles={['Librarian']} /></AppLayout>}>
        <Route element={<AppLayout><PortalLayout role="librarian" /></AppLayout>}>
          <Route path="/librarian/dashboard" element={<AppLayout><AdminDashboardPage /></AppLayout>} />
          <Route path="/librarian/payments" element={<AppLayout><AdminPaymentsPage /></AppLayout>} />
          <Route path="/librarian/funds" element={<AppLayout><LibraryFundsPage /></AppLayout>} />
          <Route path="/librarian/accounts" element={<Navigate to="/librarian/users" replace />} />
          <Route path="/librarian/users" element={<AppLayout><AdminUsersPage /></AppLayout>} />
          <Route path="/librarian/users/faculty-enrollment" element={<AppLayout><EnrollmentPage role="Faculty" /></AppLayout>} />
          <Route path="/librarian/users/enrollment" element={<AppLayout><EnrollmentPage /></AppLayout>} />
          <Route path="/librarian/student-qr-roster" element={<AppLayout><StudentQrRosterPage /></AppLayout>} />
          <Route path="/librarian/user-archive" element={<Navigate to="/librarian/student-qr-roster" replace />} />
          <Route path="/librarian/approvals" element={<Navigate to="/librarian/users" replace />} />
          <Route path="/librarian/library-schedule" element={<Navigate to="/librarian/maintenance?tab=schedule" replace />} />
          <Route path="/librarian/notifications" element={<AppLayout><LibrarianNotificationsPage /></AppLayout>} />
          <Route path="/librarian/borrowing-policies" element={<AppLayout><AdminBorrowingPoliciesPage /></AppLayout>} />
          <Route path="/librarian/catalog" element={<AppLayout><CatalogWorkspace /></AppLayout>} />
          <Route path="/librarian/maintenance" element={<AppLayout><CatalogMaintenancePage /></AppLayout>} />
          <Route path="/librarian/reports" element={<AppLayout><CatalogReportsPage /></AppLayout>} />
          <Route path="/librarian/collection-review" element={<Navigate to="/librarian/maintenance" replace />} />
          <Route path="/librarian/book-register" element={<Navigate to="/librarian/catalog" replace />} />
          <Route path="/librarian/book-archive" element={<AppLayout><BookArchivePage /></AppLayout>} />
          <Route path="/librarian/categories" element={<AppLayout><CategoryManagementPage /></AppLayout>} />
          <Route path="/librarian/circulation" element={<AppLayout><AdminCirculationMonitor /></AppLayout>} />
          <Route path="/librarian/reservations" element={<AppLayout><AdminReservationQueuePage /></AppLayout>} />
          <Route path="/librarian/fine-policies" element={<Navigate to="/librarian/maintenance?tab=fine-rules" replace />} />
          <Route path="/librarian/fines" element={<AppLayout><AdminFinesPage /></AppLayout>} />
          <Route path="/librarian/inventory" element={<AppLayout><InventoryDashboard /></AppLayout>} />
          <Route path="/librarian/inventory/stocktake" element={<AppLayout><StocktakePage /></AppLayout>} />
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
          <Route path="/staff/payments" element={<AppLayout><AdminPaymentsPage /></AppLayout>} />
          <Route path="/staff/circulation" element={<AppLayout><AdminCirculationMonitor /></AppLayout>} />
          <Route path="/staff/reservations" element={<AppLayout><AdminReservationQueuePage /></AppLayout>} />
          <Route path="/staff/printing" element={<AppLayout><StaffPrintingQueuePage /></AppLayout>} />
          <Route path="/staff/attendance" element={<AppLayout><StaffAttendancePage /></AppLayout>} />
          <Route path="/staff/announcements" element={<AppLayout><StaffAnnouncementsPage /></AppLayout>} />
          <Route path="/staff/library-schedule" element={<AppLayout><LibrarySchedulePage /></AppLayout>} />
          <Route path="/staff/notifications" element={<AppLayout><WorkspaceNotificationsPage workspace="staff" /></AppLayout>} />
          <Route path="/staff/profile" element={<AppLayout><ProfileAvatarPage /></AppLayout>} />
        </Route>
      </Route>
      <Route element={<AppLayout><ProtectedRoute roles={['Faculty']} /></AppLayout>}>
        <Route element={<AppLayout><PortalLayout role="faculty" /></AppLayout>}>
          <Route path="/faculty/dashboard" element={<AppLayout><UserDashboardPage /></AppLayout>} />
          <Route path="/faculty/transactions" element={<AppLayout><UserPaymentsPage /></AppLayout>} />
          <Route path="/faculty/printing" element={<AppLayout><StudentPrintingPage /></AppLayout>} />
          <Route path="/faculty/payments" element={<Navigate to="/faculty/transactions" replace />} />
          <Route path="/faculty/catalog" element={<AppLayout><LegacyCatalogRedirect /></AppLayout>} />
          <Route path="/faculty/library" element={<AppLayout><BookCatalog /></AppLayout>} />
          <Route path="/faculty/floor-plan" element={<AppLayout><FloorPlanImagePage /></AppLayout>} />
          <Route path="/faculty/cart" element={<AppLayout><BookCart /></AppLayout>} />
          <Route path="/faculty/research" element={<AppLayout><ResearchCatalog /></AppLayout>} />
          <Route path="/faculty/borrowing" element={<AppLayout><BorrowingHistory /></AppLayout>} />
          <Route path="/faculty/my-books" element={<AppLayout><MyBooksPage /></AppLayout>} />
          <Route path="/faculty/reservations" element={<AppLayout><StudentReservations /></AppLayout>} />
          <Route path="/faculty/attendance" element={<AppLayout><UserAttendancePage /></AppLayout>} />
          <Route path="/faculty/library-schedule" element={<AppLayout><LibrarySchedulePage /></AppLayout>} />
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
