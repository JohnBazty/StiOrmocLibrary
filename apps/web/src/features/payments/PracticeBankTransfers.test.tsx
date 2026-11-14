import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PracticeBankTransfers } from './PracticeBankTransfers'
const api = vi.hoisted(() => ({ draftPractice: vi.fn(), confirmPractice: vi.fn(), cancelPractice: vi.fn() }))
vi.mock('./money-out-api', async original => ({ ...await original<typeof import('./money-out-api')>(), moneyOutApi: api }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const collections = { totalCollectionsCentavos: 15000, onlineCollectionsCentavos: 10000, cashCollectedCentavos: 5000,
  refundedCentavos: 0, topUpsCentavos: 0, withdrawalsCentavos: 0, reservedCentavos: 0, availableCentavos: 10000, withdrawalFeeCentavos: 500 }
const draft = { id: 'draft-1', reference: 'WDR-123', actorId: 1, direction: 'Withdrawal' as const, amountCentavos: 5000,
  feeCentavos: 500, totalCentavos: 5500, reason: 'Approved practice withdrawal', state: 'Draft' as const,
  balanceAfterCentavos: 4500,
  createdAt: '2026-11-12T01:00:00Z', expiresAt: '2026-11-12T01:15:00Z', destination: 'School bank · Practice', practice: true as const, events: [] }

it('shows cash separately and reviews server amounts before confirming one withdrawal', async () => {
  api.draftPractice.mockResolvedValue(draft); api.confirmPractice.mockResolvedValue({ ...draft, state: 'Succeeded' })
  const saved = vi.fn()
  render(<PracticeBankTransfers collections={collections} rows={[]} onSaved={saved}/> )
  expect(screen.getByText('Total collections')).toBeTruthy(); expect(screen.getByText('Cash collected')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw funds' }))
  fireEvent.change(screen.getByLabelText('Amount in pesos'), { target: { value: '50' } })
  fireEvent.change(screen.getByLabelText('Purpose'), { target: { value: draft.reason } })
  const review = screen.getByRole('button', { name: 'Review withdrawal' })
  fireEvent.click(review); fireEvent.click(review)
  await screen.findByRole('button', { name: 'Confirm withdrawal' })
  expect(api.draftPractice).toHaveBeenCalledTimes(1); expect(api.confirmPractice).not.toHaveBeenCalled()
  expect(screen.getByText('₱55.00')).toBeTruthy()
  expect(screen.getByText('Expected online balance')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm withdrawal' }))
  await screen.findByText('Withdrawal completed')
  expect(api.confirmPractice).toHaveBeenCalledTimes(1); expect(saved).toHaveBeenCalled()
})
it('adds funds separately from collections and preserves a failed confirmation for retry', async () => {
  api.draftPractice.mockResolvedValue({ ...draft, direction: 'TopUp', feeCentavos: 0, totalCentavos: 5000 })
  api.confirmPractice.mockRejectedValue(new Error('Please try again.'))
  render(<PracticeBankTransfers collections={collections} rows={[]} onSaved={()=>{}}/> )
  fireEvent.click(screen.getByRole('button', { name: 'Add funds' }))
  fireEvent.change(screen.getByLabelText('Amount in pesos'), { target: { value: '50' } })
  fireEvent.change(screen.getByLabelText('Purpose'), { target: { value: 'School funding practice' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review addition' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm addition' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Please try again.')
  expect(api.draftPractice).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Confirm addition' })).toBeTruthy()
})
it('saved draft can resume without a second review; history filters bank additions', async () => {
  api.confirmPractice.mockResolvedValue({ ...draft, state: 'Succeeded' })
  render(<PracticeBankTransfers collections={collections} rows={[draft, { ...draft, id: 'topup-1', direction: 'TopUp', state: 'Succeeded' }]} onSaved={()=>{}}/> )
  fireEvent.click(screen.getByRole('button', { name: 'Additions' }))
  expect(screen.queryByRole('button', { name: 'Review transfer' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Withdrawals' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review transfer' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm withdrawal' }))
  await waitFor(()=>expect(api.confirmPractice).toHaveBeenCalledWith('draft-1'))
  expect(api.draftPractice).not.toHaveBeenCalled()
})
it('connected Withdraw funds uses the Xendit action and preserves old local records without treating them as payouts',()=>{
  const withdraw=vi.fn()
  render(<PracticeBankTransfers collections={collections} rows={[{...draft,state:'Succeeded'}]} onSaved={()=>{}} onWithdraw={withdraw} withdrawable={6000} withdrawalEnabled/> )
  fireEvent.click(screen.getByRole('button',{name:'Withdraw funds'}))
  expect(withdraw).toHaveBeenCalledTimes(1);expect(api.draftPractice).not.toHaveBeenCalled()
  expect(screen.getByText('Recorded locally')).toBeTruthy()
  expect(screen.getByText('This earlier local entry did not send a Xendit transfer.')).toBeTruthy()
  expect(screen.getByText('₱60.00')).toBeTruthy()
})
