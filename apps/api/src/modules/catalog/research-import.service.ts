import { HttpError } from '../../core/http-error.ts'
import { readHoldings } from './holdings-parser.ts'
import { validateThesisEntry } from './catalog.validation.ts'
import { catalogService } from './catalog.service.ts'

/** File headings each research field accepts (lower case, spaces collapsed). */
const FIELDS = {
  title: /^(title|research title|thesis title|research)$/,
  authors: /^(authors?|researchers?|proponents?)$/,
  adviser: /^(adviser|advisor|research adviser)$/,
  year: /^(year|publication year|year published|school year)$/,
  abstract: /^(abstract|summary)$/,
  researchCode: /^(research code|code|thesis code|research no\.?|research number)$/,
  departmentOrProgram: /^(department|program|department or program|course|strand|program or strand)$/,
  keywords: /^(keywords?|subjects?)$/,
  shelfLocation: /^(shelf|shelf location|location)$/,
} as const
type Field = keyof typeof FIELDS
const REQUIRED: Array<[Field, string]> = [['title', 'Title'], ['authors', 'Authors'], ['adviser', 'Adviser'], ['year', 'Year'], ['abstract', 'Abstract'], ['researchCode', 'Research code'], ['departmentOrProgram', 'Department or program']]
const MAX_ROWS = 500
const heading = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

type Creator = { createThesisEntry: (body: unknown) => Promise<unknown> }
export type ResearchImportRow = { line: number; data: ReturnType<typeof validateThesisEntry>['data']; errors: Record<string, string> }

function columnsOf(row: string[]) {
  const columns: Partial<Record<Field, number>> = {}
  row.forEach((cell, index) => {
    const text = heading(cell)
    for (const field of Object.keys(FIELDS) as Field[]) if (columns[field] === undefined && FIELDS[field].test(text)) columns[field] = index
  })
  return columns
}

/** First sheet whose heading row (within its first ten lines) names a research title. */
function findTable(sheets: Array<{ rows: string[][] }>) {
  for (const sheet of sheets) {
    for (let index = 0; index < Math.min(10, sheet.rows.length); index++) {
      const columns = columnsOf(sheet.rows[index])
      if (columns.title !== undefined && Object.keys(columns).length >= 2) return { rows: sheet.rows, headerIndex: index, columns }
    }
  }
  return null
}

function firstError(error: unknown) {
  const details = error instanceof HttpError ? (error.details as { errors?: Record<string, string> } | undefined) : undefined
  const fieldMessage = details?.errors ? Object.values(details.errors)[0] : undefined
  return fieldMessage ?? (error instanceof Error ? error.message : 'This research record could not be saved.')
}

/**
 * Bulk research import: read a research list file, check every row the same way as Add Research,
 * then add the rows that pass. Each row is saved on its own, so one bad row never blocks the rest.
 */
export function createResearchImport(creator: Creator = catalogService) {
  return {
    async preview(file: { buffer: Buffer; originalname: string } | undefined, defaultShelf: unknown) {
      if (!file) throw new HttpError(422, 'RESEARCH_IMPORT_FILE_REQUIRED', 'Choose a research list file (CSV or Excel).')
      const table = findTable(await readHoldings(file))
      if (!table) return { missingColumns: REQUIRED.map(([, label]) => label), rows: [] as ResearchImportRow[] }
      const missingColumns = REQUIRED.filter(([field]) => table.columns[field] === undefined).map(([, label]) => label)
      const shelf = typeof defaultShelf === 'string' ? defaultShelf.trim() : ''
      const rows: ResearchImportRow[] = []
      for (let index = table.headerIndex + 1; index < table.rows.length; index++) {
        const cells = table.rows[index]
        if (!cells.some(cell => String(cell ?? '').trim())) continue
        const value = (field: Field) => table.columns[field] === undefined ? '' : String(cells[table.columns[field]!] ?? '').trim()
        const body = {
          title: value('title'),
          authors: value('authors').split(/;|\n/).map(name => name.trim()).filter(Boolean),
          adviser: value('adviser'), year: value('year'), abstract: value('abstract'),
          researchCode: value('researchCode'), departmentOrProgram: value('departmentOrProgram'), keywords: value('keywords'),
          copy: { shelfLocation: value('shelfLocation') || shelf },
        }
        const checked = validateThesisEntry(body)
        rows.push({ line: index + 1, data: checked.data, errors: checked.errors })
        if (rows.length > MAX_ROWS) throw new HttpError(422, 'RESEARCH_IMPORT_TOO_LARGE', `Import at most ${MAX_ROWS} research records at a time.`)
      }
      return { missingColumns, rows }
    },

    async importRows(body: unknown) {
      const input = (body && typeof body === 'object' ? body : {}) as { rows?: unknown }
      const rows = Array.isArray(input.rows) ? input.rows as Array<{ line?: unknown; data?: unknown }> : []
      if (!rows.length || rows.length > MAX_ROWS) throw new HttpError(422, 'RESEARCH_IMPORT_ROWS_INVALID', `Send 1 to ${MAX_ROWS} research records.`)
      let imported = 0
      const failed: Array<{ line: number; message: string }> = []
      for (const row of rows) {
        const line = Number(row.line) || 0
        // Rows are checked again here: what the browser sends back is never trusted as already valid.
        const checked = validateThesisEntry(row.data)
        if (!checked.isValid) { failed.push({ line, message: Object.values(checked.errors)[0] ?? 'Check this research record.' }); continue }
        try { await creator.createThesisEntry(row.data); imported++ }
        catch (error) { failed.push({ line, message: firstError(error) }) }
      }
      return { imported, failed }
    },
  }
}

export const researchImport = createResearchImport()
