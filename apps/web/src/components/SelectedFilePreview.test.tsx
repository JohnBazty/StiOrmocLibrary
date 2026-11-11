import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SelectedFilePreview } from './SelectedFilePreview'
const reader = vi.hoisted(() => ({ officePreview: vi.fn() }))
vi.mock('./file-preview-reader', () => reader)
vi.mock('./PdfFilePreview', () => ({ default: ({ file }: { file: File }) => <div aria-label={`PDF preview: ${file.name}`}>Rendered PDF page</div> }))
beforeEach(() => {
  let sequence = 0
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => `blob:preview-${++sequence}`) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
it.each(['pdf', 'docx'])('shows only a %s file icon and details in compact mode without reading document contents', extension => {
  const remove = vi.fn()
  render(<SelectedFilePreview file={new File(['document'], `selected.${extension}`)} onRemove={remove} display="icon" />)
  expect(screen.getByRole('img', { name: `${extension.toUpperCase()} file` })).toBeTruthy()
  expect(screen.getByText(`selected.${extension}`)).toBeTruthy()
  expect(screen.getByText('8 bytes')).toBeTruthy()
  expect(screen.queryByText(/Preparing|Word preview|Rendered PDF page/)).toBeNull()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(reader.officePreview).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected file' }))
  expect(remove).toHaveBeenCalledOnce()
})
it('shows the filename and size, replaces previews, and releases both temporary image URLs', () => {
  const remove = vi.fn(), first = new File(['first'], 'cover.png', { type: 'image/png' }), second = new File(['second'], 'other.png', { type: 'image/png' })
  const view = render(<SelectedFilePreview file={first} onRemove={remove} />)
  expect(screen.getByAltText('Preview of cover.png').getAttribute('src')).toBe('blob:preview-1')
  expect(screen.getByText('5 bytes')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected file' })); expect(remove).toHaveBeenCalledOnce()
  view.rerender(<SelectedFilePreview file={second} onRemove={remove} />)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
  expect(screen.queryByAltText('Preview of cover.png')).toBeNull()
  view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-2')
})
it('uses a PDF blob, an accessible page renderer and an original-file link', async () => {
  render(<SelectedFilePreview file={new File(['%PDF'], 'paper.pdf', { type: '' })} onRemove={() => undefined} disabled />)
  expect(await screen.findByLabelText('PDF preview: paper.pdf')).toBeTruthy()
  expect((vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob).type).toBe('application/pdf')
  expect(screen.getByRole('link', { name: 'Open original PDF' }).getAttribute('rel')).toContain('noopener')
  expect(screen.getByRole('button', { name: 'Remove selected file' }).hasAttribute('disabled')).toBe(true)
})
it('ignores late document results after a different file is chosen, including matching filenames', async () => {
  let resolveFirst!: (value: unknown) => void
  reader.officePreview.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve })).mockResolvedValueOnce({ kind: 'document', paragraphs: ['New content'], images: [] })
  const view = render(<SelectedFilePreview file={new File(['old'], 'same.docx', { lastModified: 1 })} onRemove={() => undefined} />)
  await waitFor(() => expect(reader.officePreview).toHaveBeenCalledOnce())
  view.rerender(<SelectedFilePreview file={new File(['new'], 'same.docx', { lastModified: 1 })} onRemove={() => undefined} />)
  await screen.findByText('New content')
  resolveFirst({ kind: 'document', paragraphs: ['Old content'], images: [] })
  await waitFor(() => expect(screen.queryByText('Old content')).toBeNull())
})
it('keeps the selected filename and remove control available when document reading fails', async () => {
  reader.officePreview.mockRejectedValueOnce(new Error('Invalid archive'))
  render(<SelectedFilePreview file={new File(['bad'], 'damaged.xlsx')} onRemove={() => undefined} />)
  expect(await screen.findByText(/Preview unavailable/)).toBeTruthy()
  expect(screen.getByText('damaged.xlsx')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove selected file' }).hasAttribute('disabled')).toBe(false)
})
