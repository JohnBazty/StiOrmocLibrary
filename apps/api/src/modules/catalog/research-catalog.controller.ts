import type { NextFunction, Request, Response } from 'express'
import { createResearchCatalogService, researchCatalogService } from './research-catalog.service.ts'

type Service = ReturnType<typeof createResearchCatalogService>
function asyncController(handler: (request: Request, response: Response) => Promise<void>) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try { await handler(request, response) } catch (error) { next(error) }
  }
}

export function createResearchCatalogController(service: Service = researchCatalogService) {
  return {
    list: asyncController(async (request, response) => {
      const result = await service.list(request.query as Record<string, unknown>)
      response.json({ success: true, data: result.items, meta: { pagination: result.pagination, viewOnly: true } })
    }),
    overview: asyncController(async (request, response) => {
      response.json({ success: true, data: await service.overview(request.params.id), meta: { viewOnly: true } })
    }),
  }
}

export const researchCatalogController = createResearchCatalogController()
