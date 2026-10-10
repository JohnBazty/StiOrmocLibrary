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
  if (limit !== null && input.activeBookCount + input.selectedBookCount >= limit) {
    return {
      allowed: false,
      message: `Transaction Blocked: ${input.role} cannot exceed ${limit} books.`,
    }
  }
  return { allowed: true, message: null }
}

export function catalogActionLabel(availableCopiesCount: number) {
  return availableCopiesCount > 0 ? 'Borrow' : 'Reserve'
}
