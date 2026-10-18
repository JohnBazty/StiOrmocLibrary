import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BorrowFlow } from './BorrowFlow'
import { deskCirculationApi } from '../circulation/desk-circulation-api'

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
  render(<BorrowFlow lang="en" onDone={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan-qr' }))
  expect(await screen.findByText('Juan')).toBeTruthy()
  fireEvent.click(await screen.findByRole('button', { name: 'scan-barcode' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm borrow' }))

  expect(await screen.findByText('Borrowed: Clean Code')).toBeTruthy()
  expect(screen.getByText('Due: 2026-11-01')).toBeTruthy()
  expect(deskCirculationApi.borrower).toHaveBeenCalledWith('QR1', 'TakeHome')
  expect(deskCirculationApi.preview).toHaveBeenCalledWith('QR1', 'BC1', 'TakeHome')
  expect(deskCirculationApi.checkout).toHaveBeenCalledWith('QR1', 'BC1', 'TakeHome', expect.stringMatching(/^[A-Za-z0-9_-]{16,64}$/))
})

it('stops and shows the borrower blockers when not eligible', async () => {
  vi.mocked(deskCirculationApi.borrower).mockResolvedValue({ user: { name: 'Juan' }, eligible: false, blockers: ['Outstanding fine of PHP 50.'] } as never)
  render(<BorrowFlow lang="en" onDone={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan-qr' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Outstanding fine of PHP 50.')
  expect(deskCirculationApi.preview).not.toHaveBeenCalled()
})

it('gives the student a fresh scanner after a failed book scan', async () => {
  vi.mocked(deskCirculationApi.borrower).mockResolvedValue({ user: { name: 'Juan' }, eligible: true, blockers: [] } as never)
  vi.mocked(deskCirculationApi.preview)
    .mockRejectedValueOnce(new Error('No physical copy matches this barcode.'))
    .mockResolvedValueOnce({ copy: { id: 1, title: 'Clean Code', barcode: 'BC1', condition: 'Good' }, eligible: true, blockers: [] } as never)
  render(<BorrowFlow lang="en" onDone={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan-qr' }))
  fireEvent.click(await screen.findByRole('button', { name: 'scan-barcode' }))
  expect((await screen.findByRole('alert')).textContent).toBe('No physical copy matches this barcode.')

  fireEvent.click(screen.getByRole('button', { name: 'scan-barcode' }))
  expect(await screen.findByRole('button', { name: 'Confirm borrow' })).toBeTruthy()
  expect(deskCirculationApi.preview).toHaveBeenCalledTimes(2)
})
