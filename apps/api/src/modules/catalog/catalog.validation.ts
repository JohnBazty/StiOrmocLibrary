const TITLE_MAX_LENGTH = 255
const PERSON_NAME_MAX_LENGTH = 255
const ABSTRACT_MAX_LENGTH = 50_000
const CURRENT_YEAR = new Date().getFullYear()

const COPY_CONDITIONS = new Set(['Good', 'Fair', 'For Repair', 'Damaged', 'Lost'])

type ValidationErrors = Record<string, string>

export type PhysicalCopyInput = {
  barcode: string
  accessionNumber: string
  shelfLocation: string
  conditionStatus: string
  legacyMaterialId: number | null
}

export type BookEntryInput = {
  title: string
  authors: string[]
  isbn: string | null
  categoryId: number | null
  publicationYear: number | null
  publisher: string | null
  callNumber: string | null
  copy: PhysicalCopyInput
}

export type BookMetadataInput = Omit<BookEntryInput, 'copy'>

export type ThesisMetadataInput = {
  title: string
  authors: string[]
  adviser: string | null
  year: number
  abstract: string | null
  categoryId: number | null
  researchCode: string
  departmentOrProgram: string
  keywords: string | null
  copy: PhysicalCopyInput | null
}

export type ResearchImportRowInput = {
  copyNumbers: number[]
  authors: string[]
  year: number
  title: string
  program: string
  adviser: string | null
  abstract: string | null
  keywords: string | null
  researchCode: string
  shelf: string
}

export type ThesisEntryInput = Omit<ThesisMetadataInput, 'copy'> & { copy: PhysicalCopyInput }

export type ValidationResult<T> = {
  isValid: boolean
  data: T
  errors: ValidationErrors
}

function compactText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function multilineText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\r\n/g, '\n') : ''
}

function optionalText(value: unknown, maxLength: number): string | null {
  const normalized = compactText(value)
  return normalized ? normalized.slice(0, maxLength) : null
}

function positiveInteger(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function normalizeAuthors(body: Record<string, unknown> | undefined): string[] {
  const supplied = Array.isArray(body?.authors) ? body.authors : [body?.author]
  const unique = new Map<string, string>()

  for (const value of supplied) {
    const author = compactText(value)
    if (!author) continue
    const key = author.toLocaleLowerCase('en-US')
    if (!unique.has(key)) unique.set(key, author)
  }

  return [...unique.values()]
}

export function normalizeIsbn(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .normalize('NFKC')
    .trim()
    .replace(/^ISBN(?:-1[03])?\s*:?\s*/i, '')
    .replace(/[\s\u00A0\-\u2010-\u2015\u2212]+/g, '')
    .toUpperCase()
}

export function isValidIsbn(isbn: string): boolean {
  if (/^97[89]\d{10}$/.test(isbn)) {
    const sum = [...isbn.slice(0, 12)].reduce(
      (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
      0,
    )
    return (10 - (sum % 10)) % 10 === Number(isbn[12])
  }

  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => {
      const value = digit === 'X' ? 10 : Number(digit)
      return total + value * (10 - index)
    }, 0)
    return sum % 11 === 0
  }

  return false
}

export function isbnValidationMessage(value: unknown): string | null {
  const isbn = normalizeIsbn(value)
  if (!isbn) return 'ISBN is required.'
  if (isbn.length !== 10 && isbn.length !== 13) return 'ISBN must contain exactly 10 or 13 characters after spaces and hyphens are removed.'
  if (isbn.length === 13) {
    if (!/^\d{13}$/.test(isbn)) return 'ISBN-13 must contain digits only.'
    if (!isbn.startsWith('978') && !isbn.startsWith('979')) return 'ISBN-13 must begin with 978 or 979.'
    const sum = [...isbn.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
    const expected = String((10 - (sum % 10)) % 10)
    if (isbn[12] !== expected) return `ISBN-13 check digit is incorrect. For these first 12 digits, the final digit must be ${expected}.`
    return null
  }
  if (!/^\d{9}[\dX]$/.test(isbn)) return 'ISBN-10 must contain 9 digits followed by a digit or X.'
  const weighted = [...isbn.slice(0, 9)].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0)
  const remainder = (11 - (weighted % 11)) % 11
  const expected = remainder === 10 ? 'X' : String(remainder)
  if (isbn[9] !== expected) return `ISBN-10 check digit is incorrect. For these first 9 digits, the final character must be ${expected}.`
  return null
}

