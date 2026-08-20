import { Router } from 'express'
import { requireCatalogManager } from '../catalog/catalog.rbac.ts'
import {
  auditThesis, changeThesisAvailability, exportThesisCsv, exportThesisPdf, getThesisRows, getThesisSummary,
} from './thesis-inventory.controller.ts'
import { validateThesisAudit, validateThesisAvailability } from './thesis-inventory.validation.ts'

/** Session/JWT-aware aliases under /api/inventory/thesis. */
export const thesisInventoryRouter = Router()
thesisInventoryRouter.use(requireCatalogManager)
thesisInventoryRouter.get('/', getThesisRows)
thesisInventoryRouter.get('/summary', getThesisSummary)
thesisInventoryRouter.post('/audit', validateThesisAudit, auditThesis)
thesisInventoryRouter.patch('/availability', validateThesisAvailability, changeThesisAvailability)
thesisInventoryRouter.get('/export.csv', exportThesisCsv)
thesisInventoryRouter.get('/export.pdf', exportThesisPdf)

/** Exact bearer-token contracts requested under /api/v1/admin. */
export const thesisInventoryV1AdminRouter = Router()
thesisInventoryV1AdminRouter.get('/inventory/thesis', getThesisRows)
thesisInventoryV1AdminRouter.get('/inventory/thesis/summary', getThesisSummary)
thesisInventoryV1AdminRouter.post('/inventory/thesis/audit', validateThesisAudit, auditThesis)
thesisInventoryV1AdminRouter.patch('/inventory/thesis/availability', validateThesisAvailability, changeThesisAvailability)
thesisInventoryV1AdminRouter.get('/reports/thesis/csv', exportThesisCsv)
thesisInventoryV1AdminRouter.get('/reports/thesis/pdf', exportThesisPdf)
