export type CategoryInput = { categoryName: string; shelfLocation: string; shelfColumn: number; shelfRow: number }
export type CategoryValidationResult = { isValid: boolean; data: CategoryInput; errors: Record<string, string> }

const CATEGORY_NAME_MAX = 100
const SHELF_LOCATION_MAX = 100

function normalizedString(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export function validateCategoryPayload(body: unknown): CategoryValidationResult {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const errors: Record<string, string> = {}
  const categoryName = normalizedString(input.categoryName ?? input.category_name)
  const shelfLocation = normalizedString(input.shelfLocation ?? input.shelf_location)
  const shelfColumn = Number(input.shelfColumn ?? input.shelf_column ?? 1)
  const shelfRow = Number(input.shelfRow ?? input.shelf_row ?? 1)

  if (typeof (input.categoryName ?? input.category_name) !== 'string') errors.categoryName = 'Category name must be a string.'
  else if (!categoryName) errors.categoryName = 'Category name is required.'
  else if (categoryName.length > CATEGORY_NAME_MAX) errors.categoryName = `Category name must not exceed ${CATEGORY_NAME_MAX} characters.`

  if (typeof (input.shelfLocation ?? input.shelf_location) !== 'string') errors.shelfLocation = 'Shelf location must be a string.'
  else if (!shelfLocation) errors.shelfLocation = 'Shelf location is required.'
  else if (shelfLocation.length > SHELF_LOCATION_MAX) errors.shelfLocation = `Shelf location must not exceed ${SHELF_LOCATION_MAX} characters.`

  if (!Number.isSafeInteger(shelfColumn) || shelfColumn < 1 || shelfColumn > 12) errors.shelfColumn = 'Shelf column must be between 1 and 12.'
  if (!Number.isSafeInteger(shelfRow) || shelfRow < 1 || shelfRow > 12) errors.shelfRow = 'Shelf row must be between 1 and 12.'

  return { isValid: Object.keys(errors).length === 0, data: { categoryName, shelfLocation, shelfColumn, shelfRow }, errors }
}

export function parseCategoryId(value: unknown, field = 'categoryId') {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return { value: null, error: `${field} must be a positive integer.` }
  return { value: parsed, error: null }
}
