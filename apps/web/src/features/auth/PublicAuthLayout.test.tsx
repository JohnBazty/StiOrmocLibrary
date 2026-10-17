import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { PublicAuthLayout } from './PublicAuthLayout'
import { LoginPage } from './LoginPage'
import { RegistrationPage } from './RegistrationPage'

vi.mock('../catalog/PublicCatalogPage', () => ({ PublicCatalogPage: () => <p>Catalog background</p> }))
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output> }
function setup() {
  render(<MemoryRouter initialEntries={[{ pathname: '/login', search: '?catalogTitleId=42', state: { catalogLocation: { pathname: '/', search: '?q=history&categoryId=7', hash: '#catalog' } } }]}>
    <Location /><Routes><Route path="/" element={<p>Public browsing restored</p>} /><Route element={<PublicAuthLayout />}>
      <Route path="/login" element={<LoginPage popup />} /><Route path="/register" element={<RegistrationPage popup />} />
    </Route></Routes>
  </MemoryRouter>)
}
it('keeps the selected book across forms and restores the prior catalog filters when closed', () => {
  setup()
  expect(screen.getByRole('dialog', { name: 'Log In' })).toBeTruthy()
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.click(screen.getByRole('link', { name: 'Sign Up' }))
  expect(screen.getByRole('dialog', { name: 'Account Registration' })).toBeTruthy()
  expect(screen.getByTestId('location').textContent).toBe('/register?catalogTitleId=42')
  fireEvent.click(screen.getByRole('button', { name: 'Close account dialog' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByTestId('location').textContent).toBe('/?q=history&categoryId=7#catalog')
  expect(document.body.style.overflow).toBe('')
})
it('Escape dismisses an idle dialog through its return-to-catalog route', () => {
  setup()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true, bubbles: true }))
  expect(screen.getByText('Public browsing restored')).toBeTruthy()
})
it('cannot dismiss or switch forms while a login request is pending', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  setup()
  fireEvent.change(screen.getByLabelText('Student Number / Faculty ID'), { target: { value: 'STUDENT-123' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'LocalTest123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
  expect((screen.getByRole('button', { name: 'Close account dialog' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('link', { name: 'Sign Up' }))
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true, bubbles: true }))
  expect(screen.getByRole('dialog', { name: 'Log In' })).toBeTruthy()
  expect(screen.getByTestId('location').textContent).toBe('/login?catalogTitleId=42')
})
