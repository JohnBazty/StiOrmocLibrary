export class ResearchViewOnlyError extends Error {
  readonly code = 'RESEARCH_VIEW_ONLY'
  constructor() { super('Research and thesis records are view only and cannot be added to a borrowing cart.') }
}

export function assertCatalogItemCanEnterLoanCart(item: { catalogType: 'Book' | 'Research/Thesis'; id: number }) {
  if (item.catalogType === 'Research/Thesis') throw new ResearchViewOnlyError()
  return item
}
