import { paymentAssuranceRouters, serviceChargeRouters } from './modules/payments/payment-assurance.integration.ts'
import { createAttendanceConfirmationRouters } from './modules/attendance/attendance-confirmation.routes.ts'
import cors from 'cors'
import express from 'express'
import session from 'express-session'
import helmet from 'helmet'
import multer from 'multer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './config/db.js'
import { env } from './config/env.js'
import { SqlSessionStore } from './core/sql-session-store.js'
import { HttpError } from './core/http-error.ts'
import { isDatabaseUnavailable } from './core/database-availability.ts'
import { checkSchemaReadiness, isMissingSchemaError } from './core/schema-readiness.ts'
import { registerModules } from './modules/index.ts'
import { dashboardForRole, ROLES, STAFF_ROLES, USER_ROLES, webDashboardForRole } from './modules/auth/auth.constants.js'
import { requireAuth, requireCsrfForStateChanges, requireRoles, sessionCookie } from './modules/auth/auth.middleware.js'
import { authRouter, logoutRouter } from './modules/auth/auth.routes.js'
import { jwtAuthRouter, jwtProtectedRouter } from './modules/auth/jwt-auth.routes.ts'
import { enrollmentRouter, facultyEnrollmentRouter } from './modules/enrollment/enrollment.routes.ts'
import { authenticateJwt, ensureActiveJwtAccount, requireJwtRoles, requireLibraryPermission } from './modules/auth/jwt-auth.middleware.ts'
import { inventoryPreviewRouter } from './modules/inventory/inventory-preview.routes.ts'
import { stocktakeRouter } from './modules/inventory/stocktake.routes.ts'
import { thesisInventoryV1AdminRouter } from './modules/inventory/thesis-inventory.routes.ts'
import { bookCatalogRouter } from './modules/catalog/book-catalog.routes.ts'
import { researchCatalogRouter } from './modules/catalog/research-catalog.routes.ts'
import { bulkBookRouter, bulkCatalogEntryRouter } from './modules/catalog/bulk-book.routes.ts'
import { researchAssetRouter } from './modules/catalog/research-asset.routes.ts'
import { adminCirculationRouter, borrowCartRouter, circulationRequestRouter, userCirculationRouter } from './modules/circulation/circulation.routes.ts'
import { deskCirculationRouter,userInLibraryRouter } from './modules/circulation/desk-circulation.routes.ts'
import { adminReservationsV1Router, userReservationsV1Router } from './modules/reservations/reservations.routes.ts'
import { createBorrowingScheduleRouter, createAdminBorrowingScheduleRouter } from './modules/reservations/borrowing-schedule.routes.ts'
import { adminAttendanceV1Router, userAttendanceV1Router } from './modules/attendance/attendance.routes.ts'
import { adminUsersV1Router, selfProfileRouter } from './modules/users/users.routes.ts'
import { adminPrintingV1Router, userPrintingV1Router } from './modules/printing/printing.routes.ts'
import { adminClearanceV1Router, userClearanceV1Router } from './modules/clearance/clearance.routes.ts'
import { adminAnnouncementsV1Router, userNotificationsV1Router } from './modules/notifications/notifications.routes.ts'
import { libraryScheduleRouter } from './modules/notifications/library-schedule.routes.ts'
import { requireLibraryOpenForUserTransactions } from './modules/notifications/library-schedule-guard.ts'
import { adminFinesV1Router, userFinesV1Router } from './modules/fines/fines.routes.ts'
import { adminDashboardV1Router, userDashboardV1Router } from './modules/dashboard/dashboard.routes.ts'
import { liveReportsRouter, workspaceTasksRouter } from './modules/reports/live-reports.routes.ts'
import { floorPlanRouter } from './modules/floor-plan/floor-plan.routes.ts'
import { catalogAdminRouter } from './modules/catalog/catalog-admin.routes.ts'
import { jobRunner } from './modules/job-runner/index.ts'
import { createAdminJobRouter, createInternalJobRouter } from './modules/job-runner/job-runner.routes.ts'
import { archivedInvoiceRouter } from './modules/invoices/invoice-archive.routes.ts'
import { usersRepository } from './modules/users/users.repository.ts'
import { clearanceService } from './modules/clearance/clearance.service.ts'
import { profileAvatarRouter } from './modules/users/profile-avatar.routes.ts'
import { adminNotificationsRouter } from './modules/users/admin-notifications.routes.ts'
import { borrowingPolicyRouter } from './modules/circulation/borrowing-policy.routes.ts'
import { finePolicyRouter } from './modules/fines/fine-policy.routes.ts'
import { violationCategoriesRouter } from './modules/fines/violation-categories.routes.ts'
import { copyConditionsRouter } from './modules/inventory/copy-conditions.routes.ts'
import { publicCatalogRouter, catalogMaintenanceRouter } from './modules/catalog/catalog-enhancements.routes.ts'
import { deweyRouter } from './modules/catalog/dewey.routes.ts'
import { collectionReviewRouter } from './modules/catalog/collection-review.routes.ts'
import { paymentRouters, paymentWebhookRouter } from './modules/payments/payments.routes.ts'
import { sanitizeStackTrace } from './utils/error-sanitizer.ts'
import { reservationSettingsRouter } from './modules/reservations/reservation-settings.routes.ts'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const publicDirectory = path.resolve(currentDirectory, '../public')

