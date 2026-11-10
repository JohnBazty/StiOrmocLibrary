import type { AuthRole } from '../auth/auth-storage'

export function validateBookCartAddition(input: {
  role: AuthRole
  activeBookCount: number
  selectedBookCount: number
  alreadySelected: boolean
  bookLimit?: number | null
}) {
  if (input.alreadySelected) return { allowed: true, message: 'This book is already in your borrow cart.' }
  const limit = input.bookLimit === undefined
    ? (input.role === 'Student' ? 2 : null)
    : input.bookLimit
  // A cart is a local selection, not another active loan or queue commitment.
  // The API checks existing commitments when the reviewed selection is submitted.
  if (limit !== null && input.selectedBookCount >= limit) {
    return {
      allowed: false,
      message: `Your cart can hold ${limit} books. Remove one before adding another.`,
    }
  }
  return { allowed: true, message: null }
}

export function catalogActionLabel(availableCopiesCount: number) {
  return availableCopiesCount > 0 ? 'Borrow' : 'Reserve'
}
