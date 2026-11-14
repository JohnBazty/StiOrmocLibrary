import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { notifyPaymentUpdate, PAYMENT_UPDATE_KEY, usePaymentUpdates } from './payment-updates'

function View({read}:{read:()=>Promise<unknown>}) { usePaymentUpdates(read); return <p>View</p> }
afterEach(()=>{cleanup();vi.useRealTimers();localStorage.removeItem(PAYMENT_UPDATE_KEY)})
it('signals current and other tabs without storing payment or account details',async()=>{
  const read=vi.fn().mockResolvedValue(undefined)
  render(<View read={read}/>)
  await act(async()=>notifyPaymentUpdate())
  expect(read).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem(PAYMENT_UPDATE_KEY)).toMatch(/^\d+:[0-9.]+$/)
  await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:PAYMENT_UPDATE_KEY})))
  expect(read).toHaveBeenCalledTimes(2)
  await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:'unrelated'})))
  expect(read).toHaveBeenCalledTimes(2)
})
it('queues a fresh read after an older in-flight result, without overlapping requests',async()=>{
  let finish!:()=>void
  const read=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve})).mockResolvedValue(undefined)
  render(<View read={read}/>)
  act(()=>notifyPaymentUpdate())
  act(()=>notifyPaymentUpdate())
  expect(read).toHaveBeenCalledTimes(1)
  await act(async()=>finish())
  expect(read).toHaveBeenCalledTimes(2)
  cleanup()
  await act(async()=>notifyPaymentUpdate())
  expect(read).toHaveBeenCalledTimes(2)
})
