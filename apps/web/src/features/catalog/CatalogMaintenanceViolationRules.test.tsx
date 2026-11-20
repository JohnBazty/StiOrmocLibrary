import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CatalogMaintenancePage } from './CatalogMaintenancePage'

vi.mock('./enhanced-catalog-api', () => ({ enhancedCatalog: { options: vi.fn(async () => ({ types: [], locations: [], programs: [], courses: [], categories: [] })) } }))
vi.mock('../shelves/ShelfManagement', () => ({ ShelfManagementPage: () => <p>Shelf settings remain available</p> }))
vi.mock('../fines/ViolationRulesPanel', () => ({ ViolationRulesPanel: () => <p>Violation rules table</p> }))
vi.mock('../fines/UrgentAlertRules', () => ({ UrgentAlertRules: () => <p>Urgent alert rules form</p> }))
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/') })

it('offers Violation rules beside Fine rules, with the urgent alert rules moved in', () => {
  render(<MemoryRouter initialEntries={['/librarian/maintenance?tab=violation-rules']}><CatalogMaintenancePage /></MemoryRouter>)
  const navigation = screen.getByRole('navigation', { name: 'Library setup sections' })
  const labels = within(navigation).getAllByRole('button').map(button => button.textContent ?? '')
  expect(labels.findIndex(text => text.includes('Violation rules'))).toBe(labels.findIndex(text => text.includes('Fine rules')) + 1)
  expect(screen.getByText('Violation rules table')).toBeTruthy()
  expect(screen.getByText('Urgent alert rules form')).toBeTruthy()
})
