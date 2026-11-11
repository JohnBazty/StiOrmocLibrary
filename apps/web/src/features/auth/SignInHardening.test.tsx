import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveLogin, type LoginResult } from './auth-api'
import { getCsrfToken, getCurrentClaims, passwordChangeRequired } from './auth-storage'
import { ChangePasswordPage } from './ChangePasswordPage'
import { ProtectedRoute } from './ProtectedRoute'
import { usersApi } from '../users/users-api'
import { SignInAccessPanel } from '../users/SignInAccessPanel'

const csrfToken = 'f'.repeat(64)
const exp = () => Math.floor(Date.now() / 1000) + 900
function signIn(mustChangePassword = false) {
  const result = {
    session: { userId: 31, schoolId: 'FAC-0031', role: 'Faculty', exp: exp(), sessionId: 'session-31' },
    csrfToken, mustChangePassword, expiresIn: 900, redirect: '/faculty/dashboard',
    user: { id: 31, accountId: 31, schoolId: 'FAC-0031', fullName: null, role: 'Faculty' },
  } as LoginResult
  saveLogin(result)
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('cookie sign-in in the browser', () => {
  it('keeps only the public claims and the CSRF token in storage', () => {
    signIn()
    expect(getCsrfToken()).toBe(csrfToken)
    expect(getCurrentClaims()?.schoolId).toBe('FAC-0031')
    const stored = JSON.stringify({ ...sessionStorage })
    expect(stored).not.toMatch(/eyJ|"token"/)
    expect(passwordChangeRequired()).toBe(false)
  })

  it('sends X-CSRF-Token and never an Authorization header', async () => {
    signIn()
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json({ success: true, data: { id: 9, unlocked: true } }))
    vi.stubGlobal('fetch', fetchMock)
    await usersApi.unlockSignIn(9, 'Locked out at the desk')
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get('X-CSRF-Token')).toBe(csrfToken)
    expect(headers.get('Authorization')).toBeNull()
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include')
  })

  it('sends a signed-in account with a temporary password to the change-password form', () => {
    signIn(true)
    render(<MemoryRouter initialEntries={['/faculty/dashboard']}><Routes>
      <Route element={<ProtectedRoute roles={['Faculty']} />}><Route path="/faculty/dashboard" element={<h1>Dashboard</h1>} /></Route>
      <Route path="/change-password" element={<h1>Change password form</h1>} />
    </Routes></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Change password form' })).toBeTruthy()
  })
})

describe('a new tab', () => {
  it('restores the claims and CSRF token from the cookie sign-in, including a pending forced change', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => String(url) === '/api/v1/auth/me'
      ? json({ success: true, data: { session: { userId: 31, schoolId: 'FAC-0031', role: 'Faculty', exp: exp() }, csrfToken, mustChangePassword: true } })
      : json({}, 401))
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/faculty/dashboard']}><Routes>
      <Route element={<ProtectedRoute roles={['Faculty']} />}><Route path="/faculty/dashboard" element={<h1>Dashboard</h1>} /></Route>
      <Route path="/change-password" element={<h1>Change password form</h1>} />
    </Routes></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Change password form' })).toBeTruthy()
    expect(getCsrfToken()).toBe(csrfToken)
  })
})

describe('change-password form', () => {
  function page() {
    render(<MemoryRouter initialEntries={['/change-password']}><Routes>
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/login" element={<h1>Login page</h1>} />
    </Routes></MemoryRouter>)
  }
  function fill(current: string, next: string, confirm: string) {
    fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: current } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
  }

  it('changes the password with the CSRF token, ends the local sign-in and returns to login', async () => {
    signIn(true)
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json({ success: true, data: { signedOut: true, message: 'Password changed.' } }))
    vi.stubGlobal('fetch', fetchMock)
    page()
    fill('Temporary1234567', 'a-new-password', 'a-new-password')
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeTruthy()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/auth/change-password')
    expect((init?.headers as Record<string, string>)['X-CSRF-Token']).toBe(csrfToken)
    expect(JSON.parse(String(init?.body))).toEqual({ current_password: 'Temporary1234567', new_password: 'a-new-password', confirm_password: 'a-new-password' })
    expect(getCsrfToken()).toBeNull()
  })

  it('shows the server reason and keeps the sign-in when the change fails', async () => {
    signIn(true)
    vi.stubGlobal('fetch', vi.fn(async () => json({ success: false, code: 'CURRENT_PASSWORD_INCORRECT', message: 'Your current password is incorrect.' }, 422)))
    page()
    fill('wrong', 'a-new-password', 'a-new-password')
    expect((await screen.findByRole('alert')).textContent).toContain('current password is incorrect')
    expect(getCsrfToken()).toBe(csrfToken)
  })

  it('checks matching passwords before calling the server', () => {
    signIn(true)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    page()
    fill('Temporary1234567', 'a-new-password', 'different-one')
    expect(screen.getByRole('alert').textContent).toContain('matching passwords')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends a signed-out visitor to login', () => {
    page()
    expect(screen.getByRole('heading', { name: 'Login page' })).toBeTruthy()
  })
})

describe('Admin sign-in access actions', () => {
  it('unlocks only after an audit reason is given', async () => {
    const unlock = vi.spyOn(usersApi, 'unlockSignIn').mockResolvedValue({ id: 9, unlocked: true })
    const changed = vi.fn()
    render(<SignInAccessPanel accountId={9} onChanged={changed} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock sign-in' }))
    const confirm = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Audit reason'), { target: { value: 'Locked out at the desk' } })
    fireEvent.click(confirm)
    expect((await screen.findByRole('status')).textContent).toContain('Sign-in unlocked')
    expect(unlock).toHaveBeenCalledWith(9, 'Locked out at the desk')
    expect(changed).toHaveBeenCalled()
  })

  it('shows a temporary password once and forgets it on Done', async () => {
    vi.spyOn(usersApi, 'setTemporaryPassword').mockResolvedValue({ id: 9, temporary_password: 'Abcdefgh23456789' })
    render(<SignInAccessPanel accountId={9} onChanged={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Set temporary password' }))
    fireEvent.change(screen.getByLabelText('Audit reason'), { target: { value: 'No working school email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('Abcdefgh23456789')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('Abcdefgh23456789')).toBeNull()
  })

  it('shows the server reason when the account is not locked', async () => {
    vi.spyOn(usersApi, 'unlockSignIn').mockRejectedValue(new Error('This account is not locked.'))
    render(<SignInAccessPanel accountId={9} onChanged={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock sign-in' }))
    fireEvent.change(screen.getByLabelText('Audit reason'), { target: { value: 'Locked out at the desk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect((await screen.findByRole('alert')).textContent).toContain('not locked')
  })
})