function validateYear(value: unknown, field: string, errors: ValidationErrors, required: boolean): number | null {
  const year = positiveInteger(value)
  if (year === null) {
    if (required) errors[field] = 'Year published is required and must be a whole number.'
    else if (value !== '' && value !== null && value !== undefined) errors[field] = 'Year published must be a whole number.'
    return null
  }
  if (year < 1000 || year > CURRENT_YEAR) {
    errors[field] = `Year published must be between 1000 and ${CURRENT_YEAR}.`
  }
  return year
}

function validateCopyInput(value: unknown, required: boolean): { data: PhysicalCopyInput | null; errors: ValidationErrors } {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const errors: ValidationErrors = {}
  const barcode = compactText(body.barcode).toUpperCase()
  const accessionNumber = compactText(body.accessionNumber).toUpperCase()
  const shelfLocation = compactText(body.shelfLocation)
  const conditionStatus = compactText(body.conditionStatus ?? body.condition) || 'Good'
  const legacyMaterialId = positiveInteger(body.legacyMaterialId ?? body.materialId)

  if (!required && !barcode && !accessionNumber && !shelfLocation) return { data: null, errors }

  if (!barcode) errors.barcode = 'Barcode is required.'
  else if (barcode.length > 100) errors.barcode = 'Barcode must not exceed 100 characters.'

  if (!accessionNumber) errors.accessionNumber = 'Accession number is required.'
  else if (accessionNumber.length > 100) errors.accessionNumber = 'Accession number must not exceed 100 characters.'

  if (!shelfLocation) errors.shelfLocation = 'Shelf location is required.'
  else if (shelfLocation.length > 100) errors.shelfLocation = 'Shelf location must not exceed 100 characters.'

  if (!COPY_CONDITIONS.has(conditionStatus)) {
    errors.conditionStatus = 'Condition must be Good, Fair, For Repair, Damaged, or Lost.'
  }

  const data = { barcode, accessionNumber, shelfLocation, conditionStatus, legacyMaterialId }
  return { data, errors }
}

export function validateBookEntry(body: unknown): ValidationResult<BookEntryInput> {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const errors: ValidationErrors = {}
  const title = compactText(input.title)
  const authors = normalizeAuthors(input)
  const rawIsbn = normalizeIsbn(input.isbn)
  const isbn = rawIsbn || null
  const categoryId = positiveInteger(input.categoryId)
  const publicationYear = validateYear(input.publicationYear ?? input.year, 'publicationYear', errors, false)
  const publisher = optionalText(input.publisher, 255)
  const callNumber = optionalText(input.callNumber, 100)
  const copyResult = validateCopyInput(input.copy ?? input, true)

  if (!title) errors.title = 'Title is required.'
  else if (title.length > TITLE_MAX_LENGTH) errors.title = `Title must not exceed ${TITLE_MAX_LENGTH} characters.`

  if (authors.length === 0) errors.author = 'At least one author is required.'
  else if (authors.some((author) => author.length > PERSON_NAME_MAX_LENGTH)) {
    errors.author = `Each author must not exceed ${PERSON_NAME_MAX_LENGTH} characters.`
  }

  if (isbn && !isValidIsbn(isbn)) errors.isbn = 'Enter a valid ISBN-10 or ISBN-13.'
  if (input.categoryId !== undefined && categoryId === null) errors.categoryId = 'Category ID must be a positive integer.'

  Object.assign(errors, copyResult.errors)

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    data: {
      title,
      authors,
      isbn,
      categoryId,
      publicationYear,
      publisher,
      callNumber,
      copy: copyResult.data as PhysicalCopyInput,
    },
  }
}

