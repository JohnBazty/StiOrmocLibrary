const TITLE_MAX_LENGTH = 255
const PERSON_NAME_MAX_LENGTH = 255
const ABSTRACT_MAX_LENGTH = 50_000
const CURRENT_YEAR = new Date().getFullYear()

const COPY_CONDITIONS = new Set(['New', 'Good', 'Fair', 'Damaged', 'For Repair', 'Lost'])

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
  adviser: string
  year: number
  abstract: string
  categoryId: number | null
  researchCode: string
  departmentOrProgram: string
  keywords: string | null
  copy: PhysicalCopyInput | null
}

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
  return typeof value === 'string' ? value.replace(/[\s-]+/g, '').toUpperCase() : ''
}

export function isValidIsbn(isbn: string): boolean {
  if (/^\d{13}$/.test(isbn)) {
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
    errors.conditionStatus = 'Condition must be New, Good, Fair, Damaged, For Repair, or Lost.'
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
 * Validates the required thesis metadata contract: Title, Author, Adviser,
 * Year, and Abstract. Database-required indexing fields are validated too.
 */
export function validateThesisMetadata(body: unknown): ValidationResult<ThesisMetadataInput> {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const errors: ValidationErrors = {}
  const title = compactText(input.title)
  const authors = normalizeAuthors(input)
  const adviser = compactText(input.adviser)
  const year = validateYear(input.year ?? input.publicationYear, 'year', errors, true)
  const abstract = multilineText(input.abstract ?? input.abstractText)
  const categoryId = positiveInteger(input.categoryId)
  const researchCode = compactText(input.researchCode).toUpperCase()
  const departmentOrProgram = compactText(input.departmentOrProgram ?? input.department)
  const keywords = optionalText(input.keywords ?? input.keywordsText, 5_000)
  const copyResult = validateCopyInput(input.copy, false)

  if (!title) errors.title = 'Title is required.'
  else if (title.length > TITLE_MAX_LENGTH) errors.title = `Title must not exceed ${TITLE_MAX_LENGTH} characters.`

  if (authors.length === 0) errors.author = 'At least one author is required.'
  else if (authors.some((author) => author.length > PERSON_NAME_MAX_LENGTH)) {
    errors.author = `Each author must not exceed ${PERSON_NAME_MAX_LENGTH} characters.`
  }

  if (!adviser) errors.adviser = 'Adviser is required.'
  else if (adviser.length > PERSON_NAME_MAX_LENGTH) errors.adviser = `Adviser must not exceed ${PERSON_NAME_MAX_LENGTH} characters.`

  if (!abstract) errors.abstract = 'Abstract is required.'
  else if (abstract.length < 20) errors.abstract = 'Abstract must contain at least 20 characters.'
  else if (abstract.length > ABSTRACT_MAX_LENGTH) errors.abstract = `Abstract must not exceed ${ABSTRACT_MAX_LENGTH} characters.`

  if (!researchCode) errors.researchCode = 'Research code is required for indexing.'
  else if (researchCode.length > 100) errors.researchCode = 'Research code must not exceed 100 characters.'

  if (!departmentOrProgram) errors.departmentOrProgram = 'Department or program is required.'
  else if (departmentOrProgram.length > 150) errors.departmentOrProgram = 'Department or program must not exceed 150 characters.'

  if (input.categoryId !== undefined && categoryId === null) errors.categoryId = 'Category ID must be a positive integer.'
  Object.assign(errors, copyResult.errors)

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    data: {
      title,
      authors,
      adviser,
      year: year ?? 0,
      abstract,
      categoryId,
      researchCode,
      departmentOrProgram,
      keywords,
      copy: copyResult.data,
    },
  }
}
