import type { Batch, ImportRow, Mapping, Option, Sheet } from './enhanced-catalog-api'

export const importFields = ['title', 'author', 'isbn', 'edition', 'publisher', 'publicationYear', 'copyrightYear', 'pages', 'copies', 'missingCopies', 'accessions', 'barcodes', 'callNumber', 'categoryName', 'shelfLocation'] as const
export const importFieldNames: Record<string, string> = { title: 'Book title', author: 'Author', isbn: 'ISBN', edition: 'Edition', publisher: 'Publisher', publicationYear: 'Publication year', copyrightYear: 'Copyright year', pages: 'Pages', copies: 'Number of copies', missingCopies: 'Missing copies', accessions: 'Accession numbers', barcodes: 'Book barcodes', callNumber: 'Call number', categoryName: 'Category in this file', shelfLocation: 'Shelf in this file' }
export const blankImportCsv = '\uFEFFTitle,Author,Copies\r\n'
export const requiredImportFields = ['title', 'author', 'copies'] as const
export function applyImportDefaults(mapping: Mapping[], category: string, shelf: string) {
  return mapping.map(item => ({ ...item, categoryId: item.categoryId || Number(category) || undefined,
    location: item.location || shelf,
    columns: Object.fromEntries(Object.entries(item.columns).filter(([, value]) => value > 0)),
  }))
}
export function importFileReady(mapping: Mapping[]) {
  return mapping.length > 0 && mapping.every(item => requiredImportFields.every(field => item.columns[field] > 0) && (item.categoryId || item.columns.categoryName > 0) && (item.location || item.columns.shelfLocation > 0))
}

/** Suggestions are display-only; the librarian must choose one and save the normal review. */
export function suggestImportReferences(value: string, options: Option[]) {
  const normalize = (text: string) => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
  const wanted = normalize(value)
  if (!wanted || wanted.length > 100) return []
  const distance = (text: string) => {
    let previous = Array.from({ length: wanted.length + 1 }, (_, index) => index)
    let beforePrevious = previous
    for (let i = 0; i < text.length; i++) {
      const next = [i + 1]
      for (let j = 0; j < wanted.length; j++) {
        next[j + 1] = Math.min(next[j] + 1, previous[j + 1] + 1, previous[j] + (text[i] === wanted[j] ? 0 : 1))
        if (i > 0 && j > 0 && text[i] === wanted[j - 1] && text[i - 1] === wanted[j]) next[j + 1] = Math.min(next[j + 1], beforePrevious[j - 1] + 1)
      }
      beforePrevious = previous
      previous = next
    }
    return previous[wanted.length]
  }
  return options.filter(item => item.status === 'Active' || !item.status).map(item => ({ item, score: distance(normalize(item.name)) }))
    .filter(result => result.score <= Math.min(3, Math.max(1, Math.floor(wanted.length / 4)))).sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name)).slice(0, 3).map(result => result.item)
}
export function unrecognizedImportHeadings(sheet: Sheet, mapping = sheet.mapping) {
  const used = new Set(Object.values(mapping.columns))
  return sheet.headers.flatMap((heading, index) => !used.has(index + 1) && (heading.trim() || sheet.preview.some(row => row[index]?.trim())) ? [heading.trim() || `Column ${index + 1} (no heading)`] : [])
}

export function canReviewTogether(row: ImportRow) {
  return row.status === 'Review' && !row.decision && !row.error && row.errors.length === 0 && row.matches.length === 0 && row.overlaps.length === 0
}
export function importRowLabel(row: ImportRow) {
  if (row.status === 'Imported') return 'Added'
  if (row.status === 'Skipped') return 'Left out'
  if (row.error || row.errors.length) return 'Needs correction'
  if (row.status === 'Ready') return 'Choice saved'
  if (row.matches.length || row.overlaps.length) return 'Needs your choice'
  return 'Ready to add'
}
export function importSummary(batch: Batch) {
  const together = batch.rows.filter(canReviewTogether)
  const reviewed = batch.rows.filter(row => row.status === 'Ready' && !row.error && !row.errors.length)
  const ready = [...together, ...reviewed]
  const copying = ready.filter(row => canReviewTogether(row) || ['new', 'add'].includes(row.decision ?? ''))
  const copies = copying.reduce((sum, row) => sum + Number(row.data.copies), 0)
  const missing = copying.reduce((sum, row) => sum + Number(row.data.missingCopies || 0), 0)
  return {
    together, ready, copies, missing,
    attention: batch.rows.filter(row => !['Imported', 'Skipped'].includes(row.status) && !ready.includes(row)),
    added: batch.rows.filter(row => row.status === 'Imported'),
    skipped: batch.rows.filter(row => row.status === 'Skipped'),
    failedReady: batch.rows.some(row => row.status === 'Ready' && (Boolean(row.error) || row.errors.length > 0)),
  }
}
