import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'

const bucket = 'floor-plan-images'
const allowed: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const client = env.supabase.url && env.supabase.secretKey
  ? createClient(env.supabase.url, env.supabase.secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null

function validateImage(file?: Express.Multer.File) {
  if (!file || !allowed[file.mimetype] || file.size < 1 || file.size > 4 * 1024 * 1024) {
    throw new HttpError(422, 'FLOOR_IMAGE_INVALID', 'Choose a PNG, JPEG, or WebP image up to 4 MB.')
  }
  const valid = file.mimetype === 'image/png'
    ? file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : file.mimetype === 'image/jpeg'
      ? file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      : file.buffer.subarray(0, 4).toString('ascii') === 'RIFF' && file.buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!valid) throw new HttpError(422, 'FLOOR_IMAGE_INVALID', 'The file content does not match its image type.')
  return file
}

export const floorPlanImageService = {
  async current() {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT i.id, i.storage_path AS "storagePath", i.original_name AS "originalName",
              i.uploaded_at AS "uploadedAt", a.school_id AS "uploadedBy"
         FROM floor_plan_images i JOIN accounts a ON a.account_id=i.uploaded_by_account_id
        WHERE i.is_current=TRUE LIMIT 1`,
    )
    const row = rows[0]
    if (!row) return null
    return { id: Number(row.id), originalName: row.originalName, uploadedAt: row.uploadedAt,
      uploadedBy: row.uploadedBy, imageUrl: client?.storage.from(bucket).getPublicUrl(String(row.storagePath)).data.publicUrl ?? null }
  },
  async upload(fileValue: Express.Multer.File | undefined, actorId: number) {
    const file = validateImage(fileValue)
    if (!client || env.db.driver !== 'postgres') throw new HttpError(503, 'FLOOR_IMAGE_STORAGE_UNAVAILABLE', 'Floor plan image storage is unavailable.')
    const storage = client.storage.from(bucket)
    const objectPath = `${randomUUID()}.${allowed[file.mimetype]}`
    const { error: uploadError } = await storage.upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false })
    if (uploadError) throw new HttpError(503, 'FLOOR_IMAGE_STORAGE_UNAVAILABLE', 'Floor plan image upload failed. Try again.')
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('UPDATE floor_plan_images SET is_current=FALSE WHERE is_current=TRUE')
      await connection.execute(
        `INSERT INTO floor_plan_images (storage_path, original_name, mime_type, uploaded_by_account_id, is_current)
         VALUES (?, ?, ?, ?, TRUE)`, [objectPath, file.originalname.slice(0, 255), file.mimetype, actorId],
      )
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      await storage.remove([objectPath])
      throw error
    } finally { connection.release() }
    return this.current()
  },
  async location(query: Record<string, unknown>) {
    const titleId = Number(query.titleId)
    if (!Number.isSafeInteger(titleId) || titleId < 1) throw new HttpError(422, 'BOOK_LOCATION_INVALID', 'Choose a valid book title.')
    const copyId = query.copyId ? Number(query.copyId) : null
    if (copyId !== null && (!Number.isSafeInteger(copyId) || copyId < 1)) throw new HttpError(422, 'BOOK_LOCATION_INVALID', 'Choose a valid book copy.')
    const barcode = typeof query.barcode === 'string' ? query.barcode.trim().slice(0, 100) : null
    const clauses = ["t.title_id=?", "t.record_type='Book'", "t.lifecycle_status='Active'", "pc.lifecycle_status='Active'"]
    const values: Array<string | number> = [titleId]
    if (copyId !== null) { clauses.push('pc.physical_copy_id=?'); values.push(copyId) }
    if (barcode) { clauses.push('pc.barcode=?'); values.push(barcode) }
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT pc.shelf_location AS "shelfLabel", pc.accession_number AS accession,
              t.title, t.call_number AS "callNumber"
         FROM titles t JOIN physical_copies pc ON pc.title_id=t.title_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY CASE WHEN pc.availability_status='Available' THEN 0 ELSE 1 END, pc.physical_copy_id
        LIMIT 1`, values,
    )
    return rows[0] ? { title: rows[0].title, shelfLabel: rows[0].shelfLabel, accession: rows[0].accession, callNumber: rows[0].callNumber } : null
  },
}
