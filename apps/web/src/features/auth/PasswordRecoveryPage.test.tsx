import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { PasswordRecoveryPage } from './PasswordRecoveryPage'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear() })
it('recovers through request, code and password stages without persisting recovery secrets', async () => {
  const calls: Array<{ path: string; body: Record<string, string> }> = []
  vi.stubGlobal('fetch', vi.fn(async (path: string, options: RequestInit) => {
    calls.push({ path, body: JSON.parse(String(options.body)) })
    const data = path.endsWith('/request') ? { challengeId: 'test-challenge', message: 'Check your school email.' }
      : path.endsWith('/verify') ? { resetToken: 'test-reset-token', expiresIn: 300 } : { message: 'Password updated. Sign in with your new password.' }
    return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } })
  }))
  render(<MemoryRouter><PasswordRecoveryPage /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Student Number or school email'), { target: { value: 'STUDENT-123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }))
  fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))
  fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'ExampleNewPassword1' } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'ExampleNewPassword1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Password updated'))
  expect(calls[0].body).toEqual({ identifier: 'STUDENT-123' })
  expect(calls[2].body).toEqual({ challenge_id: 'test-challenge', reset_token: 'test-reset-token', password: 'ExampleNewPassword1', confirm_password: 'ExampleNewPassword1' })
  expect(sessionStorage.length).toBe(0)
  expect(screen.queryByLabelText('New password')).toBeNull()
})

it('shows a readable error for an empty/non-JSON recovery response and allows retry', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })))
  render(<MemoryRouter><PasswordRecoveryPage /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Student Number or school email'), { target: { value: 'STUDENT-123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }))
  expect((await screen.findByRole('alert')).textContent).toContain('temporarily unavailable')
  expect(screen.getByRole('button', { name: 'Send verification code' }).hasAttribute('disabled')).toBe(false)
})
