import { Router, type NextFunction, type Request, type Response } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { HttpError } from '../../core/http-error.ts'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { db } from '../../config/db.js'
import { catalogUpload } from './catalog-enhancements.routes.ts'
import { importResearch, previewResearch } from './research-import.ts'

type Service = {
  preview: (file: { buffer: Buffer; originalname: string } | undefined, shelf: string) => Promise<unknown>
  save: (body: unknown) => Promise<unknown>
}
const defaultService: Service = { preview: (file, shelf) => previewResearch(db, file, shelf), save: (body) => importResearch(db, body) }

// Reading a file and checking every row is heavy work: a small per-account limit, like Find book details.
const importLimit = rateLimit({
  windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (request: Request, response: Response) => `account:${(response.locals.authenticatedUser as { accountId?: number } | undefined)?.accountId ?? ipKeyGenerator(request.ip ?? '')}`,
  message: { success: false, code: 'RESEARCH_IMPORT_RATE_LIMITED', message: 'Wait a minute before checking or importing again.' },
})
/** Turns multer's size and field errors into clear messages instead of a 500. */
const fileUpload = (request: Request, response: Response, next: NextFunction) => catalogUpload.single('file')(request, response, (error?: unknown) => {
  if (!error) return next()
  const code = (error as { code?: string }).code
  if (code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'RESEARCH_IMPORT_FILE_TOO_LARGE', 'The file must not exceed 4 MB.'))
  if (code?.startsWith('LIMIT_')) return next(new HttpError(422, 'RESEARCH_IMPORT_UPLOAD_INVALID', 'Choose one file in the "file" field.'))
  return next(error)
})

/** Research import from Excel/CSV, Librarian only (plan 2026-11-13-research-import). Preview saves nothing. */
export function createResearchImportRouter(service: Service = defaultService) {
  const router = Router()
  const run = (fn: (request: Request) => Promise<unknown>) => (request: Request, response: Response, next: NextFunction) => {
    response.set('Cache-Control', 'no-store')
    void fn(request).then((data) => response.json({ success: true, data })).catch(next)
  }
  router.post('/imports/preview', requireJwtRoles('Librarian'), importLimit, fileUpload, run((request) => service.preview(request.file, String(request.body?.shelf ?? ''))))
  router.post('/imports', requireJwtRoles('Librarian'), importLimit, run((request) => service.save(request.body)))
  return router
}

export const researchImportRouter = createResearchImportRouter()
