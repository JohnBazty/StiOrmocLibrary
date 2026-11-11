import { describe, expect, it } from 'vitest'
import { catalogActionLabel, validateBookCartAddition } from './book-cart'

describe('book cart safeguards', () => {
  it('limits the cart selection without counting already active loans or requests', () => {
    expect(validateBookCartAddition({role:'Student',activeBookCount:2,selectedBookCount:0,alreadySelected:false})).toEqual({allowed:true,message:null})
    expect(validateBookCartAddition({
      role: 'Student', activeBookCount: 0, selectedBookCount: 2, alreadySelected: false,
    })).toEqual({ allowed: false, message: 'Your cart can hold 2 books. Remove one before adding another.' })
  })

  it('derives Borrow or Reserve only from the live available-copy count', () => {
    expect(catalogActionLabel(1)).toBe('Borrow')
    expect(catalogActionLabel(0)).toBe('Reserve')
  })
})
