import { createApp } from './app.js'
import { env } from './config/env.js'
import { SYSTEM_SHORT_NAME } from './config/branding.ts'
import { verifyDatabaseConnection } from './config/db.js'
import { startOperationalJobWorker } from './modules/jobs/job-runner.ts'

const port = env.port
const app = createApp()

try {
  await verifyDatabaseConnection()
  startOperationalJobWorker()
  app.listen(port, () => {
    console.log(`STI Library API running at http://localhost:${port}`)
    console.log(`Open the ${SYSTEM_SHORT_NAME} web application at ${env.webOrigin}/login`)
  })
} catch (error) {
  console.error('Unable to start the API. Check the configured database connection and required migrations.', error)
  process.exitCode = 1
}
