import { Router } from 'express'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { liveReportsService, parseReportFilters } from './live-reports.service.ts'
import { requireCatalogManager } from '../catalog/catalog.rbac.ts'
import { parseCatalogSearchFilters } from '../catalog/catalog-search.repository.ts'
import { createCsvStream, createInventoryPdf, inventoryRows, type InventoryExportRow } from './catalog-export.service.ts'

type ExportDependencies = {
  rows: (filters: ReturnType<typeof parseCatalogSearchFilters>) => AsyncIterable<InventoryExportRow>
  csv: typeof createCsvStream
  pdf: typeof createInventoryPdf
}

export async function resolveReportAccount(actor: { accountId?: number; id?: number } | undefined, session: boolean, database = db) {
  if (session && actor?.id) {
    const [rows] = await database.execute('SELECT account_id FROM accounts WHERE user_id=?', [actor.id])
    const account = (rows as Array<{account_id:number}>)[0]
    if (account) return Number(account.account_id)
  } else if (Number.isSafeInteger(actor?.accountId) && actor!.accountId! > 0) return actor!.accountId!
  throw new HttpError(403, 'REPORT_ACCOUNT_REQUIRED', 'Your account is not linked to the reporting workspace.')
}

export function createReportsRouter(dependencies: ExportDependencies = { rows: inventoryRows, csv: createCsvStream, pdf: createInventoryPdf }) {
  const router = Router()
  router.get('/', requireCatalogManager, async (request, response, next) => {
    try {
      const actor = response.locals.authenticatedUser ?? request.session?.user
      const accountId = await resolveReportAccount(actor, response.locals.authenticationType === 'session')
      const data = await liveReportsService.read(accountId, parseReportFilters(request.query))
      response.set('Cache-Control','private, no-store').json({success:true,data:{...data,rows:data.rows.slice(0,20)}})
    } catch (e) { next(e) }
  })

  router.get('/catalog/inventory.csv', requireCatalogManager, (request, response, next) => {
  try {
    const filters = parseCatalogSearchFilters(request.query as Record<string, unknown>)
    response.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="sti-library-inventory.csv"',
      'Cache-Control': 'private, no-store',
      'X-SmartLib-CSV-Integrity': 'HMAC-SHA256; version=v1',
    })
    dependencies.csv(dependencies.rows(filters)).on('error', next).pipe(response)
  } catch (error) { next(error) }
  })

  router.get('/catalog/inventory.pdf', requireCatalogManager, (request, response, next) => {
  try {
    const filters = parseCatalogSearchFilters(request.query as Record<string, unknown>)
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="sti-library-inventory.pdf"',
      'Cache-Control': 'private, no-store',
    })
    dependencies.pdf(dependencies.rows(filters)).on('error', next).pipe(response)
  } catch (error) { next(error) }
  })
  return router
}

export const reportsRouter = createReportsRouter()
