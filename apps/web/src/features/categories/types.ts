export type Category = {
  categoryId: number
  categoryName: string
  shelfLocation: string
  shelfColumn: number
  shelfRow: number
  totalBooksCount: number
  totalThesisCount: number
  createdAt: string
  updatedAt: string | null
}

export type CategoryPayload = { categoryName: string; shelfLocation: string; shelfColumn: number; shelfRow: number }

export type CategoryShelfSync = {
  bookCopies: number
  movedBookCopies: number
  researchCopies: number
  movedResearchCopies: number
}

export type CategorySaveResult = Category & Partial<CategoryShelfSync>
