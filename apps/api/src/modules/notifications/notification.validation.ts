import { HttpError } from '../../core/http-error.ts'

export type AnnouncementInput = {
  title: string
  body: string
  priority: 'Normal' | 'Important' | 'Urgent'
  publishAt: Date | null
  expiresAt: Date | null
}

function text(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : ''
}

function optionalDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) throw new HttpError(422, 'ANNOUNCEMENT_VALIDATION_FAILED', `${field} must be a valid date and time.`)
  return date
}

export function validateAnnouncement(body: unknown): AnnouncementInput {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const title = text(input.title, 150)
  const messageBody = text(input.message_body ?? input.body, 5000)
  const priority = text(input.priority, 20) || 'Normal'
  const publishAt = optionalDate(input.publish_at ?? input.publishAt, 'Publish time')
  const expiresAt = optionalDate(input.expires_at ?? input.expiresAt, 'Expiration time')
  const errors: Record<string, string> = {}
  if (title.length < 3) errors.title = 'Announcement title must contain at least 3 characters.'
  if (messageBody.length < 5) errors.message_body = 'Announcement message must contain at least 5 characters.'
  if (!['Normal', 'Important', 'Urgent'].includes(priority)) errors.priority = 'Priority must be Normal, Important, or Urgent.'
  if (expiresAt && publishAt && expiresAt <= publishAt) errors.expires_at = 'Expiration must be after the publication time.'
  if (expiresAt && !publishAt && expiresAt <= new Date()) errors.expires_at = 'Expiration must be in the future.'
  if (Object.keys(errors).length) throw new HttpError(422, 'ANNOUNCEMENT_VALIDATION_FAILED', 'Please correct the announcement fields.', { errors })
  return { title, body: messageBody, priority: priority as AnnouncementInput['priority'], publishAt, expiresAt }
}

export function positiveNotificationId(value: unknown) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new HttpError(422, 'NOTIFICATION_ID_INVALID', 'The notification ID is invalid.')
  return parsed
}
