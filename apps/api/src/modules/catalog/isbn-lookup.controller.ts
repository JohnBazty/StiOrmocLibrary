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
    cover: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const found = await service.cover(request.params.isbn)
        response.set({ 'Content-Type': found.contentType, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' }).send(found.bytes)
      } catch (error) { next(error) }
    },
    searchSubjects: async (request: Request, response: Response, next: NextFunction) => {
      try {
        response.set('Cache-Control', 'private, max-age=600')
        response.json({ success: true, data: { subjects: await service.searchSubjects(request.query.q) } })
      } catch (error) { next(error) }
    },
    searchTitles: async (request: Request, response: Response, next: NextFunction) => {
      try {
        response.set('Cache-Control', 'no-store')
        response.json({ success: true, data: await service.searchTitles({ title: request.query.title, author: request.query.author }) })
      } catch (error) { next(error) }
    },
  }
}

export const isbnLookupController = createIsbnLookupController()
