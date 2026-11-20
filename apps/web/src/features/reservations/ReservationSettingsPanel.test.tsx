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

const limitInput = async () => await screen.findByLabelText('Waiting-list limit (days)') as HTMLInputElement
const card = (heading: string) => screen.getByRole('heading', { name: heading }).parentElement as HTMLElement

it('shows the default view as window 1, a blank limit and Default for both (AC 18)', async () => {
  api.settings.mockResolvedValue(defaults)
  render(<ReservationSettingsPanel />)
  expect((await limitInput()).value).toBe('')
  expect((screen.getByLabelText('Pickup window (days)') as HTMLInputElement).value).toBe('1')
  expect(screen.getAllByText('Default')).toHaveLength(2)
})

it('saves a typed limit of 14 and a blank limit as off', async () => {
  api.settings.mockResolvedValue(defaults)
  api.saveSettings.mockResolvedValueOnce({ ...defaults, waitingExpiryDays: 14, waitingExpiryChangedBy: 'Sample Librarian', waitingExpiryChangedAt: at })
  render(<ReservationSettingsPanel />)
  const input = await limitInput()
  fireEvent.change(input, { target: { value: '14' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save waiting-list limit' }))
  await screen.findByText(`Last changed by Sample Librarian on ${manilaDate(at)}`)
  expect(api.saveSettings).toHaveBeenLastCalledWith({ waitingExpiryDays: '14' })
  api.saveSettings.mockResolvedValueOnce({ ...defaults, waitingExpiryChangedBy: null, waitingExpiryChangedAt: at })
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save waiting-list limit' }))
  await screen.findByText(`Last changed by a librarian on ${manilaDate(at)}`)
  expect(api.saveSettings).toHaveBeenLastCalledWith({ waitingExpiryDays: '' })
})

it('shows a failed limit save only in the limit card and keeps the saved status', async () => {
  const text = 'Leave blank to turn off, or enter a whole number of days from 7 to 90.'
  api.settings.mockResolvedValue({ ...defaults, waitingExpiryDays: 14, waitingExpiryChangedBy: 'Sample Librarian', waitingExpiryChangedAt: at })
  api.saveSettings.mockRejectedValue(new Error(text))
  render(<ReservationSettingsPanel />)
  const input = await limitInput()
  fireEvent.change(input, { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save waiting-list limit' }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toBe(text)
  expect(card('Waiting-list limit').contains(alert)).toBe(true)
  expect(card('Pickup window').querySelector('[role="alert"]')).toBeNull()
  expect(screen.getByText(`Last changed by Sample Librarian on ${manilaDate(at)}`)).toBeTruthy()
  expect(input.value).toBe('3')
})

it('shows the load error when the settings cannot be read', async () => {
  api.settings.mockRejectedValue(new Error('Reservation settings need the latest database update.'))
  render(<ReservationSettingsPanel />)
  expect((await screen.findByRole('alert')).textContent).toBe('Reservation settings need the latest database update.')
})

const description = (el: HTMLElement) => (el.getAttribute('aria-describedby') ?? '').split(' ').map(id => document.getElementById(id)?.textContent ?? '').join(' ')
it('ties the help text and a save error to the input and announces the last-changed line', async () => {
  api.settings.mockResolvedValue(defaults)
  api.saveSettings.mockRejectedValue(new Error('Pickup window must be a whole number from 1 to 7 days.'))
  render(<ReservationSettingsPanel />)
  const input = await screen.findByLabelText('Pickup window (days)')
  expect(description(input)).toMatch(/How long a book marked ready is held/)
  expect(input.getAttribute('aria-invalid')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save pickup window' }))
  await screen.findByText('Pickup window must be a whole number from 1 to 7 days.')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(description(input)).toMatch(/whole number from 1 to 7 days/)
  expect(screen.getAllByRole('status').some(s => s.textContent === 'Default')).toBe(true)
})

it('the Pickup window shortcut lands on the pickup window field', async () => {
  const scroll = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
  window.history.replaceState(null, '', '/librarian/maintenance?tab=reservations#pickup-window')
  api.settings.mockResolvedValue(defaults)
  render(<ReservationSettingsPanel />)
  const input = await screen.findByLabelText('Pickup window (days)')
  await waitFor(() => expect(document.activeElement).toBe(input))
  expect(scroll).toHaveBeenCalled()
  window.history.replaceState(null, '', '/')
})

it('switches to the Faculty tab to save a separate faculty waiting-list limit', async () => {
  api.settings.mockResolvedValue({ ...defaults, facultyWaitingExpiryDays: null })
  api.saveSettings.mockResolvedValue({ ...defaults, facultyWaitingExpiryDays: 30 })
  render(<ReservationSettingsPanel />)
  await screen.findByLabelText('Pickup window (days)')
  fireEvent.click(screen.getByRole('tab', { name: 'Faculty' }))
  const facultyInput = screen.getByLabelText('Faculty waiting-list limit (days)') as HTMLInputElement
  expect(facultyInput.value).toBe('')
  fireEvent.change(facultyInput, { target: { value: '30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save faculty waiting-list limit' }))
  await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ facultyWaitingExpiryDays: '30' }))
})
