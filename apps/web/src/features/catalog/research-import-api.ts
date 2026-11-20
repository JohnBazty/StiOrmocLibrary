import { enhancedRequest } from './enhanced-catalog-api'

export type ResearchRowData = {
  title: string; authors: string[]; adviser: string; year: number; abstract: string; researchCode: string
  departmentOrProgram: string; keywords: string | null; copy: { shelfLocation: string }
}
export type ResearchImportRow = { line: number; data: ResearchRowData; errors: Record<string, string> }
export type ResearchImportPreview = { missingColumns: string[]; rows: ResearchImportRow[] }
export type ResearchImportResult = { imported: number; failed: Array<{ line: number; message: string }> }

const base = '/api/v1/admin/maintenance/research-imports'
export const researchImportApi = {
  /** Reads and checks the file; saves nothing. */
  preview: (file: File, shelfLocation: string) => {
    const form = new FormData()
    form.set('research', file)
    form.set('shelfLocation', shelfLocation)
    return enhancedRequest<ResearchImportPreview>(`${base}/preview`, { method: 'POST', body: form })
  },
  /** Adds the rows; each is saved on its own and re-checked by the server. */
  importRows: (rows: Array<{ line: number; data: ResearchRowData }>) =>
    enhancedRequest<ResearchImportResult>(base, { method: 'POST', body: JSON.stringify({ rows }) }),
}
