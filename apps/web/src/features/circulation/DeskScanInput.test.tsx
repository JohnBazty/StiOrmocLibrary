import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DeskScanInput } from './DeskScanInput'
const decode = vi.hoisted(() => vi.fn(async () => 'sample-code'))
vi.mock('html5-qrcode', () => ({ Html5QrcodeSupportedFormats: { QR_CODE: 0 }, Html5Qrcode: class { isScanning = false; clear() {} scanFile = decode } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('waits for image review before reading a code or looking up a borrower', async () => {
  const onScan = vi.fn()
  render(<DeskScanInput label="Borrower QR" value="" onChange={() => undefined} onScan={onScan} disabled={false} qr />)
  const input = screen.getByLabelText('Upload code image')
  fireEvent.change(input, { target: { files: [new File(['qr'], 'borrower.png', { type: 'image/png' })] } })
  expect(screen.getByText('borrower.png')).toBeTruthy()
  expect(decode).not.toHaveBeenCalled(); expect(onScan).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Read code from image' }))
  await waitFor(() => expect(onScan).toHaveBeenCalledWith('sample-code'))
  expect(decode).toHaveBeenCalledOnce()
})
