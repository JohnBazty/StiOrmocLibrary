import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResearchImportDialog } from './ResearchImportDialog'

const api = vi.hoisted(() => ({ preview: vi.fn(), save: vi.fn() }))
const enhanced = vi.hoisted(() => ({ options: vi.fn(), saveFoundation: vi.fn() }))
vi.mock('./research-import-api', () => ({ researchImportApi: api }))
vi.mock('./enhanced-catalog-api', () => ({ enhancedCatalog: enhanced }))

const fields = (title: string, program = 'Hospitality Management') => ({ copyNumbers: '1-2', authors: 'Alamil, B.B.', year: '2022', title, program, adviser: '', abstract: '', keywords: '', researchCode: '', shelf: '' })
const row = (rowNumber: number, title: string, errors: string[] = []) => ({
  row: rowNumber, fields: fields(title), errors, conflict: false, copies: [1, 2], accessionNumbers: ['BSHM-1', 'BSHM-2'],
  researchCode: 'BSHM-2022-1', programId: 7, programName: 'Hospitality Management', shelf: 'Thesis A-1',
})

function chooseFile() {
  const file = new File(['x'], 'hm.csv', { type: 'text/csv' })
  fireEvent.change(screen.getByLabelText('Research list file'), { target: { files: [file] } })
  return file
}
async function checkFile() {
  fireEvent.change(await screen.findByLabelText('Shelf for these research titles'), { target: { value: 'Thesis A-1' } })
  chooseFile()
  fireEvent.click(screen.getByRole('button', { name: 'Check file' }))
}

beforeEach(() => {
  enhanced.options.mockResolvedValue({ locations: [{ name: 'Thesis A-1', status: 'Active' }, { name: 'Old', status: 'Archived' }], programs: [] })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('ResearchImportDialog', () => {
  it('needs a file and a shelf before the file can be checked, and offers the template', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:template')
    URL.revokeObjectURL = vi.fn()
    render(<ResearchImportDialog onClose={vi.fn()} onImported={vi.fn()} />)
    const check = await screen.findByRole('button', { name: 'Check file' }) as HTMLButtonElement
    expect(check.disabled).toBe(true)
    expect([...(screen.getByLabelText('Shelf for these research titles') as HTMLSelectElement).options].map((option) => option.text)).toEqual(['Select shelf', 'Thesis A-1'])
    fireEvent.click(screen.getByRole('button', { name: /Download template/ }))
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('lists rows needing attention first and blocks the import while any row has an error', async () => {
    api.preview.mockResolvedValue({ rows: [row(3, 'Broken', ['Copy BSHM-1 is already in the catalog.']), row(2, 'Fine')], unknownPrograms: [], total: 2, errorCount: 1 })
    render(<ResearchImportDialog onClose={vi.fn()} onImported={vi.fn()} />)
    await checkFile()
    await waitFor(() => expect(api.preview).toHaveBeenCalled())
    const rows = await screen.findAllByRole('row')
    expect(within(rows[1]).getByText('Broken')).toBeTruthy()
    expect(within(rows[1]).getByText(/already in the catalog/)).toBeTruthy()
    expect(within(rows[2]).getByText('Ready')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Import 2 research titles/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/1 row needs attention/)).toBeTruthy()
  })

  it('imports the checked rows and reports the result', async () => {
    api.preview.mockResolvedValue({ rows: [row(2, 'One'), row(3, 'Two')], unknownPrograms: [], total: 2, errorCount: 0 })
    api.save.mockResolvedValue({ titles: 2, copies: 4 })
    const onImported = vi.fn()
    render(<ResearchImportDialog onClose={vi.fn()} onImported={onImported} />)
    await checkFile()
    fireEvent.click(await screen.findByRole('button', { name: 'Import 2 research titles' }))
    await waitFor(() => expect(api.save).toHaveBeenCalledWith({ shelf: 'Thesis A-1', rows: [{ ...fields('One'), row: 2 }, { ...fields('Two'), row: 3 }] }))
    expect(await screen.findByText(/2 research titles with 4 copies were imported/)).toBeTruthy()
    expect(onImported).toHaveBeenCalled()
  })

  it('lists the per-row errors when the import is refused, and closes on Escape', async () => {
    api.preview.mockResolvedValue({ rows: [row(2, 'One')], unknownPrograms: [], total: 1, errorCount: 0 })
    api.save.mockRejectedValue(Object.assign(new Error('Some rows cannot be imported. Nothing was saved.'), { details: { rows: [{ row: 2, errors: ['Copy BSHM-1 is already in the catalog.'] }] } }))
    const onClose = vi.fn()
    render(<ResearchImportDialog onClose={onClose} onImported={vi.fn()} />)
    await checkFile()
    fireEvent.click(await screen.findByRole('button', { name: 'Import 1 research title' }))
    expect(await screen.findByText(/Row 2: Copy BSHM-1 is already in the catalog/)).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('adds an unknown program and checks the file again', async () => {
    api.preview
      .mockResolvedValueOnce({ rows: [{ ...row(2, 'One', ['Program "Culinary Arts" does not exist yet.']), programId: null, programName: null }], unknownPrograms: ['Culinary Arts'], total: 1, errorCount: 1 })
      .mockResolvedValueOnce({ rows: [row(2, 'One')], unknownPrograms: [], total: 1, errorCount: 0 })
    enhanced.saveFoundation.mockResolvedValue({})
    render(<ResearchImportDialog onClose={vi.fn()} onImported={vi.fn()} />)
    await checkFile()
    fireEvent.change(await screen.findByLabelText('Code for Culinary Arts'), { target: { value: 'bscs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Culinary Arts as a department/program' }))
    await waitFor(() => expect(enhanced.saveFoundation).toHaveBeenCalledWith('programs', null, { name: 'Culinary Arts', code: 'BSCS' }))
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2))
    expect((await screen.findByRole('button', { name: /Import 1 research title/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})
