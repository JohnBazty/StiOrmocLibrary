import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateCategoryModal } from './CreateCategoryModal'

describe('CreateCategoryModal', () => {
  const category = { categoryId: 7, categoryName: 'Programming', description: 'Software development books', shelfLocation: 'Shelf A', shelfColumn: 3, shelfRow: 5, totalBooksCount: 3, totalThesisCount: 1, createdAt: '2026-09-25T00:00:00Z', updatedAt: null }

  it('resets positions to valid defaults when choosing a smaller shelf', () => {
    render(<CreateCategoryModal category={category} shelves={[{ id: 1, label: 'Shelf A', columnCount: 3, rowCount: 5 }, { id: 2, label: 'Shelf B', columnCount: 1, rowCount: 2 }]} saving={false} errors={{ shelfRow: 'Choose a valid row.' }} onSubmit={vi.fn()} onClose={vi.fn()} />)
    expect((screen.getByLabelText(/Column \*/i) as HTMLSelectElement).value).toBe('3')
    expect((screen.getByLabelText(/Row \*/i) as HTMLSelectElement).value).toBe('5')
    expect(screen.getByText('Choose a valid row.')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: /Shelf location/i }), { target: { value: 'Shelf B' } })
    const column = screen.getByLabelText(/Column \*/i) as HTMLSelectElement
    const row = screen.getByLabelText(/Row \*/i) as HTMLSelectElement
    expect(column.value).toBe('1')
    expect(row.value).toBe('1')
    expect(column.options.length).toBe(1)
    expect(row.options.length).toBe(2)
  })

  it('requires a managed shelf when the current location is unavailable', () => {
    render(<CreateCategoryModal category={category} shelves={[]} saving={false} errors={{}} onSubmit={vi.fn()} onClose={vi.fn()} />)
    expect((screen.getByRole('button', { name: 'Save category' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Add a shelf in Maintenance → Locations first.')).toBeTruthy()
    expect((screen.getByRole('combobox', { name: /Shelf location/i }) as HTMLSelectElement).value).toBe('')
  })

  it('submits a shelf selected from the Floor Plan shelf list', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    render(<CreateCategoryModal category={null} shelves={[{ id: 4, label: 'Cabinet 4-B / West Wing', columnCount: 3, rowCount: 5 }]} saving={false} errors={{}} onSubmit={submit} onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText(/Category name/i), { target: { value: 'Programming' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Computer programming books' } })
    fireEvent.change(screen.getByRole('combobox', { name: /Shelf location/i }), { target: { value: 'Cabinet 4-B / West Wing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save category' }))
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ categoryName: 'Programming', description: 'Computer programming books', shelfLocation: 'Cabinet 4-B / West Wing', shelfColumn: 1, shelfRow: 1 }))
  })
})

afterEach(cleanup)
