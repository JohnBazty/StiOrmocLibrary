import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../../core/http-error.ts'
import { getRecentJobRuns, getScheduledJobStatuses, runScheduledJob } from './job-runner.service.ts'

export const jobRunnerController = {
  async run(request: Request, response: Response, next: NextFunction) {
    try {
      if (request.method !== 'POST') {
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST to run a scheduled job.')
      }
      const result = await runScheduledJob(String(request.params.jobName ?? ''))
      response.set('Cache-Control', 'no-store')
      return response.status(200).json({
        success: true,
        data: {
          jobName: result.jobName,
          runId: result.runId,
          outcome: result.outcome,
          counts: result.counts,
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        },
      })
    } catch (error) {
      if (error instanceof HttpError && error.details && typeof error.details === 'object' && 'outcome' in error.details) {
        response.set('Cache-Control', 'no-store')
        return response.status(error.status).json({
          success: false,
          code: error.code,
          message: error.message,
          data: {
            jobName: error.details.jobName,
            runId: error.details.runId ?? null,
            outcome: error.details.outcome,
            errorCode: error.code,
          },
        })
      }
      return next(error)
    }
  },

  async list(_request: Request, response: Response, next: NextFunction) {
    try {
      const items = await getScheduledJobStatuses()
      return response.json({ success: true, data: { items } })
    } catch (error) {
      return next(error)
    }
  },

  async runs(request: Request, response: Response, next: NextFunction) {
    try {
      const limit = Number(request.query.limit ?? 20)
      const items = await getRecentJobRuns(String(request.params.jobName ?? ''), limit)
      return response.json({ success: true, data: { items } })
    } catch (error) {
      return next(error)
    }
  },
}
