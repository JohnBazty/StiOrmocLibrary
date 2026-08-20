import type { Response } from 'express'

export function ok<T>(response: Response, data: T, message = 'Request completed') {
  return response.json({ success: true, message, data })
}
