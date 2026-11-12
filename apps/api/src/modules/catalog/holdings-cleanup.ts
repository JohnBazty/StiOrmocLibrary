import { normalizeIsbn } from './catalog.validation.ts'

export type ImportCorrection = { field: string; before: string; after: string; reason: 'spaces' | 'isbn' | 'number' | 'category' | 'shelf' }
export type ImportReference = { id: number; name: string; status: string }
export type ImportReferences = { categories: ImportReference[]; locations: ImportReference[] }
const numberFields = new Set(['copies', 'missingCopies', 'pages', 'publicationYear', 'copyrightYear'])

/** Formatting only: do not infer facts, recalculate ISBN check digits or coerce identifiers to numbers. */
export function cleanImportValue(field: string, raw: unknown): { value: string; correction?: ImportCorrection } {
  const before = String(raw ?? '')
  let value = field === 'accessions' || field === 'barcodes' ? before.trim() : before.trim().replace(/\s+/g, ' ')
  let reason: ImportCorrection['reason'] = 'spaces'
  if (field === 'isbn') { value = normalizeIsbn(value); reason = 'isbn' }
  if (numberFields.has(field) && /^\d+(?:\.0+)?$/.test(value) && Number.isSafeInteger(Number(value))) {
    value = String(Number(value)); reason = 'number'
  }
  return { value, ...(value !== before ? { correction: { field, before, after: value, reason } } : {}) }
}

export const referenceKey = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')
export function matchImportReference(value: string, choices: ImportReference[]) {
  if (!value.trim()) return null
  const matches = choices.filter(choice => choice.status === 'Active' && referenceKey(choice.name) === referenceKey(value))
  return matches.length === 1 ? matches[0] : null
}

export function retainImportCorrections(value: unknown): ImportCorrection[] {
  // Read only server-stored metadata, never the client's claimed cleanup history.
  return Array.isArray(value) ? value as ImportCorrection[] : []
}
