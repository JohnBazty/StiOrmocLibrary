import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import { AdminSidebarNavigation } from './AdminSidebarNavigation'

afterEach(cleanup)

it('makes the catalog and accession register distinct destinations and names all reports accurately', () => {
  render(<MemoryRouter initialEntries={['/librarian/catalog']}><AdminSidebarNavigation onNavigate={() => undefined} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Catalog' }).getAttribute('href')).toBe('/librarian/catalog')
  expect(screen.getByRole('link', { name: 'Accession register' }).getAttribute('href')).toBe('/librarian/book-register')
  expect(screen.getByRole('link', { name: 'Reports' }).getAttribute('href')).toBe('/librarian/reports')
  expect(screen.queryByRole('link', { name: 'Book Reports' })).toBeNull()
})
