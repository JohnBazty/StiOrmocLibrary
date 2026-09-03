import { createApp } from './app.js'
import { env } from './config/env.js'
import { verifyDatabaseConnection } from './config/db.js'
import { startReservationExpirationWorker } from './modules/reservations/reservation-expiration.worker.ts'
import { startCirculationOverdueWorker } from './modules/circulation/circulation-overdue.worker.ts'
import { startNotificationWorker } from './modules/notifications/notification.worker.ts'

const port = env.port
const app = createApp()

try {
  await verifyDatabaseConnection()
  await startReservationExpirationWorker()
  startCirculationOverdueWorker()
  startNotificationWorker()
  app.listen(port, () => {
    console.log(`STI Library API running at http://localhost:${port}`)
    console.log(`Open the SmartLib web application at ${env.webOrigin}/login`)
  })
} catch (error) {
  console.error('Unable to connect to MySQL. Check apps/api/.env and run the database schema.', error)
  process.exitCode = 1
}
