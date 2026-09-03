import type { AuthRole } from '../auth/auth-storage'

export type BookAvailability = 'Available' | 'Borrowed' | 'Reserved' | 'Unavailable'

export type BookCatalogItem = {
  titleId: number
  title: string
  author: string
  isbn: string | null
  publisher: string | null
  publicationYear: number | null
  categoryId: number | null
  categoryName: string
  callNumber: string | null
  coverImagePath?: string | null
  shelfLocation: string | null
  currentAvailabilityStatus: BookAvailability
  currentConditionStatus?: string | null
  totalCopiesCount: number
  availableCopiesCount: number
  reservableMaterialId: number | null
  previewBarcode: string | null
}

export type CatalogCopyAsset = {
  physicalCopyId: number
  titleId: number
  title: string
  author: string
  accessionNumber: string
  barcode: string
  shelfLocation: string
  conditionStatus?: string | null
  barcodeImageData: string
}

export type BookCatalogViewer = {
  role: AuthRole
  activeBookCount: number
  bookLimit: number | null
}

export type Pagination = {
  page: number
  limit: number
  total: number
  totalPages: number
}

export type BookCategory = {
  categoryId: number
  categoryName: string
}
