import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { LibraryFundsPage } from './LibraryFundsPage'
import type { FundsOverview, MoneyOutRecord } from './money-out-api'
const api = vi.hoisted(() => ({ overview: vi.fn(), recover: vi.fn() }))
vi.mock('./money-out-api', async original => ({ ...await original<typeof import('./money-out-api')>(), moneyOutApi: api }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const withdrawal = { id:'w-1',type:'Withdrawal',state:'Processing',reference:'WDR-1',principalCentavos:5000,feeCentavos:500,totalCentavos:5000,appliedPrincipalCentavos:0,rail:'Transfer',reason:'School approved withdrawal',createdAt:'2026-11-13T01:00:00Z',expiresAt:'2026-11-13T02:00:00Z',destination:{name:'School bank',bank:'BNORPHMM',account:'•••• 8888'},events:[] } as MoneyOutRecord
const data = { enabled:true,payoutsEnabled:true,refundsEnabled:true,payoutFeeCentavos:500,beneficiaries:[{id:'bank-1',type:'SchoolBank',label:'Approved school bank',bank:'BNORPHMM',account:'•••• 8888'}],balance:{availableCentavos:10000,reservedCentavos:5500,providerBalanceCentavos:20000},setupMessage:null,operations:[withdrawal],voids:[],collections:{totalCollectionsCentavos:17000,onlineCollectionsCentavos:12000,cashCollectedCentavos:5000,topUpsCentavos:3000,providerWithdrawalsCentavos:0},practiceTransfers:[{id:'top-1',reference:'ADD-1',direction:'TopUp',state:'Succeeded',amountCentavos:3000,feeCentavos:0,totalCentavos:3000,reason:'School bank funding entry',createdAt:'2026-11-12T01:00:00Z',destination:'School bank',events:[]}],totals:{grossCollections:12000,appliedPrincipal:11500,userFees:500,refundedPrincipal:0,refundedFees:0,withdrawals:0} } as unknown as FundsOverview
it('offers one withdrawal and addition, merges activity and keeps cash separate from withdrawable funds', async () => {
  api.recover.mockResolvedValue({}); api.overview.mockResolvedValue(data)
  render(<MemoryRouter><LibraryFundsPage/></MemoryRouter>)
  await screen.findByRole('button', { name:'Withdraw funds' })
  expect(screen.getAllByRole('button', { name:'Withdraw funds' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name:'Add funds' })).toHaveLength(1)
  expect(screen.getByText('Cash collected').closest('article')?.textContent).toContain('₱50.00')
  expect(screen.getByText('Available to withdraw').closest('article')?.textContent).toContain('₱100.00')
  const activity = within(screen.getByRole('region', { name:'Funds activity' }))
  expect(activity.getByText('WDR-1', { exact:false })).toBeTruthy()
  expect(activity.getByText('ADD-1', { exact:false })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name:'Additions' }))
  expect(activity.queryByText('WDR-1', { exact:false })).toBeNull()
  expect(activity.getByText('ADD-1', { exact:false })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name:'Withdrawals' }))
  fireEvent.click(activity.getByRole('button', { name:'View details' }))
  expect(await screen.findByRole('button', { name:'Check status' })).toBeTruthy()
  api.overview.mockResolvedValue({ ...data,operations:[{ ...withdrawal,state:'Succeeded' }],balance:{...data.balance,availableCentavos:4500,reservedCentavos:0} })
  fireEvent.click(screen.getByRole('button', { name:'Refresh funds' }))
  await waitFor(() => expect(screen.getByRole('button', { name:'Done' })).toBeTruthy())
  expect(screen.queryByRole('button', { name:'Check status' })).toBeNull()
  expect(screen.getByText('Available to withdraw').closest('article')?.textContent).toContain('₱45.00')
})
