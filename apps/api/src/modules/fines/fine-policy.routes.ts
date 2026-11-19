import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { finePolicyService } from './fine-policy.service.ts'

type Service = Pick<typeof finePolicyService, 'list' | 'publish'>

const handle = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next) }

function actorAccountId(res: Response) {
  const user = res.locals.authenticatedUser as { accountId?: number; id?: number } | undefined
  return Number(user?.accountId ?? user?.id)
}

export function createFinePolicyRouter(service: Service = finePolicyService) {
  const router = Router()
  router.get('/', handle(async (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ success: true, data: await service.list() })
  }))
  router.post('/', handle(async (req, res) => {
    const data = await service.publish(actorAccountId(res), req.body)
    res.status(201).json({ success: true, message: 'Fine rules saved.', data })
  }))
  return router
}

export const finePolicyRouter = createFinePolicyRouter()
