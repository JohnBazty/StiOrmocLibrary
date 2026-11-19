import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { CatalogTitleDetails } from './CatalogTitleDetails'
import type { CatalogItem } from './types'

vi.mock('./CatalogDetailsPanel', () => ({ CatalogDetailsPanel: ({ view }: { view?: string }) => <p>Selected title panel: {view}</p> }))
afterEach(cleanup)
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})
const item = { titleId: 12, title: 'Example book', recordType: 'Book', authors: ['Example author'], isbn: '9780141439518', publicationYear: 2020, availability: 'Available' } as CatalogItem

it('keeps title context across metadata, files, copies and historical links', () => {
  render(<CatalogTitleDetails item={item} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Copies & location' }))
  expect(screen.getByRole('link', { name: 'Open copy inventory' }).getAttribute('href')).toBe('/librarian/inventory?q=Example%20book')
  fireEvent.click(screen.getByRole('button', { name: 'Catalog details' }))
  expect(screen.getByText('Selected title panel: metadata')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Files & cover' }))
  expect(screen.getByText('Selected title panel: files')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'History' }))
  expect(screen.getByRole('link', { name: 'Open borrowing report' }).getAttribute('href')).toContain('q=Example%20book')
})
