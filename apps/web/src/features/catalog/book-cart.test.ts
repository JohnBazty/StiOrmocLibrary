import { describe, expect, it } from 'vitest'
import { catalogActionLabel, validateBookCartAddition } from './book-cart'

describe('book cart safeguards', () => {
  it('blocks a Student from selecting a third active book', () => {
    expect(validateBookCartAddition({
      role: 'Student', activeBookCount: 1, selectedBookCount: 1, alreadySelected: false,
    })).toEqual({ allowed: false, message: 'Transaction Blocked: Students cannot exceed 2 books.' })
  })

  it('derives Borrow or Reserve only from the live available-copy count', () => {
    expect(catalogActionLabel(1)).toBe('Borrow')
    expect(catalogActionLabel(0)).toBe('Reserve')
  })
})
