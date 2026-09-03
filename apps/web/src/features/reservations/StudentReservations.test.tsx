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
    expect(screen.getByText('Current condition: Damaged')).toBeTruthy()
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
