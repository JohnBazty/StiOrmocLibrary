import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogWorkspace } from './CatalogWorkspace'

vi.mock('./CatalogManagementPage', () => ({ CatalogManagementPage: () => <p>Titles workspace</p> }))
vi.mock('./HoldingsImportPage', () => ({ HoldingsImportPage: () => <p>Import books workspace</p> }))
vi.mock('./BookCoversPage', () => ({ BookCoversPage: () => <p>Bulk book covers workspace</p> }))

afterEach(cleanup)

it('lists Titles, Import books and Bulk book covers without Enrich a book list', () => {
  render(<MemoryRouter initialEntries={['/librarian/catalog?tool=find']}><CatalogWorkspace /></MemoryRouter>)
  const nav = screen.getByRole('navigation', { name: 'Catalog tools' })
  expect(within(nav).getAllByRole('button').map(button => button.textContent)).toEqual([
    'Titles',
    'Import books',
    'Bulk book covers',
  ])
  expect(within(nav).queryByRole('button', { name: 'Enrich a book list' })).toBeNull()
  expect(screen.getByText('Titles workspace')).toBeTruthy()
})
