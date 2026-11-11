import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HoldingsImportPage } from './HoldingsImportPage'
import { ImportCleanupSummary } from './ImportCleanupSummary'
import { blankImportCsv, canReviewTogether, importRowLabel, importSummary, suggestImportReferences } from './holdings-import-helpers'
import type { Batch, ImportRow, Options, Sheet } from './enhanced-catalog-api'
const api = vi.hoisted(() => ({ options: vi.fn(), inspect: vi.fn(), stage: vi.fn(), batch: vi.fn(), batches: vi.fn(), review: vi.fn(), commit: vi.fn() }))
vi.mock('./enhanced-catalog-api', () => ({ enhancedCatalog: api }))
const options: Options = { categories: [{ id: 1, name: 'Literature', status: 'Active', version: 1 }], locations: [{ id: 2, name: 'Shelf A', status: 'Active', version: 1 }], programs: [], courses: [], types: [] }
const sheet: Sheet = { name: 'Books', rowCount: 3, headers: ['Title', 'Author', 'Copies'], mapping: { sheet: 'Books', headerRow: 1, columns: { title: 1, author: 2, copies: 3 } }, preview: [['Title', 'Author', 'Copies'], ['First Book', 'A Writer', '3'], ['Second Book', 'B Writer', '2']] }
function row(id: number, patch: Partial<ImportRow> = {}): ImportRow {
 return { id, sheet: 'Books', sourceRow: id + 1, source: [], data: { title: id === 1 ? 'First Book' : 'Second Book', author: 'A Writer', isbn: '', edition: '', publisher: '', publicationYear: '', copyrightYear: '', pages: '', copies: id === 1 ? '3' : '2', missingCopies: '', accessions: '', barcodes: '', callNumber: '', categoryId: 1, location: 'Shelf A', programId: null, generateAccessions: false }, status: 'Review', decision: null, targetTitleId: null, reuseRowId: null, version: 1, overlaps: [], errors: [], error: null, matches: [], ...patch }
}
const initial: Batch = { id: 1, filename: 'books.csv', rows: [row(1), row(2)] }
const finished: Batch = { ...initial, rows: initial.rows.map(item => ({ ...item, status: 'Imported', decision: 'new', version: 3, result: { titleId: item.id + 10, copyIds: [10, 11] } })) }
beforeEach(() => {
 api.options.mockResolvedValue(options); api.batches.mockResolvedValue([]); api.inspect.mockResolvedValue([sheet]); api.stage.mockResolvedValue({ batchId: 1, ignored: 0 })
 api.batch.mockResolvedValue(initial); api.review.mockResolvedValue({ reviewed: true }); api.commit.mockResolvedValue({ imported: 2, remaining: 0, errors: [] })
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
async function upload() {
 render(<HoldingsImportPage />)
 const input = screen.getByLabelText('Book list file') as HTMLInputElement
 await waitFor(() => expect(input.disabled).toBe(false))
 fireEvent.change(input, { target: { files: [new File(['Title,Author,Copies\nFirst Book,A Writer,3'], 'books.csv', { type: 'text/csv' })] } })
 await screen.findByText('Ready to add these books?')
 await waitFor(() => expect(screen.getByRole('button', { name: 'Choose another file' }).hasAttribute('disabled')).toBe(false))
}

describe('Simple book import', () => {
 it('shows before/after cleanup and remaining questions without approving or committing', async () => {
  const cleaned = row(1)
  cleaned.data.autoCorrections = [{ field: 'title', before: ' First   Book ', after: 'First Book', reason: 'spaces' }, { field: 'copies', before: '003.00', after: '3', reason: 'number' }]
  api.batch.mockResolvedValue({ ...initial, rows: [cleaned, row(2, { errors: ['Author is required.'] })] })
  await upload()
  const summary = screen.getByRole('region', { name: 'Automatic file cleanup' })
  expect(within(summary).getByText('Cleaned up 1 book entry automatically.')).toBeTruthy()
  expect(within(summary).getByText(/1 book still needs your help/)).toBeTruthy()
  fireEvent.click(within(summary).getByText('See what was corrected'))
  expect(within(summary).getByText('003.00')).toBeTruthy()
  expect(within(summary).getByText(/original source values are kept/)).toBeTruthy()
  expect(api.review).not.toHaveBeenCalled(); expect(api.commit).not.toHaveBeenCalled()
 })
 it('uses category/shelf columns without asking for arbitrary file-wide defaults', async () => {
  api.options.mockResolvedValue({ ...options, categories: [...options.categories, { id: 3, name: 'Science', status: 'Active', version: 1 }], locations: [...options.locations, { id: 4, name: 'Shelf B', status: 'Active', version: 1 }] })
  api.inspect.mockResolvedValue([{ ...sheet, headers: [...sheet.headers, 'Category', 'Shelf'], mapping: { ...sheet.mapping, columns: { ...sheet.mapping.columns, categoryName: 4, shelfLocation: 5 } } }])
  await upload()
  expect(screen.queryByText('Where should these books go?')).toBeNull()
  expect(api.stage.mock.calls[0][1][0]).toMatchObject({ columns: { categoryName: 4, shelfLocation: 5 } })
  expect(api.stage.mock.calls[0][1][0].categoryId).toBeUndefined()
  expect(api.commit).not.toHaveBeenCalled()
 })
 it('suggests uncertain names but changes only the local selection until Save this choice', async () => {
  const uncertain = row(1)
  uncertain.data = { ...uncertain.data, categoryId: null, location: '', categoryName: 'Literatuer', shelfLocation: 'Shefl A' }
  uncertain.errors = ['Choose an existing category.', 'Choose an active shelf.']
  api.batch.mockResolvedValue({ ...initial, rows: [uncertain] })
  await upload()
  expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('')
  expect((screen.getByLabelText('Shelf') as HTMLSelectElement).value).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'Use Literature' }))
  fireEvent.click(screen.getByRole('button', { name: 'Use Shelf A' }))
  expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('1')
  expect((screen.getByLabelText('Shelf') as HTMLSelectElement).value).toBe('Shelf A')
  expect(api.review).not.toHaveBeenCalled(); expect(api.commit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save this choice' }))
  await waitFor(() => expect(api.review).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ categoryId: 1, location: 'Shelf A' }) })))
  expect(api.commit).not.toHaveBeenCalled()
 })
 it('accepts legacy categories without a lifecycle status', async () => {
  api.options.mockResolvedValue({ ...options, categories: [{ id: 1, name: 'Literature' }] })
  await upload()
  expect(api.stage.mock.calls[0][1][0].categoryId).toBe(1)
  expect(api.commit).not.toHaveBeenCalled()
 })
 it('keeps unrelated names unresolved without suggesting inactive choices', async () => {
  const uncertain = row(1)
  uncertain.data = { ...uncertain.data, categoryId: null, location: '', categoryName: 'Completely unrelated category', shelfLocation: 'Warehouse' }
  uncertain.errors = ['Choose an existing category.']
  api.batch.mockResolvedValue({ ...initial, rows: [uncertain] })
  await upload()
  expect(screen.getByText('Choose the correct category below, then save your choice.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
  expect(api.review).not.toHaveBeenCalled(); expect(api.commit).not.toHaveBeenCalled()
 })
 it('opens a recognized file directly in a compact book list without committing or asking for a second confirmation', async () => {
  await upload()
  expect(screen.getByRole('region', { name: 'Books from your file' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: '2 book entries found' })).toBeTruthy()
  expect(screen.getByText('Copies to add')).toBeTruthy()
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Show my book list' })).toBeNull()
  expect(api.review).not.toHaveBeenCalled(); expect(api.commit).not.toHaveBeenCalled()
 })
 it('asks once for category and shelf when multiple active choices exist and never selects one arbitrarily', async () => {
  api.options.mockResolvedValue({ ...options,
   categories: [...options.categories, { id: 3, name: 'Science', status: 'Active', version: 1 }],
   locations: [...options.locations, { id: 4, name: 'Shelf B', status: 'Active', version: 1 }],
  })
  render(<HoldingsImportPage />)
  const input = screen.getByLabelText('Book list file') as HTMLInputElement
  await waitFor(() => expect(input.disabled).toBe(false))
  fireEvent.change(input, { target: { files: [new File(['Title,Author,Copies\nBook,Writer,2'], 'books.csv')] } })
  await screen.findByText('Where should these books go?')
  expect((screen.getByLabelText('Category for these books') as HTMLSelectElement).value).toBe('')
  expect((screen.getByLabelText('Shelf for these books') as HTMLSelectElement).value).toBe('')
  expect(screen.getByText('File options (optional)').closest('details')?.open).toBe(false)
  expect(api.stage).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Category for these books'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Shelf for these books'), { target: { value: 'Shelf B' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show my book list' }))
  await screen.findByText('Ready to add these books?')
  expect(api.stage.mock.calls[0][1][0]).toMatchObject({ categoryId: 3, location: 'Shelf B' })
  expect(api.commit).not.toHaveBeenCalled()
 })
 it('asks a plain question for an unrecognized copy-count heading and waits for the librarian answer', async () => {
  api.inspect.mockResolvedValue([{ ...sheet, headers: ['Title', 'Author', 'Books in shelf'], preview: [['Title', 'Author', 'Books in shelf']], mapping: { ...sheet.mapping, columns: { title: 1, author: 2 } } }])
  render(<HoldingsImportPage />)
  const input = screen.getByLabelText('Book list file') as HTMLInputElement
  await waitFor(() => expect(input.disabled).toBe(false))
  fireEvent.change(input, { target: { files: [new File(['list'], 'books.csv')] } })
  const question = await screen.findByLabelText('Which column shows the number of copies?')
  expect(api.stage).not.toHaveBeenCalled()
  fireEvent.change(question, { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show my book list' }))
  await screen.findByText('Ready to add these books?')
  expect(api.stage.mock.calls[0][1][0].columns.copies).toBe(3)
 })
 it('pauses on unrecognized identifier headings and lets the librarian include them before review', async () => {
  api.inspect.mockResolvedValue([{ ...sheet, headers: [...sheet.headers, 'Accession identifiers'], preview: [[...sheet.headers, 'Accession identifiers']], mapping: sheet.mapping }])
  render(<HoldingsImportPage />)
  const input = screen.getByLabelText('Book list file') as HTMLInputElement
  await waitFor(() => expect(input.disabled).toBe(false))
  fireEvent.change(input, { target: { files: [new File(['list'], 'books.csv')] } })
  await screen.findByText('Accession identifiers', { selector: 'strong' })
  expect(api.stage).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('File options (optional)'))
  fireEvent.change(screen.getByLabelText('Accession numbers'), { target: { value: '4' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show my book list' }))
  await screen.findByText('Ready to add these books?')
  expect(api.stage.mock.calls[0][1][0].columns.accessions).toBe(4)
 })
 it('allows a new book list even if saved-list history is temporarily unavailable', async () => {
  api.batches.mockRejectedValue(new Error('History unavailable'))
  await upload()
  expect(screen.getByText(/Saved book lists could not be loaded/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Add 5 copies' }).hasAttribute('disabled')).toBe(false)
  expect(api.commit).not.toHaveBeenCalled()
 })
 it('preserves recognized accession and barcode columns when opening review automatically', async () => {
  api.inspect.mockResolvedValue([{ ...sheet, headers: [...sheet.headers, 'Accession numbers', 'Barcodes'], preview: [[...sheet.headers, 'Accession numbers', 'Barcodes']], mapping: { ...sheet.mapping, columns: { title: 1, author: 2, copies: 3, accessions: 4, barcodes: 5 } } }])
  await upload()
  expect(api.stage.mock.calls[0][1][0].columns).toMatchObject({ accessions: 4, barcodes: 5 })
  expect(api.commit).not.toHaveBeenCalled()
 })
 it('does not use archived categories or shelves as automatic defaults', async () => {
  api.options.mockResolvedValue({ ...options, categories: options.categories.map(item => ({ ...item, status: 'Archived' })), locations: options.locations.map(item => ({ ...item, status: 'Archived' })) })
  render(<HoldingsImportPage />)
  const input = screen.getByLabelText('Book list file') as HTMLInputElement
  await waitFor(() => expect(input.disabled).toBe(false))
  fireEvent.change(input, { target: { files: [new File(['Title,Author,Copies\nBook,Writer,2'], 'books.csv')] } })
  await screen.findByText('Where should these books go?')
  expect(screen.getByRole('link', { name: 'Set up categories and shelves' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Show my book list' }).hasAttribute('disabled')).toBe(true)
  expect(api.stage).not.toHaveBeenCalled()
 })
 it('automatically reads the file, applies category/shelf once and groups clear books under one confirmation', async () => {
  api.batch.mockResolvedValueOnce(initial).mockResolvedValue(finished)
  await upload()
  expect(api.inspect).toHaveBeenCalledTimes(1)
  expect(api.stage.mock.calls[0][1][0]).toMatchObject({ categoryId: 1, location: 'Shelf A', columns: { title: 1, author: 2, copies: 3 } })
  expect(api.review).not.toHaveBeenCalled(); expect(api.commit).not.toHaveBeenCalled()
  expect((screen.getByRole('button', { name: 'Add 5 copies' }) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Add 5 copies' }))
  await screen.findByText('This upload is finished')
  expect(api.review).toHaveBeenCalledTimes(2)
  expect(api.review.mock.calls.map(call => call[0].decision)).toEqual(['new', 'new'])
  expect(api.commit).toHaveBeenCalledTimes(1)
 })
 it('does not automatically approve possible existing books or repeat copies', async () => {
  const duplicate = row(2, { matches: [{ id: 77, title: 'Second Book', author: 'A Writer', isbn: null, status: 'Active' }] })
  api.batch.mockResolvedValue({ ...initial, rows: [row(1), duplicate] })
  api.commit.mockResolvedValue({ imported: 1, remaining: 0, errors: [] })
  await upload()
  expect(screen.getByText('Needs your choice')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Add 3 copies' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Add 3 copies' }))
  await waitFor(() => expect(api.commit).toHaveBeenCalled())
  expect(api.review).toHaveBeenCalledTimes(1)
  expect(api.review.mock.calls[0][0].id).toBe(1)
 })
 it('requires an explicit extra-copy choice and automatically selects the only matching book', async () => {
  const duplicate = row(2, { matches: [{ id: 77, title: 'Second Book', author: 'A Writer', isbn: null, status: 'Active' }] })
  api.batch.mockResolvedValue({ ...initial, rows: [duplicate] })
  await upload()
  const entry = screen.getByText('Needs your choice').closest('details')!
  fireEvent.change(within(entry).getByLabelText('What should happen to this book?'), { target: { value: 'add' } })
  expect((within(entry).getByLabelText('Which library book?') as HTMLSelectElement).value).toBe('77')
  fireEvent.change(within(entry).getByLabelText('Extra copies to add (not the library total)'), { target: { value: '4' } })
  fireEvent.click(within(entry).getByRole('button', { name: 'Save this choice' }))
  await waitFor(() => expect(api.review).toHaveBeenCalledWith(expect.objectContaining({ id: 2, decision: 'add', targetTitleId: 77, data: expect.objectContaining({ copies: '4' }) })))
  expect(api.commit).not.toHaveBeenCalled()
 })
 it('stops before catalog writes if a review becomes stale and reloads the saved upload', async () => {
  api.review.mockRejectedValueOnce(new Error('This book changed. Review it again.'))
  await upload(); fireEvent.click(screen.getByRole('button', { name: 'Add 5 copies' }))
  await screen.findByText(/No books were added in this attempt/)
  expect(api.commit).not.toHaveBeenCalled()
  expect(api.batch).toHaveBeenCalledTimes(2)
 })
 it('reloads after an interrupted save and resumes without reviewing completed books again', async () => {
  const partial = { ...initial, rows: [finished.rows[0], row(2, { status: 'Ready', decision: 'new', version: 2 })] }
  api.batch.mockResolvedValueOnce(initial).mockResolvedValue(partial)
  api.commit.mockResolvedValueOnce({ imported: 1, remaining: 1, errors: [] }).mockRejectedValueOnce(new Error('Network disconnected')).mockResolvedValueOnce({ imported: 1, remaining: 0, errors: [] })
  await upload(); fireEvent.click(screen.getByRole('button', { name: 'Add 5 copies' }))
  await screen.findByText(/The connection was interrupted while adding books/)
  expect(screen.getByRole('button', { name: 'Add 2 copies' })).toBeTruthy()
  api.batch.mockResolvedValue(finished)
  fireEvent.click(screen.getByRole('button', { name: 'Add 2 copies' }))
  await screen.findByText('This upload is finished')
  expect(api.review).toHaveBeenCalledTimes(2)
  expect(api.commit).toHaveBeenCalledTimes(3)
 })
 it('shows a source-book name for a save error and requires correction before retry', async () => {
  const failed = { ...initial, rows: [row(1, { status: 'Ready', decision: 'new', error: 'An accession already exists.' }), finished.rows[1]] }
  api.batch.mockResolvedValueOnce(initial).mockResolvedValue(failed)
  api.commit.mockResolvedValue({ imported: 1, remaining: 1, errors: [{ rowId: 1, message: 'An accession already exists.' }] })
  await upload(); fireEvent.click(screen.getByRole('button', { name: 'Add 5 copies' }))
  await screen.findByText(/First Book \(Books, line 2\): An accession already exists/)
  expect(screen.getByText('Correct the books with save errors before continuing.')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Save reviewed choices' }) as HTMLButtonElement).disabled).toBe(true)
 })
 it('clears an old error after a successful correction', async () => {
  api.batch.mockResolvedValue({ ...initial, rows: [row(2, { errors: ['Author is required.'] })] })
  api.review.mockRejectedValueOnce(new Error('Choose a valid author.')).mockResolvedValueOnce({ reviewed: true })
  await upload()
  fireEvent.click(screen.getByRole('button', { name: 'Save this choice' }))
  await screen.findByText('Choose a valid author.')
  api.batch.mockResolvedValue({ ...initial, rows: [row(2, { status: 'Ready', decision: 'new' })] })
  fireEvent.click(screen.getByRole('button', { name: 'Save this choice' }))
  await screen.findByText('Your choice was saved. Check the updated totals below before adding books.')
  expect(screen.queryByText('Choose a valid author.')).toBeNull()
 })
 it('does not guess required column meanings or import before a category and shelf are chosen', async () => {
  api.inspect.mockResolvedValue([{ ...sheet, mapping: { ...sheet.mapping, columns: { title: 1, author: 2 } } }])
  render(<HoldingsImportPage />)
  const input = screen.getByLabelText('Book list file') as HTMLInputElement
  await waitFor(() => expect(input.disabled).toBe(false))
  fireEvent.change(input, { target: { files: [new File(['anything'], 'books.csv')] } })
  await screen.findByText(/A few details need your help/)
  expect((screen.getByRole('button', { name: 'Show my book list' }) as HTMLButtonElement).disabled).toBe(true)
  expect(api.stage).not.toHaveBeenCalled()
 })
})

describe('Import grouping safeguards', () => {
 it('lets the librarian read corrections after the first 20 entries', () => {
  const rows = Array.from({ length: 21 }, (_, index) => {
   const item = row(index + 1)
   item.data.title = `Cleaned Book ${index + 1}`
   item.data.autoCorrections = [{ field: 'copies', before: '003.0', after: '3', reason: 'number' }]
   return item
  })
  render(<ImportCleanupSummary batch={{ ...initial, rows }} needsHelp={0} />)
  expect(screen.queryByText('Cleaned Book 21')).toBeNull()
  fireEvent.click(screen.getByText('See what was corrected'))
  fireEvent.click(screen.getByRole('button', { name: 'Show more corrections (1 entry left)' }))
  expect(screen.getByText('Cleaned Book 21')).toBeTruthy()
 })
 it('bounds reference suggestions and excludes archived names', () => {
  expect(suggestImportReferences('Literatuer', options.categories).map(item => item.id)).toEqual([1])
  expect(suggestImportReferences('Literature', options.categories.map(item => ({ ...item, status: 'Archived' })))).toEqual([])
  expect(suggestImportReferences('a'.repeat(101), options.categories)).toEqual([])
 })
 it('allows only valid unambiguous untouched new rows to share the final confirmation', () => {
  expect(canReviewTogether(row(1))).toBe(true)
  for (const patch of [{ errors: ['Bad ISBN'] }, { overlaps: [2] }, { matches: [{ id: 3 } as any] }, { status: 'Imported' }, { status: 'Skipped' }, { error: 'Failed' }, { decision: 'add' }]) expect(canReviewTogether(row(1, patch))).toBe(false)
 })
 it('keeps copies already recorded at zero and includes missing-copy counts separately', () => {
  const data = { ...row(1).data, copies: '3', missingCopies: '1' }
  const sum = importSummary({ ...initial, rows: [row(1, { data }), row(2, { status: 'Ready', decision: 'link' }), row(3, { status: 'Ready', decision: 'reuse' })] })
  expect(sum.ready.length).toBe(3); expect(sum.copies).toBe(3); expect(sum.missing).toBe(1)
 })
 it('keeps failed reviewed rows out of totals and labels completed/skipped entries clearly', () => {
  expect(importRowLabel(row(1, { status: 'Imported' }))).toBe('Added')
  expect(importRowLabel(row(1, { status: 'Skipped' }))).toBe('Left out')
  const sum = importSummary({ ...initial, rows: [row(1, { status: 'Ready', decision: 'new', error: 'Failed' })] })
  expect(sum.failedReady).toBe(true); expect(sum.copies).toBe(0); expect(sum.attention.length).toBe(1)
 })
 it('offers a blank template without sample books that could be imported by mistake', () => {
  expect(blankImportCsv).toBe('\uFEFFTitle,Author,Copies\r\n')
  expect(blankImportCsv.trim().split(/\r?\n/)).toHaveLength(1)
 })
})
