import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { KioskScanner } from './KioskScanner'

let lastOnSuccess: ((text: string) => void) | null = null

vi.mock('html5-qrcode', () => ({
  Html5QrcodeSupportedFormats: { QR_CODE: 0, CODE_128: 1, CODE_39: 2, EAN_13: 3, EAN_8: 4 },
  Html5Qrcode: class {
    isScanning = true
    async start(_camera: unknown, _config: unknown, onSuccess: (t: string) => void) { lastOnSuccess = onSuccess }
    async stop() { this.isScanning = false }
    async clear() {}
  },
}))

beforeEach(() => { lastOnSuccess = null })
afterEach(() => { vi.clearAllMocks(); cleanup() })

it('starts the camera and emits a decoded scan', async () => {
  const onScan = vi.fn()
  render(<KioskScanner qr label="Scan your library QR" onScan={onScan} lang="en" />)

  await waitFor(() => expect(lastOnSuccess).toBeTruthy())
  act(() => lastOnSuccess!('QR1'))
  await waitFor(() => expect(onScan).toHaveBeenCalledWith('QR1'))
})

it('falls back to manual entry', async () => {
  const onScan = vi.fn()
  render(<KioskScanner qr label="Scan your library QR" onScan={onScan} lang="en" />)
  await waitFor(() => expect(lastOnSuccess).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: 'Type the code instead' }))
  fireEvent.change(screen.getByLabelText('Enter code manually'), { target: { value: 'MANUAL-1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
  await waitFor(() => expect(onScan).toHaveBeenCalledWith('MANUAL-1'))
})
