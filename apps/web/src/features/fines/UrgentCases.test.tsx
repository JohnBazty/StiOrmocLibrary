import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { UrgentCases } from './UrgentCases'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

type Rules = { version: number; amount: number | null; overdue_days: number | null; unpaid_days: number | null; email_enabled: boolean }
const settings: Rules = { version: 1, amount: null, overdue_days: null, unpaid_days: null, email_enabled: false }
const stub = (items: unknown[], rules: Rules = settings) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { settings: rules, items } }) })))

it('lists urgent cases without any rule form, and points to Library setup when no rule is on', async () => {
  stub([])
  render(<MemoryRouter><UrgentCases /></MemoryRouter>)
  expect(await screen.findByText(/No urgent rules are enabled/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Review rules' })).toBeNull()
  expect(screen.queryByLabelText('Outstanding amount (PHP)')).toBeNull()
  const link = screen.getByRole('link', { name: 'Open Library setup' })
  expect(link.getAttribute('href')).toBe('/librarian/maintenance?tab=violation-rules')
})

it('reports how many cases need follow-up to the page through onCount', async () => {
  stub([{ key: 'Fine:1', full_name: 'Synthetic Student', school_id: 'S-1', kind: 'Overdue', balance: 120, overdueDays: 5, unpaidDays: 5, reasons: ['Days overdue'], last_notified_at: null }], { ...settings, overdue_days: 3 })
  const onCount = vi.fn()
  render(<MemoryRouter><UrgentCases onCount={onCount} /></MemoryRouter>)
  expect(await screen.findByText('Synthetic Student')).toBeTruthy()
  expect(onCount).toHaveBeenLastCalledWith(1)
})
