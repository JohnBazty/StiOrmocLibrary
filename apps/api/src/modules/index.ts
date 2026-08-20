import type { Express } from 'express'
import { attendanceRouter } from './attendance/attendance.routes.ts'
import { catalogRouter } from './catalog/catalog.routes.ts'
import { circulationRouter } from './circulation/circulation.routes.ts'
import { clearanceRouter } from './clearance/clearance.routes.ts'
import { dashboardRouter } from './dashboard/dashboard.routes.ts'
import { finesRouter } from './fines/fines.routes.ts'
import { inventoryRouter } from './inventory/inventory.routes.ts'
import { notificationsRouter } from './notifications/notifications.routes.ts'
import { printingRouter } from './printing/printing.routes.ts'
import { reportsRouter } from './reports/reports.routes.ts'
import { reservationsRouter } from './reservations/reservations.routes.ts'
import { usersRouter } from './users/users.routes.ts'
import { categoryRouter } from './catalog/categories/category.routes.ts'

export function registerModules(app: Express) {
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/catalog', catalogRouter)
  app.use('/api/categories', categoryRouter)
  app.use('/api/circulation', circulationRouter)
  app.use('/api/reservations', reservationsRouter)
  app.use('/api/fines', finesRouter)
  app.use('/api/attendance', attendanceRouter)
  app.use('/api/printing', printingRouter)
  app.use('/api/inventory', inventoryRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/clearance', clearanceRouter)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/reports', reportsRouter)
}
