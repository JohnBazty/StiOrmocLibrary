export type CatalogItem = {
  titleId: number
  recordType: 'Book' | 'Research/Thesis'
  title: string
  authors: string[]
  isbn: string | null
  publicationYear: number | null
  categoryId: number | null
  categoryName: string | null
  availability: string
  totalCopies: number
  availableCopies: number
  research: null | { researchCode: string; adviser: string; departmentOrProgram: string }
}

export type PhysicalCopy = {
  physicalCopyId: number
  title: string
  barcode: string
  accessionNumber: string
  shelfLocation: string
  conditionStatus: string
  availabilityStatus: string
  lifecycleStatus: string
  lastScannedAt: string | null
}

export type Category = { categoryId: number; categoryName: string; shelfLocation?: string; totalBooksCount?: number; totalThesisCount?: number }

export type CatalogFilters = {
  q: string
  scope: 'all' | 'books' | 'research'
  categoryId: string
  author: string
  publicationYear: string
  availability: string
}
