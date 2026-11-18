import { describe, expect, it } from 'vitest'
import { catalogActionLabel, titleAlreadyActiveMessage, validateBookCartAddition } from './book-cart'

describe('book cart safeguards', () => {
  it('limits the cart selection without counting already active loans or requests', () => {
    expect(validateBookCartAddition({role:'Student',activeBookCount:2,selectedBookCount:0,alreadySelected:false})).toEqual({allowed:true,message:null})
    expect(validateBookCartAddition({
      role: 'Student', activeBookCount: 0, selectedBookCount: 2, alreadySelected: false,
    })).toEqual({ allowed: false, message: 'Your cart can hold 2 books. Remove one before adding another.' })
  })

  it('explains that another copy of a book already on the account cannot be borrowed', () => {
    expect(titleAlreadyActiveMessage('10 Minute Guide to MS - DOS 5')).toBe(
      'You already have 10 Minute Guide to MS - DOS 5. Another copy of the same book cannot be borrowed while it is on an active loan or request.',
    )
  })

  it('derives Borrow or Reserve only from the live available-copy count', () => {
    expect(catalogActionLabel(1)).toBe('Borrow')
    expect(catalogActionLabel(0)).toBe('Reserve')
  })
})
