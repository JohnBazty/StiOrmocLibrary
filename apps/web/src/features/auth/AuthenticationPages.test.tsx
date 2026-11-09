import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'
import { RegistrationPage } from './RegistrationPage'
import { AdminLoginPage } from './AdminLoginPage'
import { ThemeProvider } from '../theme/ThemeProvider'

describe('authentication pages', () => {
  it('retains the borrowing selection when moving between login and registration', () => {
    const loginView=render(<MemoryRouter initialEntries={['/login?catalogTitleId=42']}><ThemeProvider><LoginPage /></ThemeProvider></MemoryRouter>)
    expect(screen.getByRole('link',{name:'Register an account'}).getAttribute('href')).toBe('/register?catalogTitleId=42')
    expect(screen.getByRole('link',{name:'Back to browsing'}).getAttribute('href')).toBe('/#catalog')
    loginView.unmount()
    render(<MemoryRouter initialEntries={['/register?catalogTitleId=42']}><RegistrationPage /></MemoryRouter>)
    expect(screen.getByRole('link',{name:'Sign In Here'}).getAttribute('href')).toBe('/login?catalogTitleId=42')
  })
  it('shows school-ID login without public personnel links with a registration link', () => {
    render(<MemoryRouter><ThemeProvider><LoginPage /></ThemeProvider></MemoryRouter>)
    expect(screen.queryByLabelText('Login as')).toBeNull()
    expect(screen.getByLabelText('Student Number / Faculty ID')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Register an account' }).getAttribute('href')).toBe('/register')
    expect(screen.queryByRole('link', { name: 'System Administrator Login' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Forgot Password?' }).getAttribute('href')).toBe('/forgot-password')
  })

  it('shows role-aware account registration and school email when roster signup is inactive', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { required: false } }) }))
    render(<MemoryRouter><RegistrationPage /></MemoryRouter>)
    await screen.findByLabelText('First Name')
    for (const label of ['Register as', 'First Name', 'Last Name', 'School Email', 'School ID', 'Program / Strand', 'Year / Grade Level', 'Password', 'Confirm Password']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    expect(screen.queryByLabelText('Contact Number')).toBeNull()
    expect(screen.getByRole('button', { name: 'Register' })).toBeTruthy()
  })

  it('directs an existing registrant to sign in without claiming the new password was saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: { required: false } }) }).mockResolvedValue({
      ok: false,
      headers: { get: () => 'application/json' },
      json: async () => ({ code: 'REGISTRATION_UNAVAILABLE', message: 'These details may already be in the library system. The password entered here was not saved.' }),
    }))
    render(<MemoryRouter><RegistrationPage /></MemoryRouter>)
    await screen.findByLabelText('First Name')
    for (const [label, value] of [
      ['First Name', 'Example'], ['Last Name', 'Student'], ['School Email', 'example@ormoc.sti.edu.ph'],
      ['School ID', 'STUDENT-123'], ['Password', 'ExamplePass123'], ['Confirm Password', 'ExamplePass123'],
      ['Program / Strand', 'Bachelor of Science in Information Technology'], ['Year / Grade Level', '4th Year'],
    ]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect((await screen.findByRole('alert')).textContent).toContain('password entered here was not saved')
    expect(screen.getByRole('link', { name: 'Go to Sign In' }).getAttribute('href')).toBe('/login')
  })

  it('shows an approval wait after a Student verifies the school email', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string) => ({
      ok: true, headers: { get: () => 'application/json' },
      json: async () => ({ data: input.endsWith('/roster-registration') ? { required: false } : input.endsWith('/verify') ? { status: 'PendingApproval', role: 'Student' } : { requestId: 5, status: 'PendingEmail' } }),
    })))
    render(<MemoryRouter><RegistrationPage popup /></MemoryRouter>)
    await screen.findByLabelText('First Name')
    for (const [label, value] of [
      ['First Name', 'Example'], ['Last Name', 'Student'], ['School Email', 'example@ormoc.sti.edu.ph'],
      ['School ID', 'STUDENT-123'], ['Password', 'ExamplePass123'], ['Confirm Password', 'ExamplePass123'],
      ['Program / Strand', 'Bachelor of Science in Information Technology'], ['Year / Grade Level', '4th Year'],
    ]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify school email' }))
    expect((await screen.findByRole('status')).textContent).toContain('approve your account')
    expect(screen.queryByRole('button', { name: 'Resend code' })).toBeNull()
    expect(screen.getByText(/registration is awaiting Librarian approval/)).toBeTruthy()
  })

  it('verifies the roster email before accepting a password and continues to sign-in without approval', async () => {
    const request = vi.fn(async (path: string, _options?: RequestInit) => ({
      ok: true,
      json: async () => ({ data: path.endsWith('/begin') ? { challengeId: 'test-challenge' }
        : path.endsWith('/verify') ? { grant: 'test-grant' }
        : path.endsWith('/complete') ? { schoolId: '0001234' } : { required: true } }),
    }))
    vi.stubGlobal('fetch', request)
    function SignInDestination() {
      const location = useLocation()
      return <p>Sign in {location.state.registrationSchoolId} {location.search}</p>
    }
    render(<MemoryRouter initialEntries={['/register?catalogTitleId=42']}><Routes>
      <Route path="/register" element={<RegistrationPage popup />} />
      <Route path="/login" element={<SignInDestination />} />
    </Routes></MemoryRouter>)
    fireEvent.change(await screen.findByLabelText('Student ID'), { target: { value: '0001234' } })
    expect(screen.queryByLabelText('School Email')).toBeNull()
    expect(screen.queryByLabelText('Password')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send email code' }))
    fireEvent.change(await screen.findByLabelText('Email verification code'), { target: { value: '123456' } })
    expect(request.mock.calls[1][1]?.body).toBe(JSON.stringify({ school_id: '0001234' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify email code' }))
    fireEvent.change(await screen.findByLabelText('Password'), { target: { value: 'ExamplePass123' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'ExamplePass123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Sign in 0001234 ?catalogTitleId=42')).toBeTruthy()
  })

  it('provides a shared personnel login without a selectable role', () => {
    render(<MemoryRouter><ThemeProvider><AdminLoginPage /></ThemeProvider></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Library Personnel Login' })).toBeTruthy()
    expect(screen.getByLabelText('School ID')).toBeTruthy()
    expect(screen.queryByLabelText('Login as')).toBeNull()
    expect(screen.getByRole('button', { name: 'Log In' })).toBeTruthy()
  })
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
