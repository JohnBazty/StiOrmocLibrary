import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BookLabelSheet } from './BookLabelSheet'

const api = vi.hoisted(() => ({ downloadAssetPng: vi.fn() }))
vi.mock('./catalog-api', () => ({ catalogApi: api }))
vi.mock('./AssetCodeCanvas', () => ({
  AssetCodeCanvas: ({ testId, heading, footer }: { testId?: string; heading?: string; footer?: string }) => <canvas role="img" aria-label={heading ? `${heading} Barcode image ${footer}` : 'QR code image'} data-testid={testId} />,
  downloadCanvasPng: vi.fn(),
}))

const batch = {
  titleId: 8, createdTitle: true, numberOfCopies: 2,
  copies: [142, 143].map((sequence, index) => ({
    physicalCopyId: 20 + index, materialId: 30 + index, titleId: 8, title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', shelfLocation: 'Shelf A-1',
    accessionNumber: `STI-ACC-2026-000${sequence}`, barcode: `STIORMOC2026000${sequence}`,
    qrCodeData: `data:image/png;base64,qr${sequence}`, barcodeImageData: `data:image/svg+xml;base64,bar${sequence}`,
  })),
}

describe('BookLabelSheet', () => {
  it('renders each generated QR and barcode side by side and starts printing', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    render(<BookLabelSheet batch={batch} onClose={() => undefined} />)
    expect(screen.getAllByTestId(/label-qr-/)).toHaveLength(2)
    expect(screen.getAllByTestId(/label-barcode-/)).toHaveLength(2)
    expect(screen.getAllByRole('img', { name: /STI COLLEGE ORMOC Barcode image/ })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Download QR Code PNG' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Download Barcode PNG' })).toHaveLength(2)
    expect(screen.getByRole('img', { name: /STIORMOC2026000142/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Print labels' }))
    expect(print).toHaveBeenCalledOnce()
  })
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })
