import type { NextFunction, Request, Response } from 'express'
import { notificationRepository } from './notification.repository.ts'
import { positiveNotificationId, validateAnnouncement } from './notification.validation.ts'

function actor(response: Response) {
  const user = response.locals.authenticatedUser as { accountId?: number; id?: number; role?: string } | undefined
  return { accountId: user?.accountId ?? user?.id, role: user?.role }
}
function handle(handler: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => { void handler(request, response).catch(next) }
}

export const notificationController = {
  list: handle(async (request, response) => { response.json({ success: true, data: await notificationRepository.list(actor(response), request.query as Record<string, unknown>) }) }),
  read: handle(async (request, response) => { response.json({ success: true, data: await notificationRepository.markRead(actor(response), positiveNotificationId(request.params.id)) }) }),
  readAll: handle(async (_request, response) => { response.json({ success: true, data: await notificationRepository.markAllRead(actor(response)) }) }),
  schedule: handle(async (_request, response) => { response.json({ success: true, data: await notificationRepository.schedule() }) }),
  createAnnouncement: handle(async (request, response) => { response.status(201).json({ success: true, data: await notificationRepository.createAnnouncement(actor(response), validateAnnouncement(request.body)) }) }),
  announcements: handle(async (_request, response) => { response.json({ success: true, data: await notificationRepository.announcements(actor(response)) }) }),
}
