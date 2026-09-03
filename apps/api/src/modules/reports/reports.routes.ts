import { Router } from 'express'
import { reports } from '../../data/mock-data.ts'
import { ok } from '../../core/http.ts'
import { requireCatalogManager } from '../catalog/catalog.rbac.ts'
import { parseCatalogSearchFilters } from '../catalog/catalog-search.repository.ts'
import { createCsvStream, createInventoryPdf, inventoryRows, type InventoryExportRow } from './catalog-export.service.ts'

type ExportDependencies = {
  rows: (filters: ReturnType<typeof parseCatalogSearchFilters>) => AsyncIterable<InventoryExportRow>
  csv: typeof createCsvStream
  pdf: typeof createInventoryPdf
}

export function createReportsRouter(dependencies: ExportDependencies = { rows: inventoryRows, csv: createCsvStream, pdf: createInventoryPdf }) {
  const router = Router()
  router.get('/', (_request, response) => ok(response, reports))

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
