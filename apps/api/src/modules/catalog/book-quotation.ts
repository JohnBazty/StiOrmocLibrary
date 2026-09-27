import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'

const bucket = 'book-quotations'
const storage = env.supabase.url && env.supabase.secretKey
  ? createClient(env.supabase.url, env.supabase.secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }).storage.from(bucket)
  : null
const extensions: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }
export const quotationUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single('quotation')

function titleId(value: unknown) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(422, 'BOOK_QUOTATION_TITLE_INVALID', 'Choose a valid book.')
  return id
}
function validFile(file?: Express.Multer.File) {
  if (!file || !extensions[file.mimetype] || !file.buffer.length) throw new HttpError(422, 'BOOK_QUOTATION_FILE_INVALID', 'Choose a PDF, JPEG, or PNG quotation up to 5 MB.')
  const bytes = file.buffer
  const valid = file.mimetype === 'application/pdf' ? bytes.subarray(0, 5).toString('ascii') === '%PDF-'
    : file.mimetype === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      : bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (!valid) throw new HttpError(422, 'BOOK_QUOTATION_FILE_INVALID', 'The quotation file does not match its PDF or image format.')
  return { filename: file.originalname.replace(/[\u0000-\u001f\u007f\\/]/g, '').slice(0, 255) || 'quotation', extension: extensions[file.mimetype] }
}
function amount(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0 || number > 1_000_000 || Math.round(number * 100) !== number * 100) {
    throw new HttpError(422, 'BOOK_QUOTATION_AMOUNT_INVALID', 'Enter the supplier quotation amount in pesos, with up to two decimal places.')
  }
  return number
}
function rowDto(row: RowDataPacket) {
  return { quotationId: Number(row.quotation_id), titleId: Number(row.title_id), filename: String(row.original_name),
    quotedAmount: Number(row.quoted_amount), uploadedAt: row.created_at, current: Boolean(row.is_current) }
}

export const bookQuotation = {
  async list(value: unknown) {
    const id = titleId(value)
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT q.*, CASE WHEN q.quotation_id = (SELECT MAX(q2.quotation_id) FROM book_quotations q2 WHERE q2.title_id=q.title_id) THEN 1 ELSE 0 END AS is_current
         FROM book_quotations q WHERE q.title_id=? ORDER BY q.quotation_id DESC`, [id])
    return rows.map(rowDto)
  },
  async upload(value: unknown, file: Express.Multer.File | undefined, quotedAmount: unknown, accountId: unknown) {
    const id = titleId(value)
    const details = validFile(file)
    const price = amount(quotedAmount)
    if (!file || !storage) throw new HttpError(503, 'BOOK_QUOTATION_STORAGE_UNAVAILABLE', 'Private quotation storage is not configured.')
    const connection = await db.getConnection()
    let path: string | null = null
    try {
      await connection.beginTransaction()
      const [titles] = await connection.execute<RowDataPacket[]>("SELECT title_id FROM titles WHERE title_id=? AND record_type='Book' AND lifecycle_status='Active' LIMIT 1 FOR UPDATE", [id])
      if (!titles[0]) throw new HttpError(404, 'BOOK_QUOTATION_TITLE_NOT_FOUND', 'The active book was not found.')
      const actorId = Number(accountId)
      const [actors] = await connection.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=? LIMIT 1', [actorId])
      path = `${id}/${randomUUID()}.${details.extension}`
      const { error } = await storage.upload(path, file.buffer, { contentType: file.mimetype, upsert: false })
      if (error) throw new HttpError(503, 'BOOK_QUOTATION_STORAGE_UNAVAILABLE', 'The private quotation could not be stored.')
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT INTO book_quotations(title_id,storage_path,original_name,mime_type,quoted_amount,uploaded_by_user_id) VALUES (?,?,?,?,?,?)',
        [id, path, details.filename, file.mimetype, price, actors[0]?.user_id ?? null])
      await connection.commit()
      return { quotationId: Number(result.insertId), titleId: id, filename: details.filename, quotedAmount: price, current: true }
    } catch (error) {
      await connection.rollback()
      if (path) await storage.remove([path]).catch(() => undefined)
      throw error
    } finally { connection.release() }
  },
  async download(value: unknown, quotationValue: unknown) {
    const id = titleId(value), quotationId = titleId(quotationValue)
    const [rows] = await db.execute<RowDataPacket[]>('SELECT storage_path,original_name,mime_type FROM book_quotations WHERE title_id=? AND quotation_id=? LIMIT 1', [id, quotationId])
    if (!rows[0] || !storage) throw new HttpError(404, 'BOOK_QUOTATION_NOT_FOUND', 'The supplier quotation is unavailable.')
    const { data, error } = await storage.download(String(rows[0].storage_path))
    if (error || !data) throw new HttpError(404, 'BOOK_QUOTATION_NOT_FOUND', 'The supplier quotation file is unavailable.')
    return { bytes: Buffer.from(await data.arrayBuffer()), mimeType: String(rows[0].mime_type), filename: String(rows[0].original_name) }
  },
}

export const bookQuotationController = {
  list: (request: Request, response: Response, next: NextFunction) => { void bookQuotation.list(request.params.titleId).then(data => response.json({ success: true, data })).catch(next) },
  upload: (request: Request, response: Response, next: NextFunction) => {
    const accountId = (response.locals.authenticatedUser as { accountId?: number } | undefined)?.accountId
    void bookQuotation.upload(request.params.titleId, request.file, request.body?.quoted_amount, accountId)
      .then(data => response.status(201).json({ success: true, data })).catch(next)
  },
  download: (request: Request, response: Response, next: NextFunction) => {
    void bookQuotation.download(request.params.titleId, request.params.quotationId).then(({ bytes, mimeType, filename }) => {
      response.set({ 'Content-Type': mimeType, 'Content-Disposition': `attachment; filename="${filename.replace(/["\\\r\n]/g, '')}"`, 'Cache-Control': 'private, no-store' }).send(bytes)
    }).catch(next)
  },
}
