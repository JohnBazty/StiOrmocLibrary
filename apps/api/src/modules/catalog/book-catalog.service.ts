import type { Pool } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { reservationService } from '../reservations/reservation.service.ts'
import {
  queryBookCatalog,
  queryBookCategories,
  queryBookOverview,
  queryReservationTarget,
  queryViewerActiveBookCount,
} from './book-catalog.repository.ts'
import { parseBookCatalogFilters, parseBookTitleId } from './book-catalog.validation.ts'

export type CatalogViewer = { accountId: number; role: 'Admin' | 'Librarian' | 'Student' | 'Faculty' }

export function createBookCatalogService(database: Pool = db) {
  return {
    categories: () => queryBookCategories(database),

    async list(query: Record<string, unknown>, viewer: CatalogViewer) {
      const [catalog, activeBookCount] = await Promise.all([
        queryBookCatalog(database, parseBookCatalogFilters(query)),
        viewer.role === 'Student' ? queryViewerActiveBookCount(database, viewer.accountId) : Promise.resolve(0),
      ])
      return {
        ...catalog,
        viewer: {
          role: viewer.role,
          activeBookCount,
          bookLimit: viewer.role === 'Student' ? 2 : null,
        },
      }
    },

    async overview(titleIdValue: unknown) {
      const titleId = parseBookTitleId(titleIdValue)
      const book = await queryBookOverview(database, titleId)
      if (!book) throw new HttpError(404, 'BOOK_TITLE_NOT_FOUND', 'The requested book title does not exist or is archived.')
      return book
    },

    async reserve(titleIdValue: unknown, viewer: CatalogViewer) {
      if (!['Student', 'Faculty'].includes(viewer.role)) {
        throw new HttpError(403, 'BOOK_RESERVATION_ROLE_FORBIDDEN', 'Only Student or Faculty accounts may reserve catalog books.')
      }
      const titleId = parseBookTitleId(titleIdValue)
      const target = await queryReservationTarget(database, viewer.accountId, titleId)
      if (!target || !target.userId || !target.materialId) {
        throw new HttpError(422, 'BOOK_RESERVATION_UNAVAILABLE', 'This account or title is not linked to a reservable physical copy.')
      }
      return reservationService.create(target.userId, { materialId: target.materialId })
    },
  }
}

export const bookCatalogService = createBookCatalogService()
