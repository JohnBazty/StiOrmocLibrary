import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeProvider'
import { LoginPage } from './LoginPage'
import { RegistrationPage } from './RegistrationPage'
import { AdminLoginPage } from './AdminLoginPage'
import { ForgotPasswordPage } from './ForgotPasswordPage'

vi.mock('./auth-api', () => {
  class AuthenticationError extends Error {
    code: string
    errors: Record<string, string>
    constructor(message: string, code = 'AUTHENTICATION_FAILED', errors: Record<string, string> = {}) {
      super(message)
      this.code = code
      this.errors = errors
    }
  }
  return {
    login: vi.fn(),
    requestPasswordReset: vi.fn(),
    verifyPasswordResetOtp: vi.fn(),
    confirmPasswordReset: vi.fn(),
    AuthenticationError,
  }
})

function renderPage(ui: ReactNode) {
  return render(<ThemeProvider><MemoryRouter>{ui}</MemoryRouter></ThemeProvider>)
}

describe('authentication pages', () => {
  it('shows school ID and password without a role dropdown or admin link', () => {
    renderPage(<LoginPage />)
    const schoolId = screen.getByLabelText('School ID')
    const password = screen.getByLabelText('Password')
    expect(schoolId.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByLabelText('Login as')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Administrator sign-in' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Forgot Password?' }).getAttribute('href')).toBe('/forgot-password')
    expect(screen.getByRole('link', { name: 'Register as Student' }).getAttribute('href')).toBe('/register')
    expect(screen.getByRole('button', { name: 'Log In' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Show password' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy()
  })

  it('marks empty login fields invalid and keeps failures out of the success banner', () => {
    renderPage(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
    expect(screen.getByLabelText('School ID').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('School ID is required.').className).toContain('text-rose-700')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the wait message and clears the password when login is rate limited', async () => {
    const { login, AuthenticationError } = await import('./auth-api')
    vi.mocked(login).mockRejectedValueOnce(new AuthenticationError(
      'Too many login attempts. Please wait 15 minutes and try again.',
      'TOO_MANY_LOGIN_ATTEMPTS',
    ))
    renderPage(<LoginPage />)
    fireEvent.change(screen.getByLabelText('School ID'), { target: { value: 'STI-2026-1001' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'LibraryPass9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Please wait 15 minutes and try again.')
    expect(alert.className).toContain('bg-rose-50')
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
  })

  it('shows every field required by normalized student registration', () => {
    renderPage(<RegistrationPage />)
    for (const label of ['First Name', 'Last Name', 'Contact Number', 'Student ID', 'Program / Strand', 'Year / Grade Level', 'Password', 'Confirm Password']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Register' })).toBeTruthy()
  })

  it('provides a dedicated staff login without a selectable role', () => {
    renderPage(<AdminLoginPage />)
    expect(screen.getByRole('heading', { name: 'Staff sign-in' })).toBeTruthy()
    expect(screen.getByLabelText('School ID')).toBeTruthy()
    expect(screen.queryByLabelText('Login as')).toBeNull()
    expect(screen.getByRole('button', { name: 'Log In' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Show password' })).toBeNull()
    expect(screen.getAllByText(/Ask the campus librarian to reset it/).length).toBeGreaterThan(0)
  })

  it('renders the student forgot-password identify step', () => {
    renderPage(<ForgotPasswordPage />)
    expect(screen.getByRole('heading', { name: 'Forgot Password' })).toBeTruthy()
    expect(screen.getByLabelText('Student ID or school email')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send reset code' })).toBeTruthy()
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
