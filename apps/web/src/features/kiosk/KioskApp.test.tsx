import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { KioskApp } from './KioskApp'

function renderKiosk(idleMs = 1000) {
  return render(
    <MemoryRouter initialEntries={['/kiosk']}>
      <Routes>
        <Route path="/kiosk/*" element={<KioskApp idleMs={idleMs} />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); cleanup() })

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
