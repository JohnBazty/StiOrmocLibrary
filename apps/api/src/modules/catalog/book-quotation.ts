import { createClient } from '@supabase/supabase-js'
import type { Request, Response, NextFunction } from 'express'
import {requireLibraryActor} from '../../core/library-permissions.ts'
import type { Pool, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'

const bucket = 'book-quotations'
const storage = env.supabase.url && env.supabase.secretKey
  ? createClient(env.supabase.url, env.supabase.secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }).storage.from(bucket)
  : null
function titleId(value: unknown) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(422, 'BOOK_QUOTATION_TITLE_INVALID', 'Choose a valid book.')
  return id
}
function amount(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0 || number > 1_000_000 || Math.round(number * 100) !== number * 100) {
    throw new HttpError(422, 'BOOK_QUOTATION_AMOUNT_INVALID', 'Enter the supplier quotation amount in pesos, with up to two decimal places.')
  }
  return number
}
function rowDto(row: RowDataPacket) {
  return { quotationId: Number(row.quotation_id), titleId: Number(row.title_id), filename: row.original_name == null ? null : String(row.original_name), hasFile: Boolean(row.storage_path),
    quotedAmount: Number(row.quoted_amount), uploadedAt: row.created_at, current: Boolean(row.is_current) }
}

type QuotationStorage={download:(path:string)=>Promise<{data:Blob|null;error:unknown}>}
export function createBookQuotationService(database:Pool=db,legacyStorage:QuotationStorage|null=storage) { return {
  async list(value: unknown) {
    const id = titleId(value)
    const [rows] = await database.execute<RowDataPacket[]>(
      `SELECT q.*, CASE WHEN q.quotation_id = (SELECT MAX(q2.quotation_id) FROM book_quotations q2 WHERE q2.title_id=q.title_id) THEN 1 ELSE 0 END AS is_current
         FROM book_quotations q WHERE q.title_id=? ORDER BY q.quotation_id DESC`, [id])
    return rows.map(rowDto)
  },
  async create(value:unknown,quotedAmount:unknown,accountId:unknown) {
    const id=titleId(value),price=amount(quotedAmount),actorId=Number(accountId)
    if(!Number.isSafeInteger(actorId)||actorId<1)throw new HttpError(401,'JWT_REQUIRED','Sign in again.')
    const connection=await database.getConnection()
    try{
      await connection.beginTransaction()
      await requireLibraryActor(connection,actorId,'library.manage')
      const [titles]=await connection.execute<RowDataPacket[]>("SELECT title_id FROM titles WHERE title_id=? AND record_type='Book' AND lifecycle_status='Active' LIMIT 1 FOR UPDATE",[id])
      if(!titles[0])throw new HttpError(404,'BOOK_QUOTATION_TITLE_NOT_FOUND','The active book was not found.')
      const [actors]=await connection.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=? LIMIT 1',[actorId])
      const [result]=await connection.execute<ResultSetHeader>('INSERT INTO book_quotations(title_id,storage_path,original_name,mime_type,quoted_amount,uploaded_by_user_id) VALUES (?,NULL,NULL,NULL,?,?)',[id,price,actors[0]?.user_id??null])
      await connection.commit()
      return {quotationId:Number(result.insertId),titleId:id,filename:null,hasFile:false,quotedAmount:price,current:true}
    }catch(error){await connection.rollback();throw error}finally{connection.release()}
  },
  async download(value: unknown, quotationValue: unknown) {
    const id = titleId(value), quotationId = titleId(quotationValue)
    const [rows] = await database.execute<RowDataPacket[]>('SELECT storage_path,original_name,mime_type FROM book_quotations WHERE title_id=? AND quotation_id=? LIMIT 1', [id, quotationId])
    if (!rows[0]?.storage_path || !legacyStorage) throw new HttpError(404, 'BOOK_QUOTATION_NOT_FOUND', 'The supplier quotation is unavailable.')
    const { data, error } = await legacyStorage.download(String(rows[0].storage_path))
    if (error || !data) throw new HttpError(404, 'BOOK_QUOTATION_NOT_FOUND', 'The supplier quotation file is unavailable.')
    return { bytes: Buffer.from(await data.arrayBuffer()), mimeType: String(rows[0].mime_type), filename: String(rows[0].original_name) }
  },
}}
export const bookQuotation=createBookQuotationService()

export const bookQuotationController = {
  list: (request: Request, response: Response, next: NextFunction) => { void bookQuotation.list(request.params.titleId).then(data => response.json({ success: true, data })).catch(next) },
  create: (request: Request, response: Response, next: NextFunction) => {
    const accountId = (response.locals.authenticatedUser as { accountId?: number } | undefined)?.accountId
    void bookQuotation.create(request.params.titleId, request.body?.quoted_amount, accountId)
      .then(data => response.status(201).json({ success: true, data })).catch(next)
  },
  download: (request: Request, response: Response, next: NextFunction) => {
    void bookQuotation.download(request.params.titleId, request.params.quotationId).then(({ bytes, mimeType, filename }) => {
      response.set({ 'Content-Type': mimeType, 'Content-Disposition': `attachment; filename="${filename.replace(/["\\\r\n]/g, '')}"`, 'Cache-Control': 'private, no-store' }).send(bytes)
    }).catch(next)
  },
}
