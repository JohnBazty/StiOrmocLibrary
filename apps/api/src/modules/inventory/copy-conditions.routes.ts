import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { copyConditionsService } from './copy-conditions.service.ts'

type Service = Pick<typeof copyConditionsService, 'list' | 'create' | 'update' | 'remove'>

const handle = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next) }
function actorAccountId(res: Response) {
  const user = res.locals.authenticatedUser as { accountId?: number; id?: number } | undefined
  return Number(user?.accountId ?? user?.id)
}

/** Library setup -> Book conditions. A used custom condition is retired (isActive false), never deleted. */
export function createCopyConditionsRouter(service: Service = copyConditionsService) {
  const router = Router()
  router.get('/', handle(async (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ success: true, data: await service.list() })
  }))
  router.post('/', handle(async (req, res) => {
    res.status(201).json({ success: true, message: 'Condition saved.', data: await service.create(actorAccountId(res), req.body) })
  }))
  router.patch('/:conditionId', handle(async (req, res) => {
    res.json({ success: true, message: 'Condition saved.', data: await service.update(actorAccountId(res), req.params.conditionId, req.body) })
  }))
  router.delete('/:conditionId', handle(async (req, res) => {
    res.json({ success: true, message: 'Condition deleted.', data: await service.remove(actorAccountId(res), req.params.conditionId) })
  }))
  return router
}

export const copyConditionsRouter = createCopyConditionsRouter()
