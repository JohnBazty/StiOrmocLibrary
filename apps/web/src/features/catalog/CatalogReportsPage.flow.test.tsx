import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogReportsPage } from './CatalogReportsPage'
import { collectionReviewApi } from './collection-review-api'
import { dashboardApi } from '../dashboard/dashboard-api'

vi.mock('./OperationalReports', () => ({ OperationalReports: () => <h2>Operational report content</h2> }))
vi.mock('../dashboard/dashboard-api', () => ({ dashboardApi: { downloadAdminSummary: vi.fn() } }))
vi.mock('./collection-review-api', () => ({ collectionReviewApi: { download: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

function CurrentQuery() { return <output aria-label="Current query">{useLocation().search}</output> }

it('shows one report family at a time and retains all report families', () => {
  render(<MemoryRouter><CatalogReportsPage /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Operational report content' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Current operational dashboard summary' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard summary' }))
  expect(screen.getByRole('heading', { name: 'Current operational dashboard summary' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Operational report content' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Collection review' }))
  expect(screen.getByRole('heading', { name: 'Book collection review reports' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Review collection and approved requirements' })).toBeTruthy()
})

it('opens a report family directly from a deep link', () => {
  render(<MemoryRouter initialEntries={['/librarian/reports?section=collection']}><CatalogReportsPage /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Book collection review reports' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Operational report content' })).toBeNull()
})

it('keeps applied report filters while switching report families', () => {
  render(<MemoryRouter initialEntries={['/librarian/reports?kind=attendance&q=fixture&period=custom']}><CatalogReportsPage /><CurrentQuery /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard summary' }))
  expect(screen.getByLabelText('Current query').textContent).toContain('kind=attendance')
  fireEvent.click(screen.getByRole('button', { name: 'Operational reports' }))
  expect(screen.getByLabelText('Current query').textContent).toContain('q=fixture')
  expect(screen.getByLabelText('Current query').textContent).not.toContain('section=')
})

it('exports only the selected report scope through its labelled export menu', async () => {
  render(<MemoryRouter initialEntries={['/librarian/reports?section=collection']}><CatalogReportsPage /></MemoryRouter>)
  fireEvent.click(screen.getByText('Export updated collection'))
  fireEvent.click(screen.getByRole('button', { name: 'Updated collection PDF' }))
  await waitFor(() => expect(collectionReviewApi.download).toHaveBeenCalledWith('updated', 'pdf'))
  expect(dashboardApi.downloadAdminSummary).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard summary' }))
  fireEvent.click(screen.getByText('Export dashboard summary'))
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard summary PDF' }))
  await waitFor(() => expect(dashboardApi.downloadAdminSummary).toHaveBeenCalledTimes(1))
})
