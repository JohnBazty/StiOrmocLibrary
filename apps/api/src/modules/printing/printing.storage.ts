import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'

const uploadDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../storage/printing')
const bucket = 'printing-documents'
const storagePrefix = `supabase://${bucket}/`
const storage = env.supabase.url && env.supabase.secretKey
  ? createClient(env.supabase.url, env.supabase.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }).storage.from(bucket)
  : null
const extensions: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

function validSignature(file: Express.Multer.File) {
  if (file.mimetype === 'application/pdf') return file.buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return file.buffer.subarray(0, 2).toString('ascii') === 'PK' && file.buffer.includes(Buffer.from('[Content_Types].xml'))
  }
  return false
}

export function validatePrintDocumentFile(file?: Express.Multer.File) {
  if (!file) throw new HttpError(422, 'PRINT_FILE_REQUIRED', 'Select a PDF or DOCX document.')
  const extension = extensions[file.mimetype]
  if (!extension || !validSignature(file)) throw new HttpError(422, 'PRINT_FILE_INVALID', 'The document must be a genuine PDF or DOCX file.')
  const safeOriginalName = path.basename(file.originalname).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255)
  if (!safeOriginalName) throw new HttpError(422, 'PRINT_FILE_INVALID', 'The document filename is invalid.')
  return { extension, safeOriginalName }
}

export async function storePrintDocument(file?: Express.Multer.File) {
  const { extension, safeOriginalName } = validatePrintDocumentFile(file)
  if (!file) throw new HttpError(422, 'PRINT_FILE_REQUIRED', 'Select a PDF or DOCX document.')
  const storedName = `${randomUUID()}.${extension}`
  if (storage) {
    const { error } = await storage.upload(storedName, file.buffer, { contentType: file.mimetype, upsert: false })
    if (error) throw new HttpError(503, 'PRINT_STORAGE_UNAVAILABLE', 'The document storage is unavailable. Please try again.')
    return { originalName: safeOriginalName, storedPath: `${storagePrefix}${storedName}` }
  }
  if (process.env.VERCEL) throw new HttpError(503, 'PRINT_STORAGE_UNAVAILABLE', 'The document storage is not configured.')
  await mkdir(uploadDirectory, { recursive: true })
  const storedPath = path.join(uploadDirectory, storedName)
  await writeFile(storedPath, file.buffer, { flag: 'wx' })
  return { originalName: safeOriginalName, storedPath }
}

export async function removePrintDocument(storedPath: string) {
  if (storedPath.startsWith(storagePrefix)) {
    if (storage) await storage.remove([storedPath.slice(storagePrefix.length)])
    return
  }
  if (path.dirname(path.resolve(storedPath)) !== uploadDirectory) return
  await rm(storedPath, { force: true })
}

export async function resolvePrintDocument(storedPath: string) {
  if (storedPath.startsWith(storagePrefix)) {
    const objectPath = storedPath.slice(storagePrefix.length)
    if (!/^[a-f0-9-]{36}\.(pdf|docx)$/.test(objectPath) || !storage) throw new HttpError(404, 'PRINT_FILE_NOT_FOUND', 'The uploaded print document is no longer available.')
    const { data, error } = await storage.download(objectPath)
    if (error || !data) throw new HttpError(404, 'PRINT_FILE_NOT_FOUND', 'The uploaded print document is no longer available.')
    return Buffer.from(await data.arrayBuffer())
  }
  const candidate = path.resolve(storedPath)
  if (path.dirname(candidate) !== uploadDirectory) {
    throw new HttpError(404, 'PRINT_FILE_NOT_FOUND', 'The uploaded print document is no longer available.')
  }
  try {
    const [resolved, details] = await Promise.all([realpath(candidate), stat(candidate)])
    if (path.dirname(resolved) !== uploadDirectory || !details.isFile()) throw new Error('Invalid stored document')
    return await readFile(resolved)
  } catch {
    throw new HttpError(404, 'PRINT_FILE_NOT_FOUND', 'The uploaded print document is no longer available.')
  }
}
