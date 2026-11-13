import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddMultipleCopiesModal } from './AddMultipleCopiesModal'
import { PREDICTION_DELAY_MS } from './usePredictions'

const api = vi.hoisted(() => ({ createBulkBook: vi.fn(), lookupIsbn: vi.fn(), searchTitles: vi.fn(), fetchCover: vi.fn(async () => null), predict: vi.fn() }))
vi.mock('./catalog-api', () => ({ catalogApi: api, ApiError: class extends Error {} }))
vi.mock('./BookLabelSheet', () => ({ BookLabelSheet: () => null }))

const categories = [{ categoryId: 1, categoryName: 'Programming', shelfLocation: 'Cabinet 4-B' }]
const options = (id: string) => [...screen.getByTestId(id).querySelectorAll('option')].map((option) => option.getAttribute('value'))
const pause = async () => { await act(async () => { vi.advanceTimersByTime(PREDICTION_DELAY_MS); await Promise.resolve(); await Promise.resolve() }) }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); cleanup(); vi.clearAllMocks() })

describe('search predictions', () => {
  it('suggests titles and authors once typing pauses, with one request per pause', async () => {
    api.predict.mockImplementation(async (field: string) => ({ suggestions: field === 'title' ? ['Clean Code', 'Clean Coaching'] : ['Robert Martin'] }))
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    const title = screen.getByLabelText(/Title \*/i)
    expect(title.getAttribute('list')).toBe('title-predictions')
    fireEvent.change(title, { target: { value: 'Clean c' } })
    fireEvent.change(title, { target: { value: 'Clean co' } })
    await pause()
    expect(api.predict).toHaveBeenCalledTimes(1)
    expect(api.predict).toHaveBeenCalledWith('title', 'Clean co', expect.any(AbortSignal))
    expect(options('title-predictions')).toEqual(['Clean Code', 'Clean Coaching'])
    fireEvent.change(screen.getByLabelText(/Author \*/i), { target: { value: 'robert mart' } })
    await pause()
    expect(options('author-predictions')).toEqual(['Robert Martin'])
  })

  it('asks nothing for fewer than 3 letters and shows nothing on failure', async () => {
    api.predict.mockRejectedValue(new Error('offline'))
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText(/Title \*/i), { target: { value: 'ab' } })
    await pause()
    expect(api.predict).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/Title \*/i), { target: { value: 'abc' } })
    await pause()
    expect(api.predict).toHaveBeenCalledTimes(1)
    expect(options('title-predictions')).toEqual([])
  })
})