/** Validates title-level book fields for a full PUT update. */
export function validateBookMetadata(body: unknown): ValidationResult<BookMetadataInput> {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const result = validateBookEntry({
    ...input,
    copy: { barcode: 'VALIDATION-ONLY', accessionNumber: 'VALIDATION-ONLY', shelfLocation: 'VALIDATION-ONLY' },
  })
  const { copy: _copy, ...data } = result.data
  const errors = { ...result.errors }
  delete errors.barcode
  delete errors.accessionNumber
  delete errors.shelfLocation
  delete errors.conditionStatus
  return { isValid: Object.keys(errors).length === 0, errors, data }
}

/**
 * Validates the thesis metadata contract: Title, Author and Year are required;
 * Adviser and Abstract are optional (bulk lists lack them) but checked when given.
 * Database-required indexing fields are validated too.
 */
export function validateThesisMetadata(body: unknown): ValidationResult<ThesisMetadataInput> {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const errors: ValidationErrors = {}
  const title = compactText(input.title)
  const authors = normalizeAuthors(input)
  const adviser = compactText(input.adviser)
  const year = validateYear(input.year ?? input.publicationYear, 'year', errors, true)
  const abstract = multilineText(input.abstract ?? input.abstractText)
  const categoryId = null
  const researchCode = compactText(input.researchCode).toUpperCase()
  const departmentOrProgram = compactText(input.departmentOrProgram ?? input.department)
  const keywords = optionalText(input.keywords ?? input.keywordsText, 5_000)

  if (!title) errors.title = 'Title is required.'
  else if (title.length > TITLE_MAX_LENGTH) errors.title = `Title must not exceed ${TITLE_MAX_LENGTH} characters.`

  if (authors.length === 0) errors.author = 'At least one author is required.'
  else if (authors.some((author) => author.length > PERSON_NAME_MAX_LENGTH)) {
    errors.author = `Each author must not exceed ${PERSON_NAME_MAX_LENGTH} characters.`
  }

  if (adviser.length > PERSON_NAME_MAX_LENGTH) errors.adviser = `Adviser must not exceed ${PERSON_NAME_MAX_LENGTH} characters.`

  if (abstract && abstract.length < 20) errors.abstract = 'Abstract must contain at least 20 characters.'
  else if (abstract.length > ABSTRACT_MAX_LENGTH) errors.abstract = `Abstract must not exceed ${ABSTRACT_MAX_LENGTH} characters.`

  if (!researchCode) errors.researchCode = 'Research code is required for indexing.'
  else if (researchCode.length > 100) errors.researchCode = 'Research code must not exceed 100 characters.'

  if (!departmentOrProgram) errors.departmentOrProgram = 'Department or program is required.'
  else if (departmentOrProgram.length > 150) errors.departmentOrProgram = 'Department or program must not exceed 150 characters.'


  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    data: {
      title,
      authors,
      adviser: adviser || null,
      year: year ?? 0,
      abstract: abstract || null,
      categoryId,
      researchCode,
      departmentOrProgram,
      keywords,
      copy: null,
    },
  }
}

/**
 * Publishing a thesis creates both its catalog metadata and its independently
 * accessioned research-inventory row. Metadata updates can remain copy-neutral,
 * but a new publication must provide the physical ledger fields.
 */
export function validateThesisEntry(body: unknown): ValidationResult<ThesisEntryInput> {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const result = validateThesisMetadata(input)
  const copyBody = input.copy && typeof input.copy === 'object' ? input.copy as Record<string, unknown> : input
  const shelfLocation = compactText(copyBody.shelfLocation ?? copyBody.shelf_location)
  const errors = { ...result.errors }
  if (!shelfLocation) errors.shelfLocation = 'Shelf location is required.'
  else if (shelfLocation.length > 100) errors.shelfLocation = 'Shelf location must not exceed 100 characters.'

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    data: { ...result.data, categoryId: null, copy: { barcode: '', accessionNumber: '', shelfLocation, conditionStatus: 'Good', legacyMaterialId: null } },
  }
}

