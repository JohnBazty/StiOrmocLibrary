import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import { env } from '../../config/env.js'

const SECRET_HEADER = 'x-job-runner-secret'

export function secretsMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received)
  const expectedBuffer = Buffer.from(expected)
  if (!received || !expected || receivedBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(receivedBuffer, expectedBuffer)
}

export const requireJobRunnerSecret: RequestHandler = (request, response, next) => {
  const expected = env.jobRunnerSecret
  if (!expected) {
    return response.status(503).json({
      success: false,
      code: 'JOB_RUNNER_MISCONFIGURED',
      message: 'Job runner secret is not configured.',
    })
  }
  const received = request.get(SECRET_HEADER) ?? ''
  if (!secretsMatch(received, expected)) {
    return response.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid job runner credentials.',
    })
  }
  response.set('Cache-Control', 'no-store')
  return next()
}
