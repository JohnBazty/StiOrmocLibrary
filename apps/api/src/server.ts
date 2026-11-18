import { createApp } from './app.js'
import { env } from './config/env.js'
import { SYSTEM_SHORT_NAME } from './config/branding.ts'
import { db, verifyDatabaseConnection, dbDriver } from './config/db.js'
import { connectDatabaseAtStartup, databaseStartupErrorMessage } from './core/database-startup.ts'
import { startOperationalJobWorker } from './modules/jobs/job-runner.ts'
import { startReservationExpirationWorker } from './modules/reservations/reservation-expiration.worker.ts'
import { startCirculationOverdueWorker } from './modules/circulation/circulation-overdue.worker.ts'
import { startNotificationWorker } from './modules/notifications/notification.worker.ts'

const port = env.port
const app = createApp()

try {
  await connectDatabaseAtStartup(verifyDatabaseConnection, {
    onRetry: ({ nextAttempt, totalAttempts, delayMs }) => console.warn(`Database connection temporarily unavailable. Retrying in ${delayMs / 1000} seconds (attempt ${nextAttempt}/${totalAttempts})…`),
  })
  if(dbDriver==='postgres') startOperationalJobWorker()
  else {
    await startReservationExpirationWorker()
    startCirculationOverdueWorker()
    startNotificationWorker()
  }
  app.listen(port, () => {
    console.log(`STI Library API running at http://localhost:${port}`)
    console.log(`Open the ${SYSTEM_SHORT_NAME} web application at ${env.webOrigin}/login`)
  })
} catch (error) {
  console.error(databaseStartupErrorMessage(error))
  await db.end().catch(() => {})
  process.exitCode = 1
}
