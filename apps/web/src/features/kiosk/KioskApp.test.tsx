import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { KioskApp } from './KioskApp'
import { hasKioskSession, kioskLogin } from './kiosk-session'

vi.mock('./kiosk-session', () => ({
  hasKioskSession: vi.fn(() => true),
  kioskLogin: vi.fn(),
  kioskLogout: vi.fn(),
  blockMessageFor: (e: unknown) => (e instanceof Error ? e.message : 'unavailable'),
}))

function renderKiosk(idleMs = 1000) {
  return render(
    <MemoryRouter initialEntries={['/kiosk']}>
      <Routes>
        <Route path="/kiosk/*" element={<KioskApp idleMs={idleMs} />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(hasKioskSession).mockReturnValue(true)
})
afterEach(() => { if (vi.isFakeTimers()) vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.clearAllMocks(); cleanup() })

it('returns to the idle screen after the inactivity timeout', () => {
  renderKiosk(1000)
  expect(screen.getByRole('heading', { name: 'Welcome to the library' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Attendance' }))
  expect(screen.getByRole('heading', { name: 'Attendance' })).toBeTruthy()

  act(() => { vi.advanceTimersByTime(1000) })
  expect(screen.getByRole('heading', { name: 'Welcome to the library' })).toBeTruthy()
})

it('switches visible strings when the language changes', () => {
  renderKiosk()
  expect(screen.getByRole('heading', { name: 'Welcome to the library' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Cebuano' }))
  expect(screen.getByRole('heading', { name: 'Maayong pag-abot sa library' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Filipino' }))
  expect(screen.getByRole('heading', { name: 'Maligayang pagdating sa aklatan' })).toBeTruthy()
})

it('shows the sign-in screen when the kiosk has no session, then the kiosk after login', async () => {
  vi.useRealTimers()
  vi.mocked(hasKioskSession).mockReturnValue(false)
  vi.mocked(kioskLogin).mockResolvedValue(undefined)
  renderKiosk()

  expect(screen.getByRole('heading', { name: 'Kiosk sign-in' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Staff ID'), { target: { value: 'STAFF-1' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('heading', { name: 'Welcome to the library' })).toBeTruthy()
  expect(kioskLogin).toHaveBeenCalledWith('STAFF-1', 'pw')
})

it('shows a block message when sign-in fails', async () => {
  vi.useRealTimers()
  vi.mocked(hasKioskSession).mockReturnValue(false)
  vi.mocked(kioskLogin).mockRejectedValue(new Error('The library service is unavailable. Please see a librarian.'))
  renderKiosk()

  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toBe('The library service is unavailable. Please see a librarian.'),
  )
})
