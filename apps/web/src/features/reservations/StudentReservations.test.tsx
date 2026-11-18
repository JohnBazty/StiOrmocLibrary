import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudentReservations } from './StudentReservations'

const api = vi.hoisted(() => ({ mine: vi.fn(), cancelMine: vi.fn() }))
vi.mock('./reservation-api', () => ({ reservationApi: api }))

describe('StudentReservations', () => {
  it('renders the title cover returned by the reservation endpoint', async () => {
    api.mine.mockResolvedValue([{
      reservationId: 8,
      title: 'Clean Code',
      coverImagePath: '/api/assets/covers/clean-code.png',
      queuePosition: 1,
      status: 'approved',
      reservedAt: '2026-08-24T08:00:00+08:00',
      pickupDeadline: null,
      accessionNumber: null,
      barcode: null,
      conditionStatus: 'Damaged',
    }])

    render(<MemoryRouter><StudentReservations /></MemoryRouter>)

    expect(await screen.findByText('Clean Code')).toBeTruthy()
    expect((screen.getByAltText('Clean Code cover') as HTMLImageElement).src).toContain('/api/assets/covers/clean-code.png')
    expect(screen.getByText('Condition: Damaged')).toBeTruthy()
  })

  const base = { reservationId: 9, title: 'Noli Me Tangere', coverImagePath: null, queuePosition: 2, status: 'pending', reservedAt: '2026-11-10T08:00:00+08:00',
    pickupDeadline: null, accessionNumber: null, barcode: null, conditionStatus: null, requestKind: 'Reservation' }
  const manilaDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })

  it('shows the Manila expiry date on a waiting reservation while the limit is on', async () => {
    api.mine.mockResolvedValue([{ ...base, waitingExpiresAt: '2026-11-30T02:00:00.000Z' }])
    render(<MemoryRouter><StudentReservations /></MemoryRouter>)
    expect(await screen.findByText(`Expires on ${manilaDate('2026-11-30T02:00:00.000Z')}`)).toBeTruthy()
  })

  it('shows no expiry date when the limit is off', async () => {
    api.mine.mockResolvedValue([{ ...base, waitingExpiresAt: null }])
    render(<MemoryRouter><StudentReservations /></MemoryRouter>)
    expect(await screen.findByText('Noli Me Tangere')).toBeTruthy()
    expect(screen.queryByText(/Expires on/)).toBeNull()
  })

  it('shows the pickup deadline and no expiry date once a copy is ready', async () => {
    api.mine.mockResolvedValue([{ ...base, status: 'ready_for_pickup', barcode: 'B-31', pickupDeadline: '2026-11-19T10:00:00+08:00', waitingExpiresAt: null }])
    render(<MemoryRouter><StudentReservations /></MemoryRouter>)
    expect(await screen.findByText(/Pickup deadline:/)).toBeTruthy()
    expect(screen.queryByText(/Expires on/)).toBeNull()
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
