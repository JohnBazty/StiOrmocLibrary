import { normalizeIsbn } from './catalog.validation.ts'

export type ImportCorrection = { field: string; before: string; after: string; reason: 'spaces' | 'isbn' | 'number' | 'category' | 'shelf' | 'placeholder' | 'invalid_optional' }
/** Whole-cell words spreadsheets use for "unknown"; they are blanks, so the book lookup may fill them. */
const PLACEHOLDER = /^(not verified|not located online|n\/a|none|-|—|–)$/i
export type ImportReference = { id: number; name: string; status: string }
export type ImportReferences = { categories: ImportReference[]; locations: ImportReference[] }
const numberFields = new Set(['copies', 'missingCopies', 'pages', 'publicationYear', 'copyrightYear'])
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30)
const DAY_MS = 86_400_000
const MIN_EXCEL_SERIAL_DATE = 20000 // ~1954-10-03; avoids confusing 4-digit years with serial dates
const MAX_EXCEL_SERIAL_DATE = 80000 // ~2119-01-08

function validCalendarDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

/** Converts YYYY-MM-DD, YYYY/MM/DD, ISO timestamps, or Excel serial dates (e.g. 46037) to YYYY-MM-DD. */
export function parseImportDate(raw: unknown): string | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const ymd = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/)
  if (ymd) return validCalendarDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]))
  if (/^\d{5}(?:\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text))
    if (serial >= MIN_EXCEL_SERIAL_DATE && serial <= MAX_EXCEL_SERIAL_DATE) {
      return new Date(EXCEL_EPOCH_UTC_MS + serial * DAY_MS).toISOString().slice(0, 10)
    }
  }
  return null
}

/** Formatting only: do not infer facts, recalculate ISBN check digits or coerce identifiers to numbers. */
export function cleanImportValue(field: string, raw: unknown): { value: string; correction?: ImportCorrection } {
  const before = String(raw ?? '')
  if (PLACEHOLDER.test(before.trim())) return { value: '', correction: { field, before, after: '', reason: 'placeholder' } }
  let value = field === 'accessions' || field === 'barcodes' ? before.trim() : before.trim().replace(/\s+/g, ' ')
  let reason: ImportCorrection['reason'] = 'spaces'
  if (field === 'isbn') { value = normalizeIsbn(value); reason = 'isbn' }
  if (field === 'receivedOn') {
    const parsedDate = parseImportDate(value)
    if (parsedDate) { value = parsedDate; reason = 'number' }
  }
  if ((field === 'publicationYear' || field === 'copyrightYear') && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    value = value.slice(0, 4); reason = 'number'
  }
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
