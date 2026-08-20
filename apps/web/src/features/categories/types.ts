export type Category = {
  categoryId: number
  categoryName: string
  shelfLocation: string
  totalBooksCount: number
  totalThesisCount: number
  createdAt: string
  updatedAt: string | null
}

export type CategoryPayload = { categoryName: string; shelfLocation: string }

