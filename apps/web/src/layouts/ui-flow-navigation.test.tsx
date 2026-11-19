import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import { AdminSidebarNavigation } from './AdminSidebarNavigation'

afterEach(cleanup)

it('consolidates accession numbers into Catalog and names all reports accurately', () => {
  render(<MemoryRouter initialEntries={['/librarian/catalog']}><AdminSidebarNavigation onNavigate={() => undefined} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Catalog' }).getAttribute('href')).toBe('/librarian/catalog')
  expect(screen.queryByRole('link', { name: 'Accession register' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Reports' }).getAttribute('href')).toBe('/librarian/reports')
  expect(screen.queryByRole('link', { name: 'Book Reports' })).toBeNull()
})
