import type { BookCatalogItem } from './book-catalog-types'

function terminalPeriod(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`
}

/** Plain-text APA 7 book reference: Author. (Year). Title. Publisher. */
export function buildApaBookReference(book: Pick<BookCatalogItem, 'author' | 'publicationYear' | 'title' | 'publisher'>) {
  const author = terminalPeriod(book.author.trim() || 'Unknown author')
  const year = book.publicationYear ?? 'n.d.'
  const title = terminalPeriod(book.title.trim())
  const publisher = book.publisher?.trim() ? ` ${terminalPeriod(book.publisher.trim())}` : ''
  return `${author} (${year}). ${title}${publisher}`
}
