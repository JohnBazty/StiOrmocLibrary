import { Router, type NextFunction, type Request, type Response } from 'express'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { parseActiveUserFilters, parseUserFilters, usersRepository } from './users.repository.ts'

const handle = (fn: (request: Request, response: Response) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => { void fn(request, response).catch(next) }
const actor = (response: Response) => response.locals.authenticatedUser?.accountId

export const usersRouter = Router()
usersRouter.get('/summary', handle(async (_request, response) => { response.json({ success: true, data: await usersRepository.summary() }) }))
usersRouter.get('/programs', handle(async (_request, response) => { response.json({ success: true, data: await usersRepository.programs() }) }))
usersRouter.get('/directory', handle(async (request, response) => {
  const result = await usersRepository.directory(parseUserFilters(request.query))
  response.json({ success: true, data: result.rows, meta: { pagination: result.pagination } })
}))
usersRouter.get('/active', handle(async (request, response) => {
  const result = await usersRepository.active(parseActiveUserFilters(request.query))
  response.json({ success: true, data: result.rows, meta: { pagination: result.pagination } })
}))
usersRouter.get('/:accountId', handle(async (request, response) => {
  response.json({ success: true, data: await usersRepository.detail(request.params.accountId) })
}))
usersRouter.post('/:accountId/status', requireJwtRoles('Admin'), handle(async (request, response) => {
  response.json({ success: true, data: await usersRepository.changeStatus(request.params.accountId, actor(response), request.body ?? {}) })
}))
export const adminUsersV1Router = usersRouter

export const selfProfileRouter = Router()
selfProfileRouter.get('/me', handle(async (_request, response) => {
  response.set('Cache-Control', 'private, no-store').json({ success: true, data: await usersRepository.ownProfile(actor(response)) })
}))
selfProfileRouter.patch('/me', handle(async (request, response) => {
  const accountId = actor(response)
  response.set('Cache-Control', 'private, no-store').json({ success: true, data: await usersRepository.editProfile(accountId, accountId, request.body ?? {}) })
}))
