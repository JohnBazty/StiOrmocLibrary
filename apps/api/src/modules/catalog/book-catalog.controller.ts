import type { NextFunction, Request, Response } from 'express'
import { bookCatalogService, createBookCatalogService, type CatalogViewer } from './book-catalog.service.ts'

type Service = ReturnType<typeof createBookCatalogService>

function viewer(response: Response): CatalogViewer {
  const authenticated = response.locals.authenticatedUser as { accountId?: number; id?: number; role?: CatalogViewer['role'] }
  return {
    accountId: Number(authenticated.accountId ?? authenticated.id),
    role: authenticated.role as CatalogViewer['role'],
  }
}

function asyncController(handler: (request: Request, response: Response) => Promise<void>) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try { await handler(request, response) } catch (error) { next(error) }
  }
}

export function createBookCatalogController(service: Service = bookCatalogService) {
  return {
    categories: asyncController(async (_request, response) => {
      response.json({ success: true, data: await service.categories() })
    }),
    list: asyncController(async (request, response) => {
      const result = await service.list(request.query as Record<string, unknown>, viewer(response))
      response.json({
        success: true,
        data: result.items,
        meta: { pagination: result.pagination, viewer: result.viewer },
      })
    }),
    overview: asyncController(async (request, response) => {
      response.json({ success: true, data: await service.overview(request.params.titleId) })
    }),
    reserve: asyncController(async (request, response) => {
      response.status(201).json({
        success: true,
        message: 'Reservation request submitted successfully.',
        data: await service.reserve(request.params.titleId, viewer(response)),
      })
    }),
  }
}

export const bookCatalogController = createBookCatalogController()
