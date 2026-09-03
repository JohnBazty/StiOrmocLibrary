import type { NextFunction, Request, Response } from 'express'
import { createIsbnLookupService, isbnLookupService } from './isbn-lookup.service.ts'

type Service = ReturnType<typeof createIsbnLookupService>

export function createIsbnLookupController(service: Service = isbnLookupService) {
  return {
    lookup: async (request: Request, response: Response, next: NextFunction) => {
      try {
        response.set('Cache-Control', 'private, max-age=600')
        response.json({ success: true, data: await service.lookup(request.params.isbn) })
      } catch (error) { next(error) }
    },
  }
}

export const isbnLookupController = createIsbnLookupController()
