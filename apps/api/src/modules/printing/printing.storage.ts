import { randomUUID } from 'node:crypto'
import { mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HttpError } from '../../core/http-error.ts'

const uploadDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../storage/printing')
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

export async function storePrintDocument(file?: Express.Multer.File) {
  if (!file) throw new HttpError(422, 'PRINT_FILE_REQUIRED', 'Select a PDF or DOCX document.')
  const extension = extensions[file.mimetype]
  if (!extension || !validSignature(file)) throw new HttpError(422, 'PRINT_FILE_INVALID', 'The document must be a genuine PDF or DOCX file.')
  const safeOriginalName = path.basename(file.originalname).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255)
  if (!safeOriginalName) throw new HttpError(422, 'PRINT_FILE_INVALID', 'The document filename is invalid.')
  await mkdir(uploadDirectory, { recursive: true })
  const storedName = `${randomUUID()}.${extension}`
  const storedPath = path.join(uploadDirectory, storedName)
  await writeFile(storedPath, file.buffer, { flag: 'wx' })
  return { originalName: safeOriginalName, storedPath }
}

export async function removePrintDocument(storedPath: string) {
  if (path.dirname(path.resolve(storedPath)) !== uploadDirectory) return
  await rm(storedPath, { force: true })
}

export async function resolvePrintDocument(storedPath: string) {
  const candidate = path.resolve(storedPath)
  if (path.dirname(candidate) !== uploadDirectory) {
    throw new HttpError(404, 'PRINT_FILE_NOT_FOUND', 'The uploaded print document is no longer available.')
  }
  try {
    const [resolved, details] = await Promise.all([realpath(candidate), stat(candidate)])
    if (path.dirname(resolved) !== uploadDirectory || !details.isFile()) throw new Error('Invalid stored document')
    return resolved
  } catch {
    throw new HttpError(404, 'PRINT_FILE_NOT_FOUND', 'The uploaded print document is no longer available.')
  }
}
