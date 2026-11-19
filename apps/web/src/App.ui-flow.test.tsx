import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Outlet } from 'react-router-dom'
import App from './App'

vi.mock('./layouts/PortalLayout', () => ({ PortalLayout: () => <Outlet /> }))
vi.mock('./features/auth/ProtectedRoute', () => ({ ProtectedRoute: () => <Outlet /> }))
vi.mock('./features/catalog/CatalogMaintenancePage', () => ({
  CatalogMaintenancePage: () => <h1>Library settings workspace</h1>,
}))

vi.mock('./features/catalog/CatalogWorkspace', () => ({ CatalogWorkspace: () => <h1>Catalog workspace</h1> }))

afterEach(cleanup)

it('opens the canonical librarian catalog without falling through to a missing page', async () => {
  render(<MemoryRouter initialEntries={['/librarian/catalog?tool=imports']}><App /></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: 'Catalog workspace' })).toBeTruthy()
  expect(screen.queryByText('This shelf is empty.')).toBeNull()
})

it('retains the library setup route for saved configuration links', async () => {
  render(<MemoryRouter initialEntries={['/librarian/maintenance?section=locations']}><App /></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: 'Library settings workspace' })).toBeTruthy()
})
