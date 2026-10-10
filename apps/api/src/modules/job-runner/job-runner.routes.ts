import { Router } from 'express'
import { requireJobRunnerSecret } from './job-runner.auth.ts'
import { jobRunnerController } from './job-runner.controller.ts'

export const internalJobRunnerRouter = Router()
internalJobRunnerRouter.post('/:jobName', requireJobRunnerSecret, (request, response, next) => {
  void jobRunnerController.run(request, response, next)
})

export const adminJobRunnerRouter = Router()
adminJobRunnerRouter.get('/', (request, response, next) => {
  void jobRunnerController.list(request, response, next)
})
adminJobRunnerRouter.get('/:jobName/runs', (request, response, next) => {
  void jobRunnerController.runs(request, response, next)
})
