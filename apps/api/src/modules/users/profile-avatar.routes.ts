import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import type { RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'

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
  response.json({ success: true, data: {
    currentUrl: approved ? await signedUrl(String(approved.storage_path)) : null,
    pending: pending ? { id: Number(pending.submission_id), submittedAt: pending.submitted_at } : null,
    lastRejection: rejected && (!approved || new Date(rejected.submitted_at).getTime() > new Date(approved.submitted_at).getTime())
      ? { reviewedAt: rejected.reviewed_at, reason: rejected.review_reason } : null,
  } })
}))
profileAvatarRouter.post('/me', (request, response, next) => upload(request, response, error => {
  if ((error as { code?: string } | undefined)?.code === 'LIMIT_FILE_SIZE') return next(new HttpError(422, 'AVATAR_INVALID', 'Choose an image up to 2 MB.'))
  return error ? next(error) : next()
}), handle(async (request, response) => {
  const file = validate(request.file)
  const id = accountId(response)
  const path = `${id}/${randomUUID()}.${allowed[file.mimetype]}`
  const { error } = await storage!.upload(path, file.buffer, { contentType: file.mimetype, upsert: false })
  if (error) throw new HttpError(503, 'AVATAR_STORAGE_UNAVAILABLE', 'Image upload failed. Try again.')
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute(
      `UPDATE profile_avatar_submissions SET status='Rejected',review_reason='Superseded by a newer upload',reviewed_at=NOW()
       WHERE account_id=? AND status='Pending'`, [id],
    )
    await connection.execute(
      `INSERT INTO profile_avatar_submissions(account_id,storage_path,mime_type,status)
       VALUES (?,?,?,'Pending')`, [id, path, file.mimetype],
    )
    await connection.commit()
  } catch (cause) {
    await connection.rollback(); await storage!.remove([path]); throw cause
  } finally { connection.release() }
  response.status(201).json({ success: true, data: { status: 'Pending' } })
}))
profileAvatarRouter.get('/submissions', requireJwtRoles('Admin'), handle(async (_request, response) => {
  requireSupabase()
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT p.submission_id,p.account_id,p.storage_path,p.submitted_at,a.school_id,
            COALESCE(u.full_name,a.school_id) AS full_name
       FROM profile_avatar_submissions p JOIN accounts a ON a.account_id=p.account_id
       LEFT JOIN users u ON u.user_id=a.user_id WHERE p.status='Pending'
      ORDER BY p.submitted_at ASC LIMIT 100`, [],
  )
  response.json({ success: true, data: await Promise.all(rows.map(async row => ({
    id: Number(row.submission_id), accountId: Number(row.account_id), schoolId: row.school_id,
    name: row.full_name, submittedAt: row.submitted_at, previewUrl: await signedUrl(String(row.storage_path)),
  }))) })
}))
profileAvatarRouter.post('/submissions/:id/review', requireJwtRoles('Admin'), handle(async (request, response) => {
  requireSupabase()
  const id = Number(request.params.id)
  const decision = String(request.body?.decision ?? '')
  if (!Number.isSafeInteger(id) || id < 1 || !['approve', 'reject'].includes(decision)) {
    throw new HttpError(422, 'AVATAR_REVIEW_INVALID', 'Choose approve or reject.')
  }
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT submission_id,account_id FROM profile_avatar_submissions WHERE submission_id=? AND status=\'Pending\' FOR UPDATE', [id],
    )
    if (!rows.length) throw new HttpError(409, 'AVATAR_ALREADY_REVIEWED', 'This image is no longer awaiting review.')
    await connection.execute(
      `UPDATE profile_avatar_submissions SET status=?,reviewed_by_account_id=?,reviewed_at=NOW(),review_reason=?
       WHERE submission_id=?`, [decision === 'approve' ? 'Approved' : 'Rejected', accountId(response), decision === 'approve' ? 'Profile picture approved by Admin.' : 'Profile picture rejected by Admin.', id],
    )
    await connection.commit()
    response.json({ success: true, data: { id, status: decision === 'approve' ? 'Approved' : 'Rejected' } })
  } catch (cause) { await connection.rollback(); throw cause }
  finally { connection.release() }
}))
