import process from 'node:process'
import { resolve } from 'node:path'
import { verifyIntegrityProtectedCsvFile } from '../src/modules/reports/csv-integrity.ts'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: npm run reports:verify-csv -w @sti-library/api -- <path-to-report.csv>')
  process.exitCode = 2
} else {
  const result = await verifyIntegrityProtectedCsvFile(resolve(filePath))
  if (result.valid) {
    console.log(`VALID: SmartLib ${result.dataset} report has not been changed.`)
  } else {
    console.error(`INVALID: ${result.reason ?? 'Report integrity verification failed.'}`)
    process.exitCode = 1
  }
}
