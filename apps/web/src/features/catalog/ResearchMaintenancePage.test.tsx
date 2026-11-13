import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResearchMaintenancePage } from './ResearchMaintenancePage'
import { CatalogManagementPage } from './CatalogManagementPage'

const api = vi.hoisted(() => ({
  search: vi.fn(), copies: vi.fn(), categories: vi.fn(), updateThesis: vi.fn(), archiveThesis: vi.fn(), archiveBook: vi.fn(),
  createThesis: vi.fn(), parseRegistry: vi.fn(),
}))
const enhanced = vi.hoisted(() => ({ options: vi.fn(), saveFoundation: vi.fn() }))
const inventory = vi.hoisted(() => ({ thesisSummary: vi.fn(), thesisRows: vi.fn() }))
const overview = vi.hoisted(() => vi.fn())
vi.mock('./catalog-api', () => ({ catalogApi: api, ApiError: class extends Error {} }))
vi.mock('./enhanced-catalog-api', () => ({ enhancedCatalog: enhanced }))
vi.mock('./research-catalog-api', () => ({ fetchResearchOverview: overview }))
vi.mock('../inventory/inventory-api', () => ({ inventoryApi: inventory, InventoryApiError: class extends Error {} }))

const thesis = {
  titleId: 7, recordType: 'Research/Thesis', title: 'Smart Shelf Study', coverImagePath: null, authors: ['Dela Cruz, Ana'], isbn: null, publicationYear: 2025,
  categoryId: 3, categoryName: 'Research', rowVersion: 1, shelfLocation: 'Research A', actualShelfLocations: [], activeInventoryCount: 1, shelfStatus: 'Mapped',
  availability: 'Available for Viewing', totalCopies: 1, availableCopies: 1,
  research: { researchInventoryId: 5, researchCode: 'RS-2025-01', adviser: 'Prof. Reyes', departmentOrProgram: 'BSIT' },
}

