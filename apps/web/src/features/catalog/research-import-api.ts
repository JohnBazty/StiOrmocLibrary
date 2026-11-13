import { enhancedRequest } from './enhanced-catalog-api'

export type ResearchImportFields = Record<'copyNumbers' | 'authors' | 'year' | 'title' | 'program' | 'adviser' | 'abstract' | 'keywords' | 'researchCode' | 'shelf', string>
export type ResearchImportRow = {
  row: number
  fields: ResearchImportFields
  errors: string[]
  conflict: boolean
  copies: number[]
  accessionNumbers: string[]
  researchCode: string
  programId: number | null
  programName: string | null
  shelf: string
}
export type ResearchImportPreview = { rows: ResearchImportRow[]; unknownPrograms: string[]; total: number; errorCount: number }

const base = '/api/v1/admin/research/imports'
export const researchImportApi = {
  preview(file: File, shelf: string) {
    const form = new FormData()
    form.set('shelf', shelf); form.set('file', file)
    return enhancedRequest<ResearchImportPreview>(`${base}/preview`, { method: 'POST', body: form })
  },
  save: (body: { shelf: string; rows: Array<ResearchImportFields & { row: number }> }) => enhancedRequest<{ titles: number; copies: number }>(base, { method: 'POST', body: JSON.stringify(body) }),
}
