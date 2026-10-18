import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { KioskApp } from './KioskApp'
import { hasKioskSession, kioskLogin, kioskLogout, kioskSessionAlive, verifyDeskStaff } from './kiosk-session'

vi.mock('./kiosk-session', () => ({
  hasKioskSession: vi.fn(() => true),
  kioskLogin: vi.fn(),
  kioskLogout: vi.fn(),
  verifyDeskStaff: vi.fn(),
  kioskSessionAlive: vi.fn(async () => true),
  blockMessageFor: (e: unknown) => (e instanceof Error ? e.message : 'unavailable'),
}))

function renderKiosk(idleMs = 1000, warnMs?: number) {
  return render(
    <MemoryRouter initialEntries={['/kiosk']}>
      <Routes>
        <Route path="/kiosk/*" element={<KioskApp idleMs={idleMs} warnMs={warnMs} />} />
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

it('warns before the idle reset and a tap keeps the user on the task', () => {
  renderKiosk(1000, 400)
  fireEvent.click(screen.getByRole('button', { name: 'Attendance' }))

  act(() => { vi.advanceTimersByTime(600) })
  expect(screen.getByRole('alertdialog', { name: 'Are you still there?' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Yes, continue' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()

  act(() => { vi.advanceTimersByTime(700) })
  expect(screen.getByRole('heading', { name: 'Attendance' })).toBeTruthy()
})

it('returns home from a task with the Back button', () => {
  renderKiosk()
  fireEvent.click(screen.getByRole('button', { name: 'Borrow a book' }))
  expect(screen.getByRole('heading', { name: 'Borrow a book' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByRole('heading', { name: 'Welcome to the library' })).toBeTruthy()
})

it('shows students no end-session button and ignores a short tap on the heading', () => {
  renderKiosk()
  expect(screen.queryByRole('button', { name: 'End kiosk session' })).toBeNull()

  const heading = screen.getByRole('heading', { name: 'Welcome to the library' })
  fireEvent.pointerDown(heading)
  act(() => { vi.advanceTimersByTime(1000) })
  fireEvent.pointerUp(heading)
  act(() => { vi.advanceTimersByTime(3000) })
  expect(screen.queryByRole('dialog', { name: 'Staff only' })).toBeNull()
})

it('ends the session only after staff hold the heading and enter librarian credentials', async () => {
  renderKiosk()
  fireEvent.pointerDown(screen.getByRole('heading', { name: 'Welcome to the library' }))
  act(() => { vi.advanceTimersByTime(3000) })
  expect(screen.getByRole('dialog', { name: 'Staff only' })).toBeTruthy()

  vi.mocked(verifyDeskStaff).mockResolvedValueOnce(false)
  fireEvent.change(screen.getByLabelText('Staff ID'), { target: { value: 'LIB-1' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
  fireEvent.click(screen.getByRole('button', { name: 'End kiosk session' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Staff ID or password is incorrect.')
  expect(kioskLogout).not.toHaveBeenCalled()

  vi.mocked(verifyDeskStaff).mockResolvedValueOnce(true)
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'right' } })
  fireEvent.click(screen.getByRole('button', { name: 'End kiosk session' }))
  expect(await screen.findByRole('heading', { name: 'Kiosk sign-in' })).toBeTruthy()
  expect(kioskLogout).toHaveBeenCalled()
  expect(verifyDeskStaff).toHaveBeenLastCalledWith('LIB-1', 'right')
})

it('returns to sign-in with a librarian notice when the desk session is lost mid-task', async () => {
  vi.useRealTimers()
  vi.mocked(kioskSessionAlive).mockResolvedValueOnce(false)
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('unauthorised'))
  renderKiosk()

  fireEvent.click(screen.getByRole('button', { name: 'Attendance' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Type the code instead' }))
  fireEvent.change(screen.getByLabelText('Enter code manually'), { target: { value: 'QR-1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enter' }))

  expect(await screen.findByRole('heading', { name: 'Kiosk sign-in' })).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe('This kiosk was signed out. Please ask a librarian to sign it in.')
  expect(kioskLogout).toHaveBeenCalled()
})
