import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ShelfSuggestionsDialog } from './ShelfSuggestionsDialog'

const api = vi.hoisted(() => ({ shelfSuggestions: vi.fn(), saveShelfDdcRange: vi.fn() }))
vi.mock('../categories/category-api', () => ({ categoryApi: api }))
const moved = vi.hoisted(() => ({ props: null as null | { copies: Array<{ id: number }>; initialPlacement?: { shelfLocation: string } } }))
vi.mock('./MoveCopiesDialog', () => ({ MoveCopiesDialog: (props: typeof moved.props & { onMoved: () => Promise<void> }) => { moved.props = props; return <div role="dialog" aria-label="Move copies"><button onClick={() => void props!.onMoved()}>Finish move</button></div> } }))

const copy = (id: number, over: Record<string, unknown> = {}) => ({ physicalCopyId: id, accession: `A-${id}`, title: `Book ${id}`, callNumber: '005.1 MAR', ddcCode: '005.1', category: 'Programming', currentShelf: 'Shelf B', shelfColumn: 1, shelfRow: 1, reason: 'category', ...over })
const data = { shelf: { locationId: 1, name: 'Shelf A', ddcFrom: null, ddcTo: null }, suggestions: [copy(2), copy(3, { currentShelf: null, reason: 'ddc', ddcCode: '005.133' })], onShelf: [copy(1, { currentShelf: 'Shelf A' })] }
beforeEach(() => { moved.props = null; api.shelfSuggestions.mockResolvedValue(data) })
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('lists books that belong on the shelf with why, then moves the selected ones to this shelf', async () => {
  render(<ShelfSuggestionsDialog shelfId={1} onClose={() => {}} onChanged={async () => {}} />)
  const suggested = await screen.findByRole('region', { name: 'Suggested books' })
  expect(within(suggested).getByText(/Now: Unassigned/)).toBeTruthy()
  expect(within(suggested).getByText(/Category/)).toBeTruthy()
  expect(within(suggested).getByText(/DDC range/)).toBeTruthy()
  expect(within(screen.getByRole('region', { name: 'On this shelf, in call-number order' })).getByText('Book 1')).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Book 3 (A-3)' }))
  fireEvent.click(screen.getByRole('button', { name: 'Move 1 selected to Shelf A' }))
  expect(moved.props!.copies.map(c => c.id)).toEqual([3])
  expect(moved.props!.initialPlacement!.shelfLocation).toBe('Shelf A')
  fireEvent.click(screen.getByRole('button', { name: 'Finish move' }))
  await waitFor(() => expect(api.shelfSuggestions).toHaveBeenCalledTimes(2))
})

it('selects every suggestion at once and saves a DDC range that refreshes the list', async () => {
  api.saveShelfDdcRange.mockResolvedValue({ ...data.shelf, ddcFrom: '004.000', ddcTo: '005.999' })
  render(<ShelfSuggestionsDialog shelfId={1} onClose={() => {}} onChanged={async () => {}} />)
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select all suggested books' }))
  expect(screen.getByRole('button', { name: 'Move 2 selected to Shelf A' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('First DDC number'), { target: { value: '004' } })
  fireEvent.change(screen.getByLabelText('Last DDC number'), { target: { value: '005.999' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save DDC range' }))
  await waitFor(() => expect(api.saveShelfDdcRange).toHaveBeenCalledWith(1, { ddcFrom: '004', ddcTo: '005.999' }))
  await waitFor(() => expect(api.shelfSuggestions).toHaveBeenCalledTimes(2))
})
