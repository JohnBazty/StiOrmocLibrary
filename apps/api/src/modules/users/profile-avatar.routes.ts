import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import type { RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'

const bucket = 'profile-avatars'
const allowed: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const storage = env.supabase.url && env.supabase.secretKey
  ? createClient(env.supabase.url, env.supabase.secretKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(bucket)
  : null
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } }).single('image')
const handle = (fn: (request: Request, response: Response) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => { void fn(request, response).catch(next) }
const accountId = (response: Response) => Number(response.locals.authenticatedUser?.accountId)
const requireSupabase = () => {
  if (env.db.driver !== 'postgres' || !storage) throw new HttpError(503, 'AVATAR_STORAGE_UNAVAILABLE', 'Profile image storage is unavailable.')
}

function validate(file?: Express.Multer.File) {
  if (!file || !allowed[file.mimetype] || file.size < 1 || file.size > 2 * 1024 * 1024) {
    throw new HttpError(422, 'AVATAR_INVALID', 'Choose a PNG, JPEG, or WebP image up to 2 MB.')
  }
  const valid = file.mimetype === 'image/png'
    ? file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : file.mimetype === 'image/jpeg'
      ? file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      : file.buffer.subarray(0, 4).toString('ascii') === 'RIFF' && file.buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!valid) throw new HttpError(422, 'AVATAR_INVALID', 'The image content does not match its file type.')
  requireSupabase()
  return file
}

async function signedUrl(path: string) {
  const { data, error } = await storage!.createSignedUrl(path, 300)
  if (error || !data?.signedUrl) throw new HttpError(503, 'AVATAR_STORAGE_UNAVAILABLE', 'Unable to show the image right now.')
  return data.signedUrl
}

export const profileAvatarRouter = Router()
profileAvatarRouter.get('/me', handle(async (_request, response) => {
  requireSupabase()
  const id = accountId(response)
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT submission_id,storage_path,status,submitted_at,reviewed_at,review_reason
       FROM profile_avatar_submissions WHERE account_id=? ORDER BY submitted_at DESC,submission_id DESC`, [id],
  )
  const approved = rows.find(row => row.status === 'Approved')
  const pending = rows.find(row => row.status === 'Pending')
  const rejected = rows.find(row => row.status === 'Rejected' && row.review_reason !== 'Superseded by a newer upload')
  response.set('Cache-Control', 'private, no-store').json({ success: true, data: {
    currentUrl: approved ? await signedUrl(String(approved.storage_path)) : null,
    pending: pending ? { id: Number(pending.submission_id), submittedAt: pending.submitted_at } : null,
    lastRejection: rejected && (!approved || new Date(rejected.submitted_at).getTime() > new Date(approved.submitted_at).getTime())
      ? { reviewedAt: rejected.reviewed_at, reason: rejected.review_reason } : null,
  } })
}))
profileAvatarRouter.post('/me', rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: true, legacyHeaders: false }), (request, response, next) => upload(request, response, error => {
  if ((error as { code?: string } | undefined)?.code === 'LIMIT_FILE_SIZE') return next(new HttpError(422, 'AVATAR_INVALID', 'Choose an image up to 2 MB.'))
  return error ? next(error) : next()
}), handle(async (request, response) => {
  const file = validate(request.file)
  const id = accountId(response)
  const path = `${id}/${randomUUID()}.${allowed[file.mimetype]}`
  const { error } = await storage!.upload(path, file.buffer, { contentType: file.mimetype, upsert: false })
  if (error) throw new HttpError(503, 'AVATAR_STORAGE_UNAVAILABLE', 'Image upload failed. Try again.')
  let connection: Awaited<ReturnType<typeof db.getConnection>> | undefined
  let committing = false
  try {
    connection = await db.getConnection()
    await connection.beginTransaction()
    const [accounts] = await connection.execute<RowDataPacket[]>(
      "SELECT account_id FROM accounts WHERE account_id=? AND account_status='Active' FOR UPDATE", [id],
    )
    if (!accounts.length) throw new HttpError(403, 'ACCOUNT_ACCESS_REVOKED', 'Your account access changed. Sign in again.')
    await connection.execute(
      `UPDATE profile_avatar_submissions SET status='Rejected',review_reason='Superseded by a newer upload',reviewed_at=NOW()
       WHERE account_id=? AND status='Pending'`, [id],
    )
    await connection.execute(
      `INSERT INTO profile_avatar_submissions(account_id,storage_path,mime_type,status,submitted_at)
       VALUES (?,?,?,'Approved',clock_timestamp())`, [id, path, file.mimetype],
    )
    committing = true
    await connection.commit()
  } catch (cause) {
    await connection?.rollback().catch(() => undefined)
    // A lost commit response may still have saved the picture. Keep its object in that case.
    if (!committing) await storage!.remove([path])
    throw cause
  } finally { connection?.release() }
  response.set('Cache-Control', 'private, no-store').status(201).json({ success: true, data: { status: 'Approved' } })
}))
