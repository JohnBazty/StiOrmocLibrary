import { describe, expect, it } from 'vitest'
import { matchCategory } from './category-match'

const categories = [
  { categoryId: 1, categoryName: 'Fiction', shelfLocation: 'A' },
  { categoryId: 2, categoryName: 'Computer Science', shelfLocation: 'B' },
  { categoryId: 3, categoryName: 'History', shelfLocation: 'C' },
]

describe('matchCategory', () => {
  it('prefers an exact name, ignoring case and punctuation', () => {
    expect(matchCategory(['Software', 'computer-science'], categories)).toEqual({ category: categories[1], subject: 'computer-science' })
  })

  it('matches a part of a Google or Open Library subject path', () => {
    expect(matchCategory(['Juvenile Fiction / Animals / Pigs'], categories)?.category.categoryName).toBe('Fiction')
    expect(matchCategory(['Philippines -- History -- 1898-1946'], categories)?.category.categoryName).toBe('History')
  })

  it('matches whole words only, never inside another word', () => {
    expect(matchCategory(['Nonfiction'], categories)).toBeNull()
    expect(matchCategory(['Prehistory'], categories)).toBeNull()
    expect(matchCategory(['Computer science education'], categories)?.category.categoryId).toBe(2)
  })

  it('returns null with no subjects or no categories', () => {
    expect(matchCategory([], categories)).toBeNull()
    expect(matchCategory(['Fiction'], [])).toBeNull()
  })
})
