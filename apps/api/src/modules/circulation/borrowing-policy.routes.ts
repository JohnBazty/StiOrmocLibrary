import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { borrowingPolicyService, createBorrowingPolicyService } from './borrowing-policy.service.ts'

type Service = ReturnType<typeof createBorrowingPolicyService>

function handle(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next)
  }
}

function actorAccountId(res: Response) {
  const user = res.locals.authenticatedUser as { accountId?: number; id?: number } | undefined
  return Number(user?.accountId ?? user?.id)
}

export function createBorrowingPolicyRouter(service: Service = borrowingPolicyService) {
  const router = Router()
  router.get('/', handle(async (_req, res) => {
    res.json({ success: true, data: await service.list() })
  }))
  router.get('/:versionId', handle(async (req, res) => {
    res.json({ success: true, data: await service.getById(req.params.versionId) })
  }))
  router.post('/', handle(async (req, res) => {
    const data = await service.publish(actorAccountId(res), req.body)
    res.status(201).json({ success: true, message: 'Borrowing policy version published.', data })
  }))
  return router
}

export const borrowingPolicyRouter = createBorrowingPolicyRouter()
