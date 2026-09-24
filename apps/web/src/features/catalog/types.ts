export type CatalogItem = {
  titleId: number
  recordType: 'Book' | 'Research/Thesis'
  title: string
  authors: string[]
  isbn: string | null
  publicationYear: number | null
  categoryId: number | null
  categoryName: string | null
  rowVersion: number
  shelfLocation: string | null
  actualShelfLocations: string[]
  activeInventoryCount: number
  shelfStatus: 'Mapped' | 'Mismatch' | 'No active copies'
  availability: string
  totalCopies: number
  availableCopies: number
  research: null | { researchInventoryId: number | null; researchCode: string; adviser: string; departmentOrProgram: string }
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

export type AdminBookAsset = {
  physicalCopyId?: number
  researchInventoryId?: number
  titleId: number
  title: string
  author: string
  accessionNumber: string
  barcode: string
  shelfLocation: string
  qrCodeData: string
  barcodeImageData: string
}

export type Category = { categoryId: number; categoryName: string; shelfLocation: string; shelfColumn?: number; shelfRow?: number; totalBooksCount?: number; totalThesisCount?: number }

export type GeneratedBookLabel = {
  physicalCopyId: number
  materialId: number
  titleId: number
  title: string
  author: string
  isbn: string
  shelfLocation: string
  shelfColumn?: number
  shelfRow?: number
  accessionNumber: string
  barcode: string
  qrCodeData: string
  barcodeImageData: string
}

export type BulkBookResult = {
  titleId: number
  createdTitle: boolean
  numberOfCopies: number
  copies: GeneratedBookLabel[]
}

export type CategoryAssignmentResult = {
  titleId: number
  recordType: CatalogItem['recordType']
  categoryId: number
  categoryName: string
  shelfLocation: string
  shelfColumn: number
  shelfRow: number
  rowVersion: number
  bookCopies: number
  researchCopies: number
  previousShelves: Array<{ shelf: string; count: number }>
}

export type IsbnMetadata = {
  isbn: string
  title: string
  author: string
  publisher: string | null
  publicationYear: number | null
  source: 'local_catalog' | 'google_books' | 'open_library'
}

export type CatalogFilters = {
  q: string
  scope: 'all' | 'books' | 'research'
  categoryId: string
  author: string
  publicationYear: string
  availability: string
}
