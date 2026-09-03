import { describe, expect, it } from 'vitest'
import { assertCatalogItemCanEnterLoanCart, ResearchViewOnlyError } from './catalog-cart-policy'

describe('catalog cart domain isolation', () => {
  it('throws when a research identifier is passed to user loan-cart validation', () => {
    expect(() => assertCatalogItemCanEnterLoanCart({ catalogType: 'Research/Thesis', id: 91 }))
      .toThrow(ResearchViewOnlyError)
    try {
      assertCatalogItemCanEnterLoanCart({ catalogType: 'Research/Thesis', id: 91 })
    } catch (error) {
      expect((error as ResearchViewOnlyError).code).toBe('RESEARCH_VIEW_ONLY')
    }
  })
})
