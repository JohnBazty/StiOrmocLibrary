import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UrgentAlertRules } from './UrgentAlertRules'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('requires review before saving optional urgency thresholds', async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: { settings: { version: 1, amount: null, overdue_days: null, unpaid_days: null, email_enabled: false }, items: [] } }) }))
  vi.stubGlobal('fetch', fetch)
  render(<UrgentAlertRules />)
  await screen.findByRole('heading', { name: 'Urgent alert rules' })
  fireEvent.change(screen.getByLabelText('Outstanding amount (PHP)'), { target: { value: '100' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review rules' }))
  expect(fetch.mock.calls.length).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'Save reviewed rules' }))
  await screen.findByText('Alert rules saved. Existing charges are unchanged.')
  const save = fetch.mock.calls.find(call => (call as unknown as [string, RequestInit])[1]?.method === 'POST') as unknown as [string, RequestInit]
  expect(save[0]).toBe('/api/v1/admin/fines/urgent-settings')
  expect(JSON.parse(String(save[1].body))).toMatchObject({ version: 1, amount: '100', emailEnabled: false })
})

it('shows a load failure instead of an empty form', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ message: 'Alert rules are unavailable.' }) })))
  render(<UrgentAlertRules />)
  expect(await screen.findByText('Alert rules are unavailable.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Review rules' })).toBeNull()
})
