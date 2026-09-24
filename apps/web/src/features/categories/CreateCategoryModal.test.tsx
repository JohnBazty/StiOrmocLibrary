import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateCategoryModal } from './CreateCategoryModal'

describe('CreateCategoryModal', () => {
  it('submits a shelf selected from the Floor Plan shelf list', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    render(<CreateCategoryModal category={null} shelves={[{ id: 4, label: 'Cabinet 4-B / West Wing', columnCount: 3, rowCount: 5 }]} saving={false} errors={{}} onSubmit={submit} onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText(/Category name/i), { target: { value: 'Programming' } })
    fireEvent.change(screen.getByLabelText(/Shelf location/i), { target: { value: 'Cabinet 4-B / West Wing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save category' }))
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ categoryName: 'Programming', shelfLocation: 'Cabinet 4-B / West Wing', shelfColumn: 1, shelfRow: 1 }))
  })
})

afterEach(cleanup)
