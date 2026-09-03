import { describe, expect, it } from 'vitest'
import { buildApaBookReference } from './book-citation'

describe('buildApaBookReference', () => {
  it('maps author, year, title, and publisher in APA 7 book-reference order', () => {
    expect(buildApaBookReference({
      author: 'Martin, R. C.',
      publicationYear: 2008,
      title: 'Clean code',
      publisher: 'Prentice Hall',
    })).toBe('Martin, R. C. (2008). Clean code. Prentice Hall.')
  })
})
