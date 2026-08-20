import { Router } from 'express'
import { printRequests } from '../../data/mock-data.ts'
import { ok } from '../../core/http.ts'

export const printingRouter = Router()
printingRouter.get('/', (_request, response) => ok(response, printRequests))
printingRouter.post('/', (request, response) => {
  const mockRequest = {
    id: `PR-${2042 + printRequests.length}`,
    ...request.body,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  response.status(201)
  return ok(response, mockRequest, 'Mock print request created')
})
