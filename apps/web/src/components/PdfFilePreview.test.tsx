import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const pdf = vi.hoisted(() => ({ getDocument: vi.fn(), readFile: vi.fn(), getPage: vi.fn(), destroy: vi.fn(), cancel: vi.fn() }))
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: pdf.getDocument }))
vi.mock('./file-preview-reader', () => ({ readFile: pdf.readFile }))
import PdfFilePreview from './PdfFilePreview'
beforeEach(() => {
  pdf.readFile.mockResolvedValue(new ArrayBuffer(4)); pdf.destroy.mockResolvedValue(undefined)
  pdf.getPage.mockResolvedValue({ getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render: () => ({ promise: Promise.resolve(), cancel: pdf.cancel }) })
  pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage: pdf.getPage }), destroy: pdf.destroy })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('renders pages without a browser PDF plugin, navigates and destroys its worker after removal', async () => {
  const view = render(<PdfFilePreview file={new File(['%PDF'], 'sample.pdf')} />)
  expect(await screen.findByText('Page 1 of 2')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(true)
  await screen.findByRole('img', { name: 'Preview of PDF page 1' })
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await screen.findByRole('img', { name: 'Preview of PDF page 2' })
  expect(pdf.getPage).toHaveBeenCalledWith(2)
  expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true)
  view.unmount(); expect(pdf.destroy).toHaveBeenCalledOnce()
})
it('keeps a password-protected or damaged PDF failure inside the preview', async () => {
  pdf.getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error('Password required')), destroy: pdf.destroy })
  render(<PdfFilePreview file={new File(['%PDF'], 'protected.pdf')} />)
  expect(await screen.findByText(/This PDF cannot be previewed/)).toBeTruthy()
  expect(screen.queryByRole('img')).toBeNull()
})
it('does not display a PDF whose file read finishes after it has been removed', async () => {
  let finish!: (buffer: ArrayBuffer) => void
  pdf.readFile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const view = render(<PdfFilePreview file={new File(['%PDF'], 'old.pdf')} />)
  view.unmount(); finish(new ArrayBuffer(4))
  await waitFor(() => expect(pdf.getDocument).not.toHaveBeenCalled())
})