/** At most this many copies per research title in one import row. */
export const IMPORT_COPIES_PER_ROW = 50

/**
 * Reads copy numbers: `25`, `1, 2`, `1-2` or `81-83` (two numbers joined by a dash are a range) and
 * `81 - 82 - 83` (three or more joined numbers are a list). Throws a short message when it cannot read them.
 */
export function parseCopyNumbers(text: string): number[] {
  const normalized = String(text ?? '').replace(/[‐-―−]/g, '-').trim()
  if (!normalized) throw new Error('Copy numbers are required.')
  const numbers: number[] = []
  for (const part of normalized.split(/[,;]/)) {
    const chain = part.trim()
    if (!/^\d+(\s*-\s*\d+)*$/.test(chain)) throw new Error(`Copy numbers "${chain}" cannot be read. Use forms like 25, 1-2 or 1, 2.`)
    const values = chain.split('-').map((value) => Number(value.trim()))
    if (values.some((value) => !Number.isSafeInteger(value) || value < 1)) throw new Error('Copy numbers must be whole numbers from 1.')
    if (values.length === 2) {
      if (values[1] < values[0]) throw new Error(`Copy numbers "${chain}" run backwards.`)
      if (values[1] - values[0] + 1 > IMPORT_COPIES_PER_ROW) throw new Error(`Use at most ${IMPORT_COPIES_PER_ROW} copies per title.`)
      for (let copy = values[0]; copy <= values[1]; copy += 1) numbers.push(copy)
    } else numbers.push(...values)
    if (numbers.length > IMPORT_COPIES_PER_ROW) throw new Error(`Use at most ${IMPORT_COPIES_PER_ROW} copies per title.`)
  }
  if (new Set(numbers).size !== numbers.length) throw new Error('A copy number is listed twice.')
  return numbers
}

/** One row of the research import file: title, authors, year, program and copy numbers are required. */
export function validateResearchImportRow(body: unknown): ValidationResult<ResearchImportRowInput> {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const errors: ValidationErrors = {}
  const title = compactText(input.title)
  const authors = normalizeAuthors({ authors: compactText(input.authors).split(';') })
  const program = compactText(input.program)
  const adviser = compactText(input.adviser)
  const abstract = multilineText(input.abstract)
  const researchCode = compactText(input.researchCode).toUpperCase()
  const keywords = optionalText(input.keywords, 5_000)
  const shelf = compactText(input.shelf)
  const year = validateYear(input.year, 'year', errors, true)
  let copyNumbers: number[] = []
  try { copyNumbers = parseCopyNumbers(String(input.copyNumbers ?? '')) } catch (error) { errors.copyNumbers = (error as Error).message }

  if (!title) errors.title = 'Title is required.'
  else if (title.length > TITLE_MAX_LENGTH) errors.title = `Title must not exceed ${TITLE_MAX_LENGTH} characters.`
  if (authors.length === 0) errors.authors = 'At least one author is required.'
  else if (authors.some((author) => author.length > PERSON_NAME_MAX_LENGTH)) errors.authors = `Each author must not exceed ${PERSON_NAME_MAX_LENGTH} characters.`
  if (!program) errors.program = 'Program is required.'
  if (adviser.length > PERSON_NAME_MAX_LENGTH) errors.adviser = `Adviser must not exceed ${PERSON_NAME_MAX_LENGTH} characters.`
  if (abstract && abstract.length < 20) errors.abstract = 'Abstract must contain at least 20 characters.'
  else if (abstract.length > ABSTRACT_MAX_LENGTH) errors.abstract = `Abstract must not exceed ${ABSTRACT_MAX_LENGTH} characters.`
  if (researchCode.length > 100) errors.researchCode = 'Research code must not exceed 100 characters.'
  if (shelf.length > 100) errors.shelf = 'Shelf location must not exceed 100 characters.'

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    data: { copyNumbers, authors, year: year ?? 0, title, program, adviser: adviser || null, abstract: abstract || null, keywords, researchCode, shelf },
  }
}
