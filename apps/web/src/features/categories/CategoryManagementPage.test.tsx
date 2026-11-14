import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CategoryManagementPage } from './CategoryManagementPage'

const api = vi.hoisted(() => ({ list: vi.fn(), listShelves: vi.fn(), addShelf: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), reassign: vi.fn() }))
vi.mock('./category-api', () => ({ categoryApi: api, CategoryApiError: class extends Error {} }))
const catalog = vi.hoisted(() => ({ searchSubjects: vi.fn() }))
vi.mock('../catalog/catalog-api', () => ({ catalogApi: catalog }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('CategoryManagementPage', () => {
  it('marks shelf creation as success, allows dismissal, and reports a failed attempt as an error', async () => {
    api.list.mockResolvedValue([])
    api.listShelves.mockResolvedValue([])
    api.addShelf.mockResolvedValueOnce({ id: 1, label: 'TH1A' }).mockRejectedValueOnce(new Error('A shelf with this label already exists.'))
    render(<CategoryManagementPage />)
    await screen.findByText('No categories have been registered.')
    fireEvent.change(screen.getByLabelText('New shelf label'), { target: { value: 'TH1A' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add shelf' }))
    const saved = await screen.findByRole('status')
    expect(saved.textContent).toContain('Shelf TH1A is ready for category assignments.')
    expect(saved.getAttribute('data-tone')).toBe('success')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss alert' }))
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.change(screen.getByLabelText('New shelf label'), { target: { value: 'TH1A' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add shelf' }))
    const failed = await screen.findByRole('alert')
    expect(failed.textContent).toContain('A shelf with this label already exists.')
    expect(failed.getAttribute('data-tone')).toBe('error')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the canonical category details and keeps assigned categories out of direct delete', async () => {
    api.list.mockResolvedValue([{ categoryId: 7, categoryName: 'Programming', description: 'Software development books', shelfLocation: 'Shelf A', shelfColumn: 1, shelfRow: 2, totalBooksCount: 3, totalThesisCount: 0, createdAt: '2026-09-25T00:00:00.000Z', updatedAt: null }])
    api.listShelves.mockResolvedValue([{ id: 1, label: 'Shelf A', columnCount: 3, rowCount: 5 }])
    render(<CategoryManagementPage />)
    expect(await screen.findByText('Software development books')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('Shelf A', { selector: 'span' })).toBeTruthy()
    expect(screen.getByText('Column 1 \u00b7 Row 2')).toBeTruthy()
    expect(screen.getByText('Sep 25, 2026')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Book copies' })).toBeTruthy()
    expect((screen.getByRole('button', { name: /Cannot delete category/i }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Programming' }))
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Software development books')
  })

  it('finds subjects online and opens a new category with the subject name', async () => {
    api.list.mockResolvedValue([{ categoryId: 7, categoryName: 'Computer programming', description: '', shelfLocation: 'Shelf A', shelfColumn: 1, shelfRow: 1, totalBooksCount: 0, totalThesisCount: 0, createdAt: '2026-09-25T00:00:00Z', updatedAt: null }])
    api.listShelves.mockResolvedValue([{ id: 1, label: 'Shelf A', columnCount: 3, rowCount: 5 }])
    catalog.searchSubjects.mockResolvedValue({ subjects: [{ name: 'Computer programming', workCount: 6386 }, { name: 'Object-oriented programming', workCount: 1967 }] })
    render(<CategoryManagementPage />)
    await screen.findAllByText('Computer programming')
    fireEvent.change(screen.getByLabelText('Subject to search'), { target: { value: 'programming' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search subjects' }))
    expect(await screen.findByText('Already a category')).toBeTruthy()
    expect(catalog.searchSubjects).toHaveBeenCalledWith('programming')
    fireEvent.click(screen.getByRole('button', { name: 'Create category Object-oriented programming' }))
    expect((await screen.findByLabelText(/Category name \*/i) as HTMLInputElement).value).toBe('Object-oriented programming')
  })
})

it('sorts every offered column numerically or naturally in both directions without changing the source data', async () => {
  const base = { description: '', shelfColumn: 1, shelfRow: 1, updatedAt: null }
  const rows = [
    { ...base, categoryId: 10, categoryName: 'Category 10', shelfLocation: 'Shelf 2', totalBooksCount: 2, totalThesisCount: 10, createdAt: '2026-01-01T00:00:00Z' },
    { ...base, categoryId: 2, categoryName: 'Category 2', shelfLocation: 'Shelf 10', totalBooksCount: 10, totalThesisCount: 0, createdAt: '2026-11-01T00:00:00Z' },
    { ...base, categoryId: 1, categoryName: 'Alpha', shelfLocation: 'Shelf 1', totalBooksCount: 0, totalThesisCount: 2, createdAt: '2026-05-01T00:00:00Z' },
  ]
  api.list.mockResolvedValue(rows)
  api.listShelves.mockResolvedValue([])
  render(<CategoryManagementPage />)
  await screen.findByText('Category 10')
  const ids = () => within(screen.getByRole('region', { name: 'Classification directory' })).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[0].textContent)
  const orders = [
    ['categoryId', ['1', '2', '10']], ['categoryName', ['1', '2', '10']],
    ['shelfLocation', ['1', '10', '2']], ['totalBooksCount', ['1', '10', '2']],
    ['totalThesisCount', ['2', '1', '10']], ['createdAt', ['10', '1', '2']],
  ] as const
  for (const [field, expected] of orders) {
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: field } })
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'asc' } })
    expect(ids()).toEqual(expected)
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'desc' } })
    expect(ids()).toEqual([...expected].reverse())
  }
  expect(rows.map(row => row.categoryId)).toEqual([10, 2, 1])
  expect(api.list).toHaveBeenCalledTimes(1)
  expect(api.update).not.toHaveBeenCalled()
})

it('keeps unknown dates last and breaks tied dates consistently by ID', async () => {
  const base = { categoryName: 'Example', description: '', shelfLocation: 'Shelf A', shelfColumn: 1, shelfRow: 1, totalBooksCount: 0, totalThesisCount: 0, updatedAt: null }
  api.list.mockResolvedValue([{ ...base, categoryId: 3, createdAt: 'unknown' }, { ...base, categoryId: 2, createdAt: '2026-01-01' }, { ...base, categoryId: 1, createdAt: '2026-01-01' }])
  api.listShelves.mockResolvedValue([])
  render(<CategoryManagementPage />)
  await screen.findByText('Unknown')
  fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'createdAt' } })
  const ids = () => within(screen.getByRole('region', { name: 'Classification directory' })).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[0].textContent)
  expect(ids()).toEqual(['1', '2', '3'])
  fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'desc' } })
  expect(ids()).toEqual(['1', '2', '3'])
})
