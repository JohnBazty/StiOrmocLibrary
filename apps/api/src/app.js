import cors from 'cors'
import express from 'express'
import session from 'express-session'
import helmet from 'helmet'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './config/db.js'
import { env } from './config/env.js'
import { MySqlSessionStore } from './core/mysql-session-store.js'
import { HttpError } from './core/http-error.ts'
import { checkSchemaReadiness, isMissingSchemaError } from './core/schema-readiness.ts'
import { registerModules } from './modules/index.ts'
import { dashboardForRole, ROLES, STAFF_ROLES, USER_ROLES, webDashboardForRole } from './modules/auth/auth.constants.js'
import { requireAuth, requireCsrfForStateChanges, requireRoles, sessionCookie } from './modules/auth/auth.middleware.js'
import { authRouter, logoutRouter, registrationRouter } from './modules/auth/auth.routes.js'
import { jwtAuthRouter, jwtProtectedRouter } from './modules/auth/jwt-auth.routes.ts'
import { authenticateJwt, requireJwtRoles } from './modules/auth/jwt-auth.middleware.ts'
import { inventoryPreviewRouter } from './modules/inventory/inventory-preview.routes.ts'
import { thesisInventoryV1AdminRouter } from './modules/inventory/thesis-inventory.routes.ts'
import { bookCatalogRouter } from './modules/catalog/book-catalog.routes.ts'
import { researchCatalogRouter } from './modules/catalog/research-catalog.routes.ts'
import { bulkBookRouter, bulkCatalogEntryRouter } from './modules/catalog/bulk-book.routes.ts'
import { researchAssetRouter } from './modules/catalog/research-asset.routes.ts'
import { adminCirculationRouter, borrowCartRouter, circulationRequestRouter, userCirculationRouter } from './modules/circulation/circulation.routes.ts'
import { adminReservationsV1Router, userReservationsV1Router } from './modules/reservations/reservations.routes.ts'
import { adminAttendanceV1Router } from './modules/attendance/attendance.routes.ts'
import { adminUsersV1Router } from './modules/users/users.routes.ts'
import { adminPrintingV1Router, userPrintingV1Router } from './modules/printing/printing.routes.ts'
import { adminClearanceV1Router, userClearanceV1Router } from './modules/clearance/clearance.routes.ts'
import { adminAnnouncementsV1Router, userNotificationsV1Router } from './modules/notifications/notifications.routes.ts'
import { adminFinesV1Router, userFinesV1Router } from './modules/fines/fines.routes.ts'

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
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }))
  app.use(cors({ origin: env.webOrigin, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }))
  app.use(express.json({ limit: '3mb' }))
  app.use(express.urlencoded({ extended: false, limit: '32kb' }))
  app.use(session({
    name: env.session.name,
    secret: env.session.secret,
    store: new MySqlSessionStore(db),
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
        ...(schema.ready ? {} : { code: 'DATABASE_MIGRATION_REQUIRED', message: 'The database schema is not ready. Run npm run db:migrate -w @sti-library/api.' }),
        data: { service: 'sti-library-api', architecture: 'modular-monolith', status, databaseSchema: schema },
      })
    } catch (error) { next(error) }
  })
  app.use('/api/auth', authRouter)
  app.use('/api/v1/auth', jwtAuthRouter)
  app.use('/api/v1/catalog', authenticateJwt, bookCatalogRouter)
  app.use('/api/v1/catalog', authenticateJwt, researchCatalogRouter)
  app.use('/api/v1/admin/books', authenticateJwt, requireJwtRoles('Admin', 'Librarian'), bulkBookRouter)
  app.use('/api/v1/admin/research', authenticateJwt, requireJwtRoles('Admin', 'Librarian'), researchAssetRouter)
  app.use('/api/v1/admin/catalog', authenticateJwt, requireJwtRoles('Admin', 'Librarian'), bulkCatalogEntryRouter)
  app.use('/api/v1/reservations', authenticateJwt, requireJwtRoles('Student', 'Faculty'), userReservationsV1Router)
  app.use('/api/v1/borrowing', authenticateJwt, requireJwtRoles('Student', 'Faculty'), userCirculationRouter)
  app.use('/api/v1/borrow', authenticateJwt, requireJwtRoles('Student', 'Faculty'), borrowCartRouter)
  app.use('/api/v1/circulation', authenticateJwt, circulationRequestRouter)
  app.use('/api/v1/admin/reservations', authenticateJwt, requireJwtRoles('Admin', 'Librarian'), adminReservationsV1Router)
  app.use('/api/v1/admin/attendance', authenticateJwt, requireJwtRoles('Admin', 'Librarian'), adminAttendanceV1Router)
  app.use('/api/v1/admin/users', authenticateJwt, requireJwtRoles('Admin', 'Librarian'), adminUsersV1Router)
  app.use('/api/v1/printing', authenticateJwt, requireJwtRoles('Student', 'Faculty'), userPrintingV1Router)
  app.use('/api/v1/clearance', authenticateJwt, requireJwtRoles('Student', 'Faculty'), userClearanceV1Router)
  app.use('/api/v1/fines', authenticateJwt, requireJwtRoles('Student', 'Faculty'), userFinesV1Router)
  app.use('/api/v1/notifications', authenticateJwt, userNotificationsV1Router)
  app.use('/api/v1/admin/printing', authenticateJwt, requireJwtRoles('Admin', 'Librarian'), adminPrintingV1Router)
  app.use('/api/v1/admin/clearance', authenticateJwt, requireJwtRoles('Admin', 'Librarian'), adminClearanceV1Router)
  app.use('/api/v1/admin/fines', authenticateJwt, requireJwtRoles('Admin', 'Librarian'), adminFinesV1Router)
  app.use('/api/v1/admin/announcements', authenticateJwt, requireJwtRoles('Admin'), adminAnnouncementsV1Router)
  app.use('/api/v1/admin', authenticateJwt, requireJwtRoles('Admin', 'Librarian'), adminCirculationRouter)
  app.use('/api/v1/admin', authenticateJwt, requireJwtRoles('Admin', 'Librarian'), thesisInventoryV1AdminRouter)
  app.use('/api/v1', jwtProtectedRouter)
  app.use('/auth/register', registrationRouter)
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
    return response.sendFile(path.join(publicDirectory, 'register.html'))
  })
  app.get('/admin/dashboard', requireAuth, requireRoles(...STAFF_ROLES), (request, response) => {
    response.set('Cache-Control', 'no-store')
    response.redirect(303, new URL(webDashboardForRole(request.session.user.role), env.webOrigin).toString())
  })
  app.get('/user/dashboard', requireAuth, requireRoles(...USER_ROLES), (request, response) => {
    response.set('Cache-Control', 'no-store')
    response.redirect(303, new URL(webDashboardForRole(request.session.user.role), env.webOrigin).toString())
  })

  // Protect every existing feature API, then add stricter staff/admin guards.
  app.use('/api', requireAuth)
  app.use('/api', requireCsrfForStateChanges)
  app.use('/api/users', requireRoles(ROLES.SYSTEM_ADMINISTRATOR))
  app.use('/api/circulation', requireRoles(...STAFF_ROLES))
  app.use('/api/fines', requireRoles(...STAFF_ROLES))
  app.use('/api/inventory', requireRoles(...STAFF_ROLES))
  app.use('/api/reports', requireRoles(...STAFF_ROLES))
  registerModules(app)

  app.use((_request, response) => response.status(404).json({ success: false, message: 'Route not found.' }))
  app.use((error, _request, response, _next) => {
    if (response.headersSent) return response.destroy(error instanceof Error ? error : undefined)
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ success: false, message: 'The request body contains invalid JSON.' })
    }
    if (error instanceof HttpError) {
      return response.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      })
    }
    if (isMissingSchemaError(error)) {
      return response.status(503).json({
        success: false,
        code: 'DATABASE_MIGRATION_REQUIRED',
        message: 'This module is unavailable until the required database migrations are applied.',
      })
    }
    console.error(error)
    return response.status(500).json({ success: false, message: 'An unexpected server error occurred.' })
  })

  return app
}