export function createApp() {
  const app = express()
  if (env.isProduction) app.set('trust proxy', 1)

  app.disable('x-powered-by')
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', ...(env.supabase.url ? [env.supabase.url] : [])],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }))
  app.use(cors({ origin: env.webOrigin, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }))
  const notFoundBoundary = (_request, response) => response.status(404).json({ success: false, message: 'Route not found.' })
  app.use('/api/payments/xendit/webhook', paymentWebhookRouter, notFoundBoundary)
  // D1: Supabase Cron only; before body parsing, the session, JWT and CSRF middleware, authorized by X-Job-Runner-Secret alone.
  app.use('/api/internal/jobs', createInternalJobRouter(jobRunner, () => env.jobRunner.secret), notFoundBoundary)
  app.use(express.json({ limit: '3mb' }))
  app.use(express.urlencoded({ extended: false, limit: '32kb' }))
  app.use(session({
    name: env.session.name,
    secret: env.session.secret,
    store: new SqlSessionStore(db),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: sessionCookie,
  }))

  app.use('/assets', express.static(path.join(publicDirectory, 'assets'), { index: false, maxAge: env.isProduction ? '1d' : 0 }))
  app.use('/api/assets', express.static(path.join(publicDirectory, 'assets'), { index: false, maxAge: env.isProduction ? '1d' : 0 }))

  app.get('/api/health', async (_request, response, next) => {
    try {
      const schema = await checkSchemaReadiness(db)
      const status = schema.ready ? 'healthy' : 'migration_required'
      response.status(schema.ready ? 200 : 503).json({
        success: schema.ready,
        ...(schema.ready ? {} : { code: 'DATABASE_MIGRATION_REQUIRED', message: 'The database schema is not ready. Apply the pending database/supabase/ migration with npm run db:supabase -w @sti-library/api -- <file>.sql.' }),
        data: { service: 'sti-library-api', architecture: 'modular-monolith', status, databaseSchema: schema },
      })
    } catch (error) { next(error) }
  })
  app.use('/api/auth', authRouter, notFoundBoundary)
  app.use('/api/v1/auth', jwtAuthRouter, notFoundBoundary)
  app.use('/api/public/catalog', publicCatalogRouter, notFoundBoundary)
  app.use('/api/v1', authenticateJwt, ensureActiveJwtAccount, requireCsrfForStateChanges)
  const enforceLibraryOpen = requireLibraryOpenForUserTransactions()
  app.use('/api/v1/admin/stocktake', requireLibraryPermission('library.manage'), stocktakeRouter)
  const attendanceConfirmations = createAttendanceConfirmationRouters()
  app.use('/api/v1/admin/attendance/confirmations', attendanceConfirmations.scanner)
  app.use('/api/v1/attendance/confirmations', enforceLibraryOpen, attendanceConfirmations.user)
  app.use('/api/v1/user/payments', paymentAssuranceRouters.user)
  app.use('/api/v1/admin/payments', paymentAssuranceRouters.admin)
  app.use('/api/v1/user/service-charges', serviceChargeRouters.user)
  app.use('/api/v1/admin/service-charges', serviceChargeRouters.admin)
  app.use('/api/v1/user/payments', paymentRouters.user)
  app.use('/api/v1/admin/payments', paymentRouters.admin)
  app.use('/api/v1/admin/enrollment', enrollmentRouter)
  app.use('/api/v1/admin/faculty-enrollment', facultyEnrollmentRouter)
  app.use('/api/v1/admin/borrowing-policies', requireLibraryPermission('library.manage'), borrowingPolicyRouter)
  app.use('/api/v1/admin/fine-policies', requireLibraryPermission('library.manage'), finePolicyRouter)
  app.use('/api/v1/admin/violation-categories', requireLibraryPermission('library.manage'), violationCategoriesRouter)
  app.use('/api/v1/admin/copy-conditions', requireLibraryPermission('library.manage'), copyConditionsRouter)
  app.use('/api/v1/admin/maintenance', requireLibraryPermission('library.manage'), catalogMaintenanceRouter)
  app.use('/api/v1/admin/dewey', requireLibraryPermission('library.manage'), deweyRouter)
  app.use('/api/v1/admin/collection-review', requireLibraryPermission('library.manage'), collectionReviewRouter)
  app.use('/api/v1/admin/reservation-settings', requireLibraryPermission('library.manage'), reservationSettingsRouter)
  app.use('/api/v1/profile/avatar', profileAvatarRouter)
  app.use('/api/v1/profile', selfProfileRouter)
  app.get('/api/v1/admin/account-dashboard', requireLibraryPermission('accounts.manage'), async (_request, response, next) => {
    try {
      const [accounts, clearance] = await Promise.all([usersRepository.summary(), clearanceService.activeStudentSummary()])
      response.set('Cache-Control', 'private, no-store').json({ success: true, data: {
        activeUsers: Number(accounts.active_accounts ?? 0), ...clearance, generatedAt: new Date().toISOString(),
      } })
    } catch (error) { next(error) }
  })
  app.use('/api/v1/admin/jobs', requireLibraryPermission('library.manage'), createAdminJobRouter(jobRunner))
  app.use('/api/v1/catalog', requireJwtRoles('Student', 'Faculty', 'Librarian'), enforceLibraryOpen, bookCatalogRouter)
  app.use('/api/v1/floor-plan', requireJwtRoles('Librarian', 'Student', 'Faculty'), floorPlanRouter)
  app.use('/api/v1/catalog', requireJwtRoles('Student', 'Faculty', 'Librarian'), enforceLibraryOpen, researchCatalogRouter)
  app.use('/api/v1/admin/books', requireLibraryPermission('library.manage'), bulkBookRouter)
  app.use('/api/v1/admin/research', requireLibraryPermission('library.manage'), researchAssetRouter)
  app.use('/api/v1/admin/catalog', requireLibraryPermission('library.manage'), bulkCatalogEntryRouter)
  app.use('/api/v1/admin/catalog', requireLibraryPermission('library.manage'), catalogAdminRouter)
  app.use('/api/v1/admin/invoices', requireLibraryPermission('library.manage'), archivedInvoiceRouter)
  app.use('/api/v1/invoices', requireJwtRoles('Student', 'Faculty'), archivedInvoiceRouter)
  app.use('/api/v1/reservations', requireJwtRoles('Student', 'Faculty'), enforceLibraryOpen, userReservationsV1Router)
  app.use('/api/v1/borrowing-schedules', requireJwtRoles('Student', 'Faculty'), enforceLibraryOpen, createBorrowingScheduleRouter())
  app.use('/api/v1/borrowing', requireJwtRoles('Student', 'Faculty'), enforceLibraryOpen, userCirculationRouter)
  app.use('/api/v1/borrowing', requireJwtRoles('Student','Faculty'), enforceLibraryOpen, userInLibraryRouter)
  app.use('/api/v1/admin/circulation-desk',requireLibraryPermission('desk.operate'),deskCirculationRouter)
  app.use('/api/v1/borrow', requireJwtRoles('Student', 'Faculty'), enforceLibraryOpen, borrowCartRouter)
  app.use('/api/v1/circulation', requireJwtRoles('Student', 'Faculty', 'Librarian', 'Staff'), enforceLibraryOpen, circulationRequestRouter)
  app.use('/api/v1/admin/reservations', requireLibraryPermission('desk.operate'), adminReservationsV1Router)
  app.use('/api/v1/admin/borrowing-schedules', createAdminBorrowingScheduleRouter())
  app.use('/api/v1/admin/attendance', requireLibraryPermission('desk.operate'), adminAttendanceV1Router)
  app.use('/api/v1/attendance', requireJwtRoles('Librarian', 'Student', 'Faculty'), enforceLibraryOpen, userAttendanceV1Router)
  app.use('/api/v1/admin/users', requireLibraryPermission('accounts.manage'), adminUsersV1Router)
  app.use('/api/v1/admin/notifications', requireLibraryPermission('accounts.manage'), adminNotificationsRouter)
  app.use('/api/v1/printing', requireJwtRoles('Student', 'Faculty'), enforceLibraryOpen, userPrintingV1Router)
  app.use('/api/v1/clearance', requireJwtRoles('Student', 'Faculty'), userClearanceV1Router)
  app.use('/api/v1/fines', requireJwtRoles('Student', 'Faculty'), enforceLibraryOpen, userFinesV1Router)
  app.use('/api/v1/notifications', requireJwtRoles('Student', 'Faculty', 'Librarian', 'Staff', 'Admin'), userNotificationsV1Router)
  app.use('/api/v1/library-schedule', requireJwtRoles('Student', 'Faculty', 'Librarian', 'Staff', 'Admin'), libraryScheduleRouter)
  app.use('/api/v1/dashboard', requireJwtRoles('Student', 'Faculty'), userDashboardV1Router)
  app.use('/api/v1/workspace/tasks', workspaceTasksRouter)
  app.use('/api/v1/admin/reports', liveReportsRouter)
  app.use('/api/v1/admin/printing', requireLibraryPermission('desk.operate'), adminPrintingV1Router)
  app.use('/api/v1/admin/clearance', requireJwtRoles('Admin', 'Librarian'), adminClearanceV1Router)
  app.use('/api/v1/admin/fines', requireLibraryPermission('library.manage'), adminFinesV1Router)
  app.use('/api/v1/admin/announcements', requireLibraryPermission('desk.operate'), adminAnnouncementsV1Router)
  app.use('/api/v1/admin/dashboard', requireLibraryPermission('library.manage'), adminDashboardV1Router)
  app.use('/api/v1/admin', requireLibraryPermission('desk.operate'), adminCirculationRouter)
  app.use('/api/v1/admin', requireLibraryPermission('library.manage'), thesisInventoryV1AdminRouter)
  app.use('/api/v1', jwtProtectedRouter, notFoundBoundary)
  app.use('/auth/logout', logoutRouter)
  if (env.inventoryPreviewEnabled) app.use('/api/dev/inventory', inventoryPreviewRouter)

  app.get('/', (request, response) => response.redirect(303, request.session?.user ? dashboardForRole(request.session.user.role) : '/login'))
  app.get('/login', (request, response) => {
    if (request.session?.user) return response.redirect(303, dashboardForRole(request.session.user.role))
    response.set('Cache-Control', 'no-store')
    return response.sendFile(path.join(publicDirectory, 'login.html'))
  })
  app.get('/register', (_request, response) => {
    response.set('Cache-Control', 'no-store')
    return response.redirect(303, new URL('/register', env.webOrigin).toString())
  })
  app.get('/admin/dashboard', requireAuth, requireRoles(...STAFF_ROLES, ROLES.SYSTEM_ADMINISTRATOR), (request, response) => {
    const role = request.session?.user?.role ?? response.locals.authenticatedUser?.role
    response.set('Cache-Control', 'no-store')
    response.redirect(303, new URL(webDashboardForRole(role), env.webOrigin).toString())
  })
  app.get('/user/dashboard', requireAuth, requireRoles(...USER_ROLES), (request, response) => {
    const role = request.session?.user?.role ?? response.locals.authenticatedUser?.role
    response.set('Cache-Control', 'no-store')
    response.redirect(303, new URL(webDashboardForRole(role), env.webOrigin).toString())
  })

  // Protect every existing feature API, then add stricter staff/admin guards.
  app.use('/api', requireAuth)
  app.use('/api', requireCsrfForStateChanges)
  app.use('/api/dashboard/admin', requireRoles(ROLES.LIBRARIAN))
  app.use('/api/dashboard/student', requireRoles(...USER_ROLES))
  app.use('/api/users', requireRoles(ROLES.SYSTEM_ADMINISTRATOR, ROLES.LIBRARIAN))
  app.use('/api/circulation', requireRoles(...STAFF_ROLES))
  app.use('/api/attendance', requireRoles(...STAFF_ROLES))
  app.use('/api/reservations', enforceLibraryOpen)
  app.use('/api/printing', enforceLibraryOpen)
  app.use('/api/fines', requireRoles(ROLES.LIBRARIAN))
  app.use('/api/inventory', requireRoles(ROLES.LIBRARIAN))
  app.use('/api/reports', requireRoles(ROLES.LIBRARIAN))
  registerModules(app)

  app.use(notFoundBoundary)
  app.use((error, _request, response, _next) => {
    if (response.headersSent) return response.destroy(error instanceof Error ? error : undefined)
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ success: false, message: 'The request body contains invalid JSON.' })
    }
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'The uploaded file is too large. Choose a smaller file and try again.'
        : 'The uploaded file could not be accepted. Check the file count and fields, then try again.'
      return response.status(422).json({ success: false, code: error.code || 'UPLOAD_INVALID', message })
    }
    if (error instanceof HttpError) {
      return response.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      })
    }
    if (isDatabaseUnavailable(error)) {
      // FIX: Use sanitized error message
      const sanitized = sanitizeStackTrace(error)
      console.error(`[Database] Connection unavailable; request failed.\n${sanitized}`)
      return response.status(503).json({
        success: false,
        code: 'DATABASE_UNAVAILABLE',
        message: 'The library database is temporarily unavailable. Please try again.',
      })
    }
    if (isMissingSchemaError(error)) {
      return response.status(503).json({
        success: false,
        code: 'DATABASE_MIGRATION_REQUIRED',
        message: 'This module is unavailable until the required database migrations are applied.',
      })
    }
    // FIX: Sanitize error before logging to prevent sensitive data leakage
    const sanitized = sanitizeStackTrace(error)
    console.error(`[Server] Uncaught error:\n${sanitized}`)
    return response.status(500).json({ success: false, message: 'An unexpected server error occurred.' })
  })

  return app
}
