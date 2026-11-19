import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { PasswordRecoveryPage } from './PasswordRecoveryPage'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear() })
it('requests the hosted secure email link without storing recovery secrets or requesting a password', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({success:true,data:{message:'Check your registered school email.'}}), {headers:{'Content-Type':'application/json'}}))
  vi.stubGlobal('fetch', fetchMock)
  render(<MemoryRouter><PasswordRecoveryPage /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('School ID or registered school email'), {target:{value:'FIXTURE-STUDENT'}})
  fireEvent.click(screen.getByRole('button', {name:'Send reset link'}))
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Check your registered school email.'))
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/password-recovery/link',expect.objectContaining({method:'POST',body:JSON.stringify({identifier:'FIXTURE-STUDENT'})}))
  expect(sessionStorage.length).toBe(0)
  expect(screen.queryByLabelText('New password')).toBeNull()
  const waiting = await screen.findByRole('button',{name:'Wait one minute before requesting again'})
  expect(waiting.hasAttribute('disabled')).toBe(true)
  fireEvent.click(waiting)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('shows a readable error for an empty/non-JSON recovery response and allows retry', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', {status:502})))
  render(<MemoryRouter><PasswordRecoveryPage /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('School ID or registered school email'), {target:{value:'FIXTURE-STUDENT'}})
  fireEvent.click(screen.getByRole('button', {name:'Send reset link'}))
  expect((await screen.findByRole('alert')).textContent).toContain('temporarily unavailable')
  expect(screen.getByRole('button', {name:'Send reset link'}).hasAttribute('disabled')).toBe(false)
})
