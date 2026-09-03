import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CategoryFilterSearchBar } from './CategoryFilterSearchBar'

const api = vi.hoisted(() => ({ fetchBookCategories: vi.fn() }))
vi.mock('./book-catalog-api', () => api)

describe('CategoryFilterSearchBar', () => {
  it('renders exact database categories and passes the selected ID to its parent', async () => {
    api.fetchBookCategories.mockResolvedValue([
      { categoryId: 7, categoryName: 'Artificial Intelligence' },
      { categoryId: 11, categoryName: 'Cybersecurity' },
    ])
    const onCategoryChange = vi.fn()
    const onQueryChange = vi.fn()

    render(<CategoryFilterSearchBar query="" selectedCategoryId={null} onQueryChange={onQueryChange} onCategoryChange={onCategoryChange} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cybersecurity' }))
    expect(onCategoryChange).toHaveBeenCalledWith(11)

    fireEvent.change(screen.getByRole('textbox', { name: 'Search books' }), { target: { value: 'network' } })
    expect(onQueryChange).toHaveBeenCalledWith('network')
  })

  it('marks the active database category pill', async () => {
    api.fetchBookCategories.mockResolvedValue([{ categoryId: 7, categoryName: 'Artificial Intelligence' }])
    render(<CategoryFilterSearchBar query="" selectedCategoryId={7} onQueryChange={() => undefined} onCategoryChange={() => undefined} />)
    expect(await screen.findByRole('button', { name: 'Artificial Intelligence', pressed: true })).toBeTruthy()
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
