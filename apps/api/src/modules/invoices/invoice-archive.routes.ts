import { Router } from 'express'

// Keep the invoice implementation and database records for a future release.
// No invoice operation, including setup or issuance, is active while archived.
export const archivedInvoiceRouter = Router()
archivedInvoiceRouter.use((_request, response) => {
  response.set('Cache-Control', 'no-store').status(410).json({
    success: false,
    code: 'INVOICES_ARCHIVED',
    message: 'The invoice feature is temporarily archived.',
  })
})
