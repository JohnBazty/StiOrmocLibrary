import type { NextFunction, Request, Response } from 'express'
import { bulkBookService, createBulkBookService } from './bulk-book.service.ts'

type Service = ReturnType<typeof createBulkBookService>

export function createBulkBookController(service: Service = bulkBookService) {
  return {
    addBulk: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const data = await service.addBulk(request.body)
        response.status(201).json({ success: true, message: `${data.numberOfCopies} physical book labels generated successfully.`, data })
      } catch (error) {
        next(error)
      }
    },
  }
}

export const bulkBookController = createBulkBookController()
