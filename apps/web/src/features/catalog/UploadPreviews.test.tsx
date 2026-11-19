import { MemoryRouter } from 'react-router-dom'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BookQuotationModal } from './BookQuotationModal'
import { CatalogDetailsPanel } from './CatalogDetailsPanel'
const api = vi.hoisted(() => ({ quotations: vi.fn(), uploadQuotation: vi.fn(), saveQuotation: vi.fn(), detail: vi.fn(), options: vi.fn(), digital: vi.fn() }))
vi.mock('./catalog-api', () => ({ catalogApi: api }))
vi.mock('./enhanced-catalog-api', () => ({ enhancedCatalog: api }))
vi.mock('../../components/PdfFilePreview', () => ({ default: () => <div>PDF page preview</div> }))
beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:test') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
  api.quotations.mockResolvedValue([]); api.uploadQuotation.mockResolvedValue(undefined); api.saveQuotation.mockResolvedValue(undefined)
  api.detail.mockResolvedValue({ title: 'Test book', kind: 'Book', programs: [], courses: [], synopsis: '', glossary: '', files: [] })
  api.options.mockResolvedValue({ programs: [], courses: [], types: [] })
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('records the hosted amount-only quotation without requiring a supplier file', async () => {
  render(<BookQuotationModal titleId={1} title="Test book" onClose={() => undefined} />)
  await screen.findByText('No quotation recorded for this book.')
  expect(screen.queryByLabelText('Supplier quotation file')).toBeNull()
  fireEvent.change(screen.getByLabelText('Quoted replacement amount (PHP)'), {target:{value:'125.50'}})
  fireEvent.click(screen.getByRole('button',{name:'Save quotation'}))
  await waitFor(() => expect(api.saveQuotation).toHaveBeenCalledWith(1,125.50))
  expect(api.uploadQuotation).not.toHaveBeenCalled()
})
it('previews a digital book while preserving permission confirmation and a failed file for retry', async () => {
  api.digital.mockRejectedValueOnce(new Error('Upload interrupted.'))
  render(<MemoryRouter><CatalogDetailsPanel titleId={1} editable /></MemoryRouter>)
  const input = await screen.findByLabelText('Digital book PDF')
  const file = new File(['%PDF'], 'digital-book.pdf', { type: 'application/pdf' })
  fireEvent.change(input, { target: { files: [file] } })
  await screen.findByText('PDF page preview')
  expect(api.digital).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Upload PDF' }).hasAttribute('disabled')).toBe(true)
  fireEvent.change(screen.getByLabelText('Permission basis'), { target: { value: 'Publisher permission' } })
  fireEvent.click(screen.getByLabelText('I confirm the school may distribute this file publicly.'))
  fireEvent.click(screen.getByRole('button', { name: 'Upload PDF' }))
  await screen.findByText('Upload interrupted.')
  expect(screen.getByText('digital-book.pdf')).toBeTruthy()
  expect(api.digital).toHaveBeenCalledWith(1, file, 'Publisher permission')
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected file' }))
  await waitFor(() => expect(screen.queryByText('digital-book.pdf')).toBeNull())
})
