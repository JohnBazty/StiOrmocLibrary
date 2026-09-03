import type { ResearchCatalogItem } from './research-catalog-types'

function period(value: string) { return /[.!?]$/.test(value) ? value : `${value}.` }

/** Markdown asterisks preserve the APA italic-title instruction in plain text. */
export function buildApaResearchReference(paper: Pick<ResearchCatalogItem, 'authors' | 'publicationYear' | 'title' | 'department'>) {
  const authors = period(paper.authors.trim() || 'Unknown author')
  const year = paper.publicationYear ?? 'n.d.'
  return `${authors} (${year}). *${paper.title.trim()}* [Unpublished undergraduate thesis, ${paper.department.trim()}]. STI College Ormoc.`
}
