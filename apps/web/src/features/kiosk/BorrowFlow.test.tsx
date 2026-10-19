import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BorrowFlow } from './BorrowFlow'
import { deskCirculationApi } from '../circulation/desk-circulation-api'
import { kioskSessionAlive } from './kiosk-session'

vi.mock('./kiosk-session', async importOriginal => ({
  ...(await importOriginal<typeof import('./kiosk-session')>()),
  kioskSessionAlive: vi.fn(async () => true),
}))

vi.mock('../circulation/desk-circulation-api', () => ({
  deskCirculationApi: { borrower: vi.fn(), preview: vi.fn(), checkout: vi.fn() },
}))
// One-shot like the real scanner: it emits a single code per mount.
vi.mock('./KioskScanner', async () => {
  const { useRef } = await import('react')
  return {
    KioskScanner: ({ qr, onScan }: { qr?: boolean; onScan: (v: string) => void }) => {
      const done = useRef(false)
      return <button onClick={() => { if (done.current) return; done.current = true; onScan(qr ? 'QR1' : 'BC1') }}>{qr ? 'scan-qr' : 'scan-barcode'}</button>
    },
  }
})

afterEach(() => { vi.clearAllMocks(); cleanup() })

it('borrows a book: QR -> borrower -> barcode -> preview -> checkout', async () => {
  vi.mocked(deskCirculationApi.borrower).mockResolvedValue({ user: { name: 'Juan' }, eligible: true, blockers: [] } as never)
  vi.mocked(deskCirculationApi.preview).mockResolvedValue({ copy: { id: 1, title: 'Clean Code', barcode: 'BC1', condition: 'Good' }, eligible: true, blockers: [] } as never)
  vi.mocked(deskCirculationApi.checkout).mockResolvedValue({ title: 'Clean Code', dueAt: '2026-11-01' } as never)
  render(<BorrowFlow lang="en" onDone={() => {}} onSessionLost={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan-qr' }))
  expect(await screen.findByText('Juan')).toBeTruthy()
  fireEvent.click(await screen.findByRole('button', { name: 'scan-barcode' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm borrow' }))

  expect(await screen.findByText('Borrowed: Clean Code')).toBeTruthy()
  expect(screen.getByText('Due: 2026-11-01')).toBeTruthy()
  expect(deskCirculationApi.borrower).toHaveBeenCalledWith('QR1', 'TakeHome')
  expect(deskCirculationApi.preview).toHaveBeenCalledWith('QR1', 'BC1', 'TakeHome', undefined)
  expect(deskCirculationApi.checkout).toHaveBeenCalledWith('QR1', 'BC1', 'TakeHome', expect.stringMatching(/^[A-Za-z0-9_-]{16,64}$/), undefined)
  expect(screen.queryByRole('img')).toBeNull()
})

it('stops and shows the borrower blockers when not eligible', async () => {
  vi.mocked(deskCirculationApi.borrower).mockResolvedValue({ user: { name: 'Juan' }, eligible: false, blockers: ['Outstanding fine of PHP 50.'] } as never)
  render(<BorrowFlow lang="en" onDone={() => {}} onSessionLost={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan-qr' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Outstanding fine of PHP 50.')
  expect(deskCirculationApi.preview).not.toHaveBeenCalled()
})

it('gives the student a fresh scanner after a failed book scan', async () => {
  vi.mocked(deskCirculationApi.borrower).mockResolvedValue({ user: { name: 'Juan' }, eligible: true, blockers: [] } as never)
  vi.mocked(deskCirculationApi.preview)
    .mockRejectedValueOnce(new Error('No physical copy matches this barcode.'))
    .mockResolvedValueOnce({ copy: { id: 1, title: 'Clean Code', barcode: 'BC1', condition: 'Good' }, eligible: true, blockers: [] } as never)
  render(<BorrowFlow lang="en" onDone={() => {}} onSessionLost={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan-qr' }))
  fireEvent.click(await screen.findByRole('button', { name: 'scan-barcode' }))
  expect((await screen.findByRole('alert')).textContent).toBe('No physical copy matches this barcode.')

  fireEvent.click(screen.getByRole('button', { name: 'scan-barcode' }))
  expect(await screen.findByRole('button', { name: 'Confirm borrow' })).toBeTruthy()
  expect(deskCirculationApi.preview).toHaveBeenCalledTimes(2)
})

it('hands off to sign-in when the desk session is gone during a borrow', async () => {
  vi.mocked(deskCirculationApi.borrower).mockRejectedValueOnce(new Error('Your session expired after 10 minutes of inactivity. Sign in again.'))
  vi.mocked(kioskSessionAlive).mockResolvedValueOnce(false)
  const onSessionLost = vi.fn()
  render(<BorrowFlow lang="en" onDone={() => {}} onSessionLost={onSessionLost} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan-qr' }))
  await waitFor(() => expect(onSessionLost).toHaveBeenCalled())
  expect(screen.queryByRole('alert')).toBeNull()
})

const ready = { reservationId: 7, title: 'Clean Code', statusLabel: 'Ready for pickup', barcode: 'BC1', shelfLocation: 'Shelf 2B', pickupDeadline: null }
const waiting = { reservationId: 8, title: 'Waiting Book', statusLabel: 'Waiting for a copy', barcode: null, shelfLocation: null, pickupDeadline: null }

it('offers books ready for pickup and checks out the chosen reservation, with the student photo', async () => {
  vi.mocked(deskCirculationApi.borrower).mockResolvedValue({ user: { name: 'Juan', photoUrl: 'https://example.test/juan.jpg' }, eligible: true, blockers: [], requests: [ready, waiting] } as never)
  vi.mocked(deskCirculationApi.preview).mockResolvedValue({ copy: { id: 1, title: 'Clean Code', barcode: 'BC1', condition: 'Good' }, eligible: true, blockers: [] } as never)
  vi.mocked(deskCirculationApi.checkout).mockResolvedValue({ title: 'Clean Code', dueAt: '2026-11-01' } as never)
  render(<BorrowFlow lang="en" onDone={() => {}} onSessionLost={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan-qr' }))
  expect(await screen.findByRole('heading', { name: 'Books ready for you' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Waiting Book/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Clean Code/ }))

  expect(screen.getByText('Shelf 2B')).toBeTruthy()
  fireEvent.click(await screen.findByRole('button', { name: 'scan-barcode' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm borrow' }))
  expect(screen.getByRole('img', { name: 'Juan' }).getAttribute('src')).toBe('https://example.test/juan.jpg')

  expect(await screen.findByText('Borrowed: Clean Code')).toBeTruthy()
  expect(deskCirculationApi.preview).toHaveBeenCalledWith('QR1', 'BC1', 'TakeHome', 7)
  expect(deskCirculationApi.checkout).toHaveBeenCalledWith('QR1', 'BC1', 'TakeHome', expect.stringMatching(/^[A-Za-z0-9_-]{16,64}$/), 7)
})

it('shows the mismatch message and lets the student rescan the reserved copy', async () => {
  vi.mocked(deskCirculationApi.borrower).mockResolvedValue({ user: { name: 'Juan' }, eligible: true, blockers: [], requests: [ready] } as never)
  vi.mocked(deskCirculationApi.preview)
    .mockRejectedValueOnce(new Error('This barcode does not match the selected book request. Scan its assigned copy.'))
    .mockResolvedValueOnce({ copy: { id: 1, title: 'Clean Code', barcode: 'BC1', condition: 'Good' }, eligible: true, blockers: [] } as never)
  render(<BorrowFlow lang="en" onDone={() => {}} onSessionLost={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan-qr' }))
  fireEvent.click(await screen.findByRole('button', { name: /Clean Code/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'scan-barcode' }))
  expect((await screen.findByRole('alert')).textContent).toBe('This barcode does not match the selected book request. Scan its assigned copy.')

  fireEvent.click(screen.getByRole('button', { name: 'scan-barcode' }))
  expect(await screen.findByRole('button', { name: 'Confirm borrow' })).toBeTruthy()
  expect(deskCirculationApi.preview).toHaveBeenLastCalledWith('QR1', 'BC1', 'TakeHome', 7)
})

it('lets a student with a reservation borrow a different book instead', async () => {
  vi.mocked(deskCirculationApi.borrower).mockResolvedValue({ user: { name: 'Juan' }, eligible: true, blockers: [], requests: [ready] } as never)
  vi.mocked(deskCirculationApi.preview).mockResolvedValue({ copy: { id: 2, title: 'Other', barcode: 'BC1', condition: 'Good' }, eligible: true, blockers: [] } as never)
  render(<BorrowFlow lang="en" onDone={() => {}} onSessionLost={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan-qr' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Borrow a different book' }))
  fireEvent.click(await screen.findByRole('button', { name: 'scan-barcode' }))
  expect(await screen.findByRole('button', { name: 'Confirm borrow' })).toBeTruthy()
  expect(deskCirculationApi.preview).toHaveBeenCalledWith('QR1', 'BC1', 'TakeHome', undefined)
})

it('hides a photo that fails to load instead of showing a broken image', async () => {
  vi.mocked(deskCirculationApi.borrower).mockResolvedValue({ user: { name: 'Juan', photoUrl: 'https://example.test/expired.jpg' }, eligible: true, blockers: [] } as never)
  render(<BorrowFlow lang="en" onDone={() => {}} onSessionLost={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan-qr' }))
  fireEvent.error(await screen.findByRole('img', { name: 'Juan' }))
  expect(screen.queryByRole('img', { name: 'Juan' })).toBeNull()
  expect(screen.getByText('Juan')).toBeTruthy()
})
