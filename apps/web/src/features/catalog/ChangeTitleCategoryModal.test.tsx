import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChangeTitleCategoryModal } from './ChangeTitleCategoryModal'
import type { CatalogItem } from './types'

const item: CatalogItem = {
  titleId: 14,
  recordType: 'Book',
  title: 'Harry Potter',
  coverImagePath: null,
  authors: ['J. K. Rowling'],
  isbn: '9780439064873',
  publicationYear: 1999,
  categoryId: 2,
  categoryName: 'Action',
  rowVersion: 3,
  shelfLocation: 'Shelf A',
  actualShelfLocations: ['Shelf A'],
  activeInventoryCount: 2,
  shelfStatus: 'Mapped',
  availability: 'Available',
  totalCopies: 2,
  availableCopies: 2,
  research: null,
}

describe('ChangeTitleCategoryModal', () => {
  it('shows the destination shelf and confirms the selected category', () => {
    const confirm = vi.fn()
    render(<ChangeTitleCategoryModal item={item} categories={[
      { categoryId: 2, categoryName: 'Action', shelfLocation: 'Shelf A' },
      { categoryId: 8, categoryName: 'Fantasy', shelfLocation: 'Shelf F' },
      { categoryId: 9, categoryName: 'Classics', shelfLocation: 'Shelf C' },
    ]} saving={false} error={null} onClose={() => undefined} onConfirm={confirm} />)

    expect(screen.getByText(/Shelf F · Column 1 · Row 1/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Move to category'), { target: { value: '9' } })
    expect(screen.getByText(/Shelf C · Column 1 · Row 1/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Change book category' })).toBeTruthy()
    expect(screen.getByText(/This moves this book and 2 active book copies/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Move book/i }))
    expect(confirm).toHaveBeenCalledWith(9)
  })
})

afterEach(cleanup)
