import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CategoryManagementPage } from './CategoryManagementPage'

const api = vi.hoisted(() => ({ list: vi.fn(), listShelves: vi.fn(), addShelf: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), reassign: vi.fn() }))
vi.mock('./category-api', () => ({ categoryApi: api, CategoryApiError: class extends Error {} }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('CategoryManagementPage', () => {
  it('shows the canonical category details and keeps assigned categories out of direct delete', async () => {
    api.list.mockResolvedValue([{ categoryId: 7, categoryName: 'Programming', description: 'Software development books', shelfLocation: 'Shelf A', shelfColumn: 1, shelfRow: 2, totalBooksCount: 3, totalThesisCount: 0, createdAt: '2026-09-25T00:00:00.000Z', updatedAt: null }])
    api.listShelves.mockResolvedValue([{ id: 1, label: 'Shelf A', columnCount: 3, rowCount: 5 }])
    render(<CategoryManagementPage />)
    expect(await screen.findByText('Software development books')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('Sep 25, 2026')).toBeTruthy()
    expect(screen.getByText('Book copies')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Cannot delete category/i }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Programming' }))
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Software development books')
  })
})
