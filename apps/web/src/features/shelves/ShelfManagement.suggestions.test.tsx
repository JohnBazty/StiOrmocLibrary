import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ShelfManagement } from './ShelfManagement'

vi.mock('./ShelfSuggestionsDialog', () => ({ ShelfSuggestionsDialog: ({ shelfId }: { shelfId: number }) => <div role="dialog" aria-label={`Suggestions for shelf ${shelfId}`} /> }))
afterEach(cleanup)
const shelves = [{ id: 4, label: 'Shelf A', columnCount: 1, rowCount: 1, defaultCapacity: 10, capacityConfigured: true, status: 'Active', version: 1, used: 0, capacity: 10, remaining: 10, compartments: [] }] as never

it('opens the books that belong on a shelf from that shelf', () => {
  render(<MemoryRouter><ShelfManagement shelves={shelves} onRefresh={async () => {}} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Suggested books for Shelf A' }))
  expect(screen.getByRole('dialog', { name: 'Suggestions for shelf 4' })).toBeTruthy()
})

it('a Manage category & shelves link opens that shelf\'s suggestions directly', () => {
  render(<MemoryRouter initialEntries={['/librarian/maintenance?tab=locations&suggestShelf=Shelf%20A']}><ShelfManagement shelves={shelves} onRefresh={async () => {}} /></MemoryRouter>)
  expect(screen.getByRole('dialog', { name: 'Suggestions for shelf 4' })).toBeTruthy()
})
