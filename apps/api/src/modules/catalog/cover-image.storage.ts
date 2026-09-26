import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets/covers')
const bucket = 'book-covers'
const storage = env.supabase.url && env.supabase.secretKey
  ? createClient(env.supabase.url, env.supabase.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }).storage.from(bucket)
  : null
const publicPrefix = env.supabase.url
  ? `${new URL(env.supabase.url).origin}/storage/v1/object/public/${bucket}/`
  : ''
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_BYTES = 2 * 1024 * 1024

export async function storeCoverImage(dataUri: string | null) {
  if (!dataUri) return null
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUri)
  if (!match || !TYPES[match[1]]) throw new HttpError(422, 'BOOK_COVER_INVALID', 'Book cover must be a JPEG, PNG, or WebP image.')
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > MAX_BYTES) throw new HttpError(422, 'BOOK_COVER_INVALID', 'Book cover must not exceed 2 MB.')
  const validSignature = match[1] === 'image/jpeg'
    ? buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : match[1] === 'image/png'
      ? buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!validSignature) throw new HttpError(422, 'BOOK_COVER_INVALID', 'The uploaded file content does not match its declared image type.')
  const filename = `${randomUUID()}.${TYPES[match[1]]}`
  if (env.db.driver === 'postgres') {
    if (!storage) throw new HttpError(503, 'BOOK_COVER_STORAGE_UNAVAILABLE', 'Book cover storage is not configured.')
    const { error } = await storage.upload(filename, buffer, { contentType: match[1], upsert: false })
    if (error) throw new HttpError(503, 'BOOK_COVER_STORAGE_UNAVAILABLE', 'Book cover storage is unavailable. Please try again.')
    return storage.getPublicUrl(filename).data.publicUrl
  }
  if (process.env.VERCEL) throw new HttpError(503, 'BOOK_COVER_STORAGE_UNAVAILABLE', 'Book cover storage is not configured.')
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, filename), buffer, { flag: 'wx' })
  return `/api/assets/covers/${filename}`
}

export async function removeStoredCover(publicPath: string | null) {
  if (publicPrefix && publicPath?.startsWith(publicPrefix)) {
    const filename = publicPath.slice(publicPrefix.length)
    if (/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(filename) && storage) await storage.remove([filename])
    return
  }
  if (!publicPath?.startsWith('/api/assets/covers/')) return
  await rm(path.join(directory, path.basename(publicPath)), { force: true })
}
