import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReservationSettingsPanel } from './ReservationSettingsPanel'

const api = vi.hoisted(() => ({ settings: vi.fn(), saveSettings: vi.fn() }))
vi.mock('./reservation-api', () => ({ reservationApi: api }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

const defaults = { pickupWindowDays: 1, pickupWindowChangedBy: null, pickupWindowChangedAt: null, waitingExpiryDays: null, waitingExpiryChangedBy: null, waitingExpiryChangedAt: null }
const manilaDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })
const at = '2026-11-19T02:00:00.000Z'

it('loads the settings once and shows the pickup window with Default', async () => {
  api.settings.mockResolvedValue({ ...defaults, pickupWindowDays: 2 })
  render(<ReservationSettingsPanel />)
  const input = await screen.findByLabelText('Pickup window (days)') as HTMLInputElement
  await waitFor(() => expect(input.value).toBe('2'))
  expect(api.settings).toHaveBeenCalledTimes(1)
  expect(screen.getAllByText('Default').length).toBeGreaterThan(0)
})

it('saves the typed pickup window and shows who changed it and when', async () => {
  api.settings.mockResolvedValue(defaults)
  api.saveSettings.mockResolvedValue({ ...defaults, pickupWindowDays: 3, pickupWindowChangedBy: 'Sample Librarian', pickupWindowChangedAt: at })
  render(<ReservationSettingsPanel />)
  const input = await screen.findByLabelText('Pickup window (days)') as HTMLInputElement
  await waitFor(() => expect(input.value).toBe('1'))
  fireEvent.change(input, { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save pickup window' }))
  await screen.findByText(`Last changed by Sample Librarian on ${manilaDate(at)}`)
  expect(api.saveSettings).toHaveBeenCalledTimes(1)
  expect(api.saveSettings).toHaveBeenCalledWith({ pickupWindowDays: '3' })
})
