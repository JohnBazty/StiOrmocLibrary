import type { NextFunction, Request, Response } from 'express'
import { categoryService } from './category.service.ts'

type CategoryService = typeof categoryService

function asyncController(handler: (request: Request, response: Response) => Promise<unknown>) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try { await handler(request, response) } catch (error) { next(error) }
  }
}

export function createCategoryController(service: CategoryService = categoryService) {
  return {
    list: asyncController(async (_request, response) => {
      response.set('Cache-Control', 'private, no-store')
      response.json({ success: true, data: await service.list() })
    }),
    create: asyncController(async (request, response) => {
      response.status(201).json({ success: true, message: 'Category created successfully.', data: await service.create(request.body) })
    }),
    update: asyncController(async (request, response) => {
      response.json({ success: true, message: 'Category updated successfully.', data: await service.update(request.params.categoryId, request.body) })
    }),
    remove: asyncController(async (request, response) => {
      response.json({ success: true, message: 'Category deleted successfully.', data: await service.remove(request.params.categoryId) })
    }),
    reassign: asyncController(async (request, response) => {
      response.json({ success: true, message: 'Materials reassigned and old category deleted successfully.', data: await service.reassign(request.body) })
    }),
  }
}

export const categoryController = createCategoryController()
