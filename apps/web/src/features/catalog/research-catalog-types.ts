export type ResearchAccessStatus = 'Available' | 'Reserved' | 'Unavailable'

export type ResearchCatalogItem = {
  titleId: number
  researchRecordId: number
  researchInventoryId: number | null
  researchCode: string
  title: string
  authors: string
  adviser: string
  department: string
  publicationYear: number | null
  shelfLocation: string
  abstract: string
  keywords: string | null
  accessStatus: ResearchAccessStatus
  viewOnly: true
}

export type ResearchPagination = {
  page: number
  limit: number
  total: number
  totalPages: number
}
