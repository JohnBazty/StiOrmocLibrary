import type { Pool } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { queryResearchCatalog, queryResearchOverview } from './research-catalog.repository.ts'
import { parseResearchCatalogFilters, parseResearchTitleId } from './research-catalog.validation.ts'

export function createResearchCatalogService(database: Pool = db) {
  return {
    list: (query: Record<string, unknown>) => queryResearchCatalog(database, parseResearchCatalogFilters(query)),
    async overview(researchIdValue: unknown) {
      const record = await queryResearchOverview(database, parseResearchTitleId(researchIdValue))
      if (!record) throw new HttpError(404, 'RESEARCH_RECORD_NOT_FOUND', 'The requested research record does not exist or is archived.')
      return record
    },
  }
}

export const researchCatalogService = createResearchCatalogService()
