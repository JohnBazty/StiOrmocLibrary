import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CategoryManagementPage } from './CategoryManagementPage'

const api = vi.hoisted(() => ({ list: vi.fn(), listShelves: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), reassign: vi.fn() }))
vi.mock('./category-api', () => ({ categoryApi: api, CategoryApiError: class extends Error {} }))
const catalog = vi.hoisted(() => ({ searchSubjects: vi.fn() }))
vi.mock('../catalog/catalog-api', () => ({ catalogApi: catalog }))

function renderPage() {
  return render(<MemoryRouter><CategoryManagementPage /></MemoryRouter>)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('CategoryManagementPage', () => {
  it('edits the shelf through Edit category and refreshes the directory', async () => {
    const category = { categoryId: 7, categoryName: 'Programming', description: 'Software development books', shelfLocation: 'Shelf A', shelfColumn: 1, shelfRow: 2, totalBooksCount: 3, totalThesisCount: 1, createdAt: '2026-09-25T00:00:00Z', updatedAt: null }
    const moved = { ...category, shelfLocation: 'Shelf B', shelfColumn: 2, shelfRow: 3 }
    api.list.mockResolvedValueOnce([category]).mockResolvedValue([moved])
    api.listShelves.mockResolvedValue([{ id: 1, label: 'Shelf A', columnCount: 3, rowCount: 5 }, { id: 2, label: 'Shelf B', columnCount: 2, rowCount: 3 }])
    api.update.mockResolvedValue({ ...moved, bookCopies: 3, researchCopies: 1 })
    renderPage()
    await screen.findByText('Programming')
    fireEvent.click(screen.getByLabelText('Actions for Programming'))
    expect(screen.queryByRole('button', { name: /Edit shelf location/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Programming' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Edit category' }))
    expect((dialog.getByLabelText(/Category name/i) as HTMLInputElement).value).toBe(category.categoryName)
    expect((dialog.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(category.description)
    expect((dialog.getByLabelText(/Shelf location/i) as HTMLSelectElement).value).toBe('Shelf A')
    expect((dialog.getByLabelText(/Row \*/i) as HTMLSelectElement).value).toBe('2')
    fireEvent.change(dialog.getByLabelText(/Shelf location/i), { target: { value: 'Shelf B' } })
    fireEvent.change(dialog.getByLabelText(/Column \*/i), { target: { value: '2' } })
    fireEvent.change(dialog.getByLabelText(/Row \*/i), { target: { value: '3' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save category' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(7, { categoryName: category.categoryName, description: category.description, shelfLocation: 'Shelf B', shelfColumn: 2, shelfRow: 3 }))
    expect((await screen.findByRole('status')).textContent).toContain('Existing copies keep their assigned locations.')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Shelf B · C2 · R3')).toBeTruthy()
    expect(api.create).not.toHaveBeenCalled()
    expect(api.reassign).not.toHaveBeenCalled()
  })

  it('keeps a failed shelf edit open and allows cancellation without another save', async () => {
    api.list.mockResolvedValue([{ categoryId: 8, categoryName: 'Science', description: '', shelfLocation: 'Shelf A', shelfColumn: 1, shelfRow: 1, totalBooksCount: 0, totalThesisCount: 0, createdAt: '2026-09-25T00:00:00Z', updatedAt: null }])
    api.listShelves.mockResolvedValue([{ id: 1, label: 'Shelf A', columnCount: 3, rowCount: 5 }])
    api.update.mockRejectedValueOnce(new Error('Shelf location could not be saved.'))
    renderPage()
    await screen.findByText('Science')
    fireEvent.click(screen.getByLabelText('Actions for Science'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Science' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save category' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Shelf location could not be saved.')
    expect(screen.getByRole('dialog', { name: 'Edit category' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.update).toHaveBeenCalledTimes(1)
  })

  it('does not show managed shelves on the categories screen', async () => {
    api.list.mockResolvedValue([])
    api.listShelves.mockResolvedValue([{ id: 1, label: 'Shelf A', status: 'Active', columnCount: 1, rowCount: 1 }])
    renderPage()
    await screen.findByText('No categories have been registered.')
    expect(screen.queryByRole('heading', { name: 'Managed shelves' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add shelf' })).toBeNull()
  })

  it('shows the canonical category details and keeps assigned categories out of direct delete', async () => {
    api.list.mockResolvedValue([{ categoryId: 7, categoryName: 'Programming', description: 'Software development books', shelfLocation: 'Shelf A', shelfColumn: 1, shelfRow: 2, totalBooksCount: 3, totalThesisCount: 0, createdAt: '2026-09-25T00:00:00.000Z', updatedAt: null }])
    api.listShelves.mockResolvedValue([{ id: 1, label: 'Shelf A', columnCount: 3, rowCount: 5 }])
    renderPage()
    expect(await screen.findByText('Software development books')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('Sep 25, 2026')).toBeTruthy()
    expect(screen.getByText('Book copies')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Actions for Programming'))
    expect((screen.getByRole('button', { name: /Cannot delete category/i }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Programming' }))
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Software development books')
  })

  it('finds subjects online and opens a new category with the subject name', async () => {
    api.list.mockResolvedValue([{ categoryId: 7, categoryName: 'Computer programming', description: '', shelfLocation: 'Shelf A', shelfColumn: 1, shelfRow: 1, totalBooksCount: 0, totalThesisCount: 0, createdAt: '2026-09-25T00:00:00Z', updatedAt: null }])
    api.listShelves.mockResolvedValue([{ id: 1, label: 'Shelf A', columnCount: 3, rowCount: 5 }])
    catalog.searchSubjects.mockResolvedValue({ subjects: [{ name: 'Computer programming', workCount: 6386 }, { name: 'Object-oriented programming', workCount: 1967 }] })
    renderPage()
    await screen.findAllByText('Computer programming')
    fireEvent.change(screen.getByLabelText('Subject to search'), { target: { value: 'programming' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search subjects' }))
    expect(await screen.findByText('Already a category')).toBeTruthy()
    expect(catalog.searchSubjects).toHaveBeenCalledWith('programming')
    fireEvent.click(screen.getByRole('button', { name: 'Create category Object-oriented programming' }))
    expect((await screen.findByLabelText(/Category name \*/i) as HTMLInputElement).value).toBe('Object-oriented programming')
  })
})
