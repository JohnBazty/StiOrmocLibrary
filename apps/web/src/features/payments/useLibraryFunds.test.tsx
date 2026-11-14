import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useLibraryFunds } from './useLibraryFunds'
const api=vi.hoisted(()=>({recover:vi.fn(),overview:vi.fn()}))
vi.mock('./money-out-api',()=>({moneyOutApi:api}))
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks()})
it('forces a fresh balance read after a mutation even when an older read is in flight',async()=>{
  let finish:(value:unknown)=>void=()=>{}
  api.recover.mockResolvedValue({});api.overview.mockReturnValueOnce(new Promise(resolve=>{finish=resolve})).mockResolvedValue({operations:[],balance:{availableCentavos:4500}})
  const {result}=renderHook(()=>useLibraryFunds());await act(async()=>{})
  let changed:Promise<void>
  await act(async()=>{changed=result.current.refreshAfterChange();finish({operations:[],balance:{availableCentavos:10000}});await changed})
  expect(api.overview).toHaveBeenCalledTimes(2)
  expect(result.current.data?.balance?.availableCentavos).toBe(4500)
})
it('checks Xendit before reading balances, polls pending status and stops when unmounted',async()=>{
  vi.useFakeTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false})
  const pending={operations:[{id:'payout-1',state:'Processing',rail:'Transfer'}]}
  const done={operations:[{id:'payout-1',state:'Failed',rail:'Transfer'}]}
  api.recover.mockResolvedValue({moneyOutChecked:1});api.overview.mockResolvedValueOnce(pending).mockResolvedValue(done)
  const {result,unmount}=renderHook(()=>useLibraryFunds())
  await act(async()=>{})
  expect(result.current.data).toEqual(pending)
  expect(api.recover.mock.invocationCallOrder[0]).toBeLessThan(api.overview.mock.invocationCallOrder[0])
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000)})
  expect(result.current.data).toEqual(done);expect(api.recover).toHaveBeenCalledTimes(2)
  unmount();await act(async()=>{await vi.advanceTimersByTimeAsync(30000)})
  expect(api.recover).toHaveBeenCalledTimes(2)
})
it('preserves visible records when a refresh fails and waits while the page is hidden',async()=>{
  vi.useFakeTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false})
  const pending={operations:[{state:'Review',rail:'Transfer'}]}
  api.recover.mockResolvedValueOnce({});api.overview.mockResolvedValue(pending)
  const {result}=renderHook(()=>useLibraryFunds());await act(async()=>{})
  Object.defineProperty(document,'hidden',{configurable:true,value:true})
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000)})
  expect(api.recover).toHaveBeenCalledTimes(1)
  api.recover.mockRejectedValueOnce(new Error('Xendit is temporarily unavailable.'))
  await act(async()=>{await result.current.refresh()})
  expect(result.current.data).toEqual(pending);expect(result.current.error).toContain('temporarily unavailable')
  Object.defineProperty(document,'hidden',{configurable:true,value:false})
})
