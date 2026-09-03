import type { AuthRole } from '../auth/auth-storage'

export const STUDENT_BOOK_LIMIT = 2

export function validateBookCartAddition(input: {
  role: AuthRole
  activeBookCount: number
  selectedBookCount: number
  alreadySelected: boolean
}) {
  if (input.alreadySelected) return { allowed: true, message: 'This book is already in your borrow cart.' }
  if (input.role === 'Student' && input.activeBookCount + input.selectedBookCount >= STUDENT_BOOK_LIMIT) {
    return {
      allowed: false,
      message: 'Transaction Blocked: Students cannot exceed 2 books.',
    }
  }
  return { allowed: true, message: null }
}

export function catalogActionLabel(availableCopiesCount: number) {
  return availableCopiesCount > 0 ? 'Borrow' : 'Reserve'
}
