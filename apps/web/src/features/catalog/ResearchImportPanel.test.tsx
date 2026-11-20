import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ResearchImportPanel } from './ResearchImportPanel'

const api = vi.hoisted(() => ({ preview: vi.fn(), importRows: vi.fn() }))
vi.mock('./research-import-api', () => ({ researchImportApi: api }))
vi.mock('../shelves/useManagedShelves', () => ({ useManagedShelves: () => ({ shelves: [{ id: 1, label: 'Thesis Rack 1' }], loading: false, error: '', refresh: async () => {} }) }))

const good = (line: number, code: string) => ({ line, errors: {}, data: { title: `Study ${code}`, authors: ['Ana Cruz'], adviser: 'Dr. Lim', year: 2025, abstract: 'x'.repeat(30), researchCode: code, departmentOrProgram: 'BSIT', keywords: '', copy: { shelfLocation: 'Thesis Rack 1' } } })
const bad = { line: 4, errors: { title: 'Title is required.' }, data: { ...good(4, '').data, title: '' } }
beforeEach(() => { api.preview.mockResolvedValue({ missingColumns: [], rows: [good(2, 'R-001'), good(3, 'R-002'), bad] }) })
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('checks a research list, shows which rows need fixing, and imports only the ready ones', async () => {
  api.importRows.mockResolvedValue({ imported: 1, failed: [{ line: 3, message: 'The research code is already assigned to another thesis.' }] })
  render(<ResearchImportPanel />)
  fireEvent.change(screen.getByLabelText('Default shelf for rows without one'), { target: { value: 'Thesis Rack 1' } })
  fireEvent.change(screen.getByLabelText('Research list file'), { target: { files: [new File(['x'], 'research.csv')] } })
  fireEvent.click(screen.getByRole('button', { name: 'Check file' }))
  await waitFor(() => expect(api.preview).toHaveBeenCalledWith(expect.any(File), 'Thesis Rack 1'))
  const table = await screen.findByRole('table', { name: 'Research rows' })
  expect(within(table).getByText('Title is required.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Import 2 ready records' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
  await waitFor(() => expect(api.importRows).toHaveBeenCalledWith([{ line: 2, data: good(2, 'R-001').data }, { line: 3, data: good(3, 'R-002').data }]))
  expect(await screen.findByText(/1 research record added/)).toBeTruthy()
  expect(screen.getByText(/Line 3: The research code is already assigned/)).toBeTruthy()
})

it('says which required columns the file is missing and imports nothing', async () => {
  api.preview.mockResolvedValue({ missingColumns: ['Adviser', 'Abstract'], rows: [] })
  render(<ResearchImportPanel />)
  fireEvent.change(screen.getByLabelText('Research list file'), { target: { files: [new File(['x'], 'research.csv')] } })
  fireEvent.click(screen.getByRole('button', { name: 'Check file' }))
  expect(await screen.findByText(/missing these columns: Adviser, Abstract/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Import/ })).toBeNull()
})
