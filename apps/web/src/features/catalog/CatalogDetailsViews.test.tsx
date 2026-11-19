import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDetailsPanel } from './CatalogDetailsPanel'
import { confirmLeave } from '../../components/UnsavedChanges'

const api = vi.hoisted(() => ({ detail: vi.fn(), options: vi.fn(), saveDetails: vi.fn(), digital: vi.fn() }))
vi.mock('./enhanced-catalog-api', () => ({ enhancedCatalog: api }))
vi.mock('../../components/SelectedFilePreview', () => ({ SelectedFilePreview: () => null }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it.each(['files', 'all'] as const)('protects a selected digital file in %s during navigation without saving unrelated metadata', async view => {
  api.detail.mockResolvedValue({ id: 1, title: 'Example', version: 1, programs: [], courses: [], files: [], copies: [], kind: 'Book' })
  api.options.mockResolvedValue({ programs: [], courses: [], types: [] })
  const leave = vi.fn()
  render(<><button onClick={() => confirmLeave(leave)}>Another title tab</button><CatalogDetailsPanel titleId={1} editable view={view} /></>)
  const picker = await screen.findByLabelText('Digital book PDF')
  fireEvent.change(picker, { target: { files: [new File(['example'], 'example.pdf', { type: 'application/pdf' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Another title tab' }))
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  expect(leave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect((await screen.findByRole('alert')).textContent).toContain('permission')
  expect(api.saveDetails).not.toHaveBeenCalled()
  expect(api.digital).not.toHaveBeenCalled()
})
