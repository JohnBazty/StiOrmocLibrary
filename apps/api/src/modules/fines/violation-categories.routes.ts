import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { violationCategoriesService } from './violation-categories.service.ts'

type Service = Pick<typeof violationCategoriesService, 'list' | 'create' | 'update' | 'remove'>

const handle = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next) }

function actorAccountId(res: Response) {
  const user = res.locals.authenticatedUser as { accountId?: number; id?: number } | undefined
  return Number(user?.accountId ?? user?.id)
}

/** A category with records is retired (`isActive: false`) so old records keep their label; only an unused one can be deleted. */
export function createViolationCategoriesRouter(service: Service = violationCategoriesService) {
  const router = Router()
  router.get('/', handle(async (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ success: true, data: await service.list() })
  }))
  router.post('/', handle(async (req, res) => {
    res.status(201).json({ success: true, message: 'Violation category saved.', data: await service.create(actorAccountId(res), req.body) })
  }))
  router.patch('/:categoryId', handle(async (req, res) => {
    res.json({ success: true, message: 'Violation category saved.', data: await service.update(actorAccountId(res), req.params.categoryId, req.body) })
  }))
  router.delete('/:categoryId', handle(async (req, res) => {
    res.json({ success: true, message: 'Violation category deleted.', data: await service.remove(actorAccountId(res), req.params.categoryId) })
  }))
  return router
}

export const violationCategoriesRouter = createViolationCategoriesRouter()
