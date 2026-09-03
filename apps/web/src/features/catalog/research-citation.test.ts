import { describe, expect, it } from 'vitest'
import { buildApaResearchReference } from './research-citation'

describe('buildApaResearchReference', () => {
  it('assembles names, parenthesized year, and italic title marks in APA order', () => {
    expect(buildApaResearchReference({
      authors: 'Dela Cruz, J. P., & Santos, M. R.',
      publicationYear: 2026,
      title: 'SmartLib: A web and mobile-based smart library system',
      department: 'BS Information Technology',
    })).toBe('Dela Cruz, J. P., & Santos, M. R. (2026). *SmartLib: A web and mobile-based smart library system* [Unpublished undergraduate thesis, BS Information Technology]. STI College Ormoc.')
  })
})
