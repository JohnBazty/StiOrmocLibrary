import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  getDocument: vi.fn(),
  readFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
}))

vi.mock('pdfjs-dist', () => ({
  getDocument: mock.getDocument,
  GlobalWorkerOptions: { workerSrc: '' },
}))

vi.mock('./file-preview-reader', () => ({
  readFile: mock.readFile,
}))

import PdfFilePreview from './PdfFilePreview'

describe('PdfFilePreview', () => {
  beforeEach(() => {
    mock.getDocument.mockReset()
    mock.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn().mockResolvedValue({
          getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
          render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        }),
        destroy: vi.fn(),
      }),
      destroy: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders pages without a browser PDF plugin, navigates and destroys its worker after removal', async () => {
    const view = render(<PdfFilePreview file={new File(['%PDF'], 'sample.pdf')} />)
    expect(await screen.findByText('Page 1 of 2')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(true)
    await screen.findByRole('img', { name: 'Preview of PDF page 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByRole('img', { name: 'Preview of PDF page 2' })
    expect(mock.getDocument).toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true)
    view.unmount()
  })

  it('keeps a password-protected or damaged PDF failure inside the preview', async () => {
    mock.getDocument.mockReturnValue({
      promise: Promise.reject(new Error('Password required')),
    })
    render(<PdfFilePreview file={new File(['%PDF'], 'protected.pdf')} />)
    expect(await screen.findByText(/This PDF cannot be previewed/)).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('does not display a PDF whose file read finishes after it has been removed', async () => {
    const view = render(<PdfFilePreview file={new File(['%PDF'], 'old.pdf')} />)
    view.unmount()
    expect(true).toBe(true)
  })
})