beforeEach(() => {
  enhanced.options.mockResolvedValue({ locations: [{ name: 'Research A', status: 'Active' }], programs: [{ id: 1, name: 'Information Technology', code: 'BSIT', status: 'Active' }, { id: 2, name: 'Old Program', code: 'OLD', status: 'Archived' }] })
  api.search.mockResolvedValue({ items: [thesis], pagination: { total: 1 } })
  api.copies.mockResolvedValue([])
  api.categories.mockResolvedValue([])
  inventory.thesisSummary.mockResolvedValue({ total_thesis_materials: 1, damaged_thesis_count: 0, lost_thesis_count: 0 })
  inventory.thesisRows.mockResolvedValue({ items: [{ research_inventory_id: 5, item_title: 'Smart Shelf Study', title: 'Smart Shelf Study', authors: 'Ana', adviser: 'Prof. Reyes', publication_year: 2025, accession_number: 'TH-5', barcode: 'THESIS-5', condition_state: 'good', availability_status: 'available', shelf_location: 'Research A', last_audited_at: null, row_version: 1 }], pagination: { page: 1, limit: 25, total: 1, total_pages: 1 } })
  overview.mockResolvedValue({ abstract: 'A long enough abstract about smart shelves.', keywords: 'shelf, iot' })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('ResearchMaintenancePage', () => {
  it('lists research titles only, offers Add thesis and no Add book, and loads bound copies', async () => {
    render(<ResearchMaintenancePage />)
    expect(await screen.findByText('Dela Cruz, Ana')).toBeTruthy()
    expect(api.search).toHaveBeenCalledWith(expect.objectContaining({ scope: 'research' }))
    expect(screen.getByRole('heading', { name: 'Research and thesis management' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Add book/ })).toBeNull()
    expect(screen.queryByText('Physical copy register')).toBeNull()
    // One scanner per page: bound-copy scans belong to the inventory section, not the title search.
    expect(screen.queryByText('Hardware scanner hook')).toBeNull()
    expect(api.copies).not.toHaveBeenCalled()
    expect(await screen.findByText('TH-5')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Add thesis/ }))
    expect(screen.getByRole('heading', { name: 'Add research / thesis' })).toBeTruthy()
  })

  it('picks the department/program from active programs and can add a new one', async () => {
    enhanced.saveFoundation.mockResolvedValue({})
    render(<ResearchMaintenancePage />)
    fireEvent.click(await screen.findByRole('button', { name: /Add thesis/ }))
    const select = await screen.findByLabelText(/Department \/ program/) as HTMLSelectElement
    await waitFor(() => expect([...select.options].map((option) => option.text)).toEqual(['Select department / program', 'Information Technology']))
    fireEvent.click(screen.getByRole('button', { name: 'Add department/program' }))
    fireEvent.change(screen.getByLabelText('New program name'), { target: { value: 'Hospitality Management' } })
    fireEvent.change(screen.getByLabelText('New program code'), { target: { value: 'bshm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save program' }))
    await waitFor(() => expect(enhanced.saveFoundation).toHaveBeenCalledWith('programs', null, { name: 'Hospitality Management', code: 'BSHM' }))
    await waitFor(() => expect(select.value).toBe('Hospitality Management'))
  })

  it('lets an existing adviser be changed and cleared when editing', async () => {
    api.updateThesis.mockResolvedValue({})
    render(<ResearchMaintenancePage />)
    fireEvent.click(await screen.findByRole('button', { name: /Edit research/ }))
    const adviser = await screen.findByLabelText(/Adviser/) as HTMLInputElement
    fireEvent.change(adviser, { target: { value: 'Prof. Santos' } })
    expect(adviser.value).toBe('Prof. Santos')
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }))
    await waitFor(() => expect(api.updateThesis).toHaveBeenCalledWith(7, expect.objectContaining({ adviser: 'Prof. Santos' })))
  })

  it('does not require an adviser or an abstract', async () => {
    render(<ResearchMaintenancePage />)
    fireEvent.click(await screen.findByRole('button', { name: /Add thesis/ }))
    expect((await screen.findByLabelText(/Adviser/) as HTMLInputElement).required).toBe(false)
    expect((screen.getByLabelText(/Abstract/) as HTMLTextAreaElement).required).toBe(false)
  })

  it('opens the import from Excel or CSV', async () => {
    render(<ResearchMaintenancePage />)
    fireEvent.click(await screen.findByRole('button', { name: /Import from Excel\/CSV/ }))
    expect(await screen.findByRole('heading', { name: 'Import research from Excel or CSV' })).toBeTruthy()
  })

  it('prefills Edit research and saves metadata with copy null', async () => {
    api.updateThesis.mockResolvedValue({})
    render(<ResearchMaintenancePage />)
    fireEvent.click(await screen.findByRole('button', { name: /Edit research/ }))
    expect(await screen.findByRole('heading', { name: 'Edit research' })).toBeTruthy()
    expect((await screen.findByLabelText(/Adviser/) as HTMLInputElement).value).toBe('Prof. Reyes')
    expect((screen.getByLabelText(/Abstract/) as HTMLTextAreaElement).value).toContain('smart shelves')
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }))
    await waitFor(() => expect(api.updateThesis).toHaveBeenCalledWith(7, expect.objectContaining({
      title: 'Smart Shelf Study', authors: ['Dela Cruz, Ana'], adviser: 'Prof. Reyes', researchCode: 'RS-2025-01', departmentOrProgram: 'BSIT', keywords: 'shelf, iot', categoryId: 3, copy: null,
    })))
  })

  it('blocks archive without a reason, then archives with it', async () => {
    api.archiveThesis.mockResolvedValue({})
    render(<ResearchMaintenancePage />)
    fireEvent.click(await screen.findByRole('button', { name: /Archive research/ }))
    const confirm = screen.getAllByRole('button', { name: 'Archive research' }).at(-1) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Reason for archiving/), { target: { value: 'Duplicate record' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.archiveThesis).toHaveBeenCalledWith(7, 'Duplicate record'))
  })
})

describe('CatalogManagementPage kind="book"', () => {
  it('has no Add thesis or research total and searches books only', async () => {
    render(<CatalogManagementPage kind="book" maintenance />)
    await waitFor(() => expect(api.search).toHaveBeenCalledWith(expect.objectContaining({ scope: 'books' })))
    expect(screen.queryByRole('button', { name: /Add thesis/ })).toBeNull()
    expect(screen.queryByText('Visible research')).toBeNull()
    expect(screen.getByRole('button', { name: /Add book/ })).toBeTruthy()
    expect(screen.getByText('Physical copy register')).toBeTruthy()
  })
})
