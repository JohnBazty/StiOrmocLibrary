import { Router } from 'express'
import { ok } from './http.ts'

export function createResourceRouter<T>(data: T) {
  const router = Router()
  router.get('/', (_request, response) => ok(response, data))
  return router
}
