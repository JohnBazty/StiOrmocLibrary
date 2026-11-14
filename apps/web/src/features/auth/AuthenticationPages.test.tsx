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

  it('pauses signup before the first semester starts and directs existing users to sign in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { enabled: true, open: false } }) }))
    render(<MemoryRouter><RegistrationPage /></MemoryRouter>)
    expect(await screen.findByText(/Student registration opens when the library starts the semester/)).toBeTruthy()
    expect(screen.queryByLabelText('Register as')).toBeNull()
    expect(screen.queryByLabelText('Student ID')).toBeNull()
    expect(screen.getByRole('link', { name: 'Sign In Here' })).toBeTruthy()
  })

  it('verifies the roster email before accepting a password and continues to sign-in without approval', async () => {
    const request = vi.fn(async (path: string, _options?: RequestInit) => ({
      ok: true,
      json: async () => ({ data: path.endsWith('/begin') ? { challengeId: 'test-challenge' }
        : path.endsWith('/verify') ? { grant: 'test-grant' }
        : path.endsWith('/complete') ? { schoolId: '0001234' } : { enabled: true, open: true } }),
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
    expect(screen.getByRole('link', { name: 'Set or reset Staff password' }).getAttribute('href')).toBe('/forgot-password?portal=staff')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show password' }))
    expect(screen.getByPlaceholderText('Enter your password').getAttribute('type')).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByPlaceholderText('Enter your password').getAttribute('type')).toBe('password')
    expect(screen.getAllByRole('img', { name: 'STI College Ormoc Logo' }).every(image => image.getAttribute('src') === '/reference-logo.jpg')).toBe(true)
    expect(screen.getByLabelText('School ID')).toBeTruthy()
    expect(screen.queryByLabelText('Login as')).toBeNull()
    expect(screen.getByRole('button', { name: 'Log In' })).toBeTruthy()
  })

  it('asks before switching after email verification and cancel makes no switch request', async () => {
    const request = vi.fn(async (path: string, _options?: RequestInit) => ({
      ok: true,
      json: async () => ({ data: path.endsWith('/device') ? { enabled: true }
        : path.endsWith('/login') ? { otpRequired: true, challengeId: 'test-challenge', emailHint: 'te***@ormoc.sti.edu.ph' }
        : { deviceSwitchRequired: true, switchToken: 'test-switch' } }),
    }))
    vi.stubGlobal('fetch', request)
    render(<MemoryRouter><ThemeProvider><LoginPage popup /></ThemeProvider></MemoryRouter>)
    const remember = await screen.findByRole<HTMLInputElement>('checkbox', { name: /Remember this device/ })
    expect(remember.checked).toBe(false)
    fireEvent.click(remember)
    fireEvent.change(screen.getByLabelText('Student Number / Faculty ID'), { target: { value: 'TEST-001' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-only' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
    fireEvent.change(await screen.findByLabelText('Login code'), { target: { value: '123456' } })
    const passwordRequest = request.mock.calls.find(([path]) => path.endsWith('/auth/login'))
    expect(JSON.parse(String(passwordRequest?.[1]?.body)).remember_device).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }))
    expect(await screen.findByRole('heading', { name: 'This account is signed in on another device.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Log In' })).toBeTruthy()
    expect(request.mock.calls.some(([path]) => path.endsWith('/device/switch'))).toBe(false)
  })
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each([['login', LoginPage], ['registration', RegistrationPage]] as const)('uses the reference logo on the full-page %s form', (_name, Page) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({success:true,data:{enabled:false,open:false}}), {status:200,headers:{'Content-Type':'application/json'}})))
  const {container}=render(<MemoryRouter><ThemeProvider><Page /></ThemeProvider></MemoryRouter>)
  expect(screen.getAllByRole('img',{name:'STI College Ormoc Logo'}).every(image=>image.getAttribute('src')==='/reference-logo.jpg')).toBe(true)
  expect(container.querySelector('.public-library-reference')).toBeTruthy()
})
