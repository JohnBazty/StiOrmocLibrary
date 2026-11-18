import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useLiveQuery } from './useLiveQuery'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
it('shares identical reads, polls each second and never overlaps a slow read', async () => {
  vi.useFakeTimers()
  let finish!: (value: number) => void
  const read = vi.fn().mockResolvedValueOnce(1).mockImplementationOnce(() => new Promise<number>(resolve => { finish = resolve })).mockResolvedValue(3)
  const first = renderHook(() => useLiveQuery('shared', read))
  const second = renderHook(() => useLiveQuery('shared', read))
  await act(async () => {})
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(read).toHaveBeenCalledTimes(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
  expect(read).toHaveBeenCalledTimes(2)
  expect(first.result.current.data).toBe(1)
  await act(async () => { finish(2) })
  expect(second.result.current.data).toBe(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(first.result.current.data).toBe(3)
})
it('keeps data on failure, backs off, and resumes on reconnect/visibility', async () => {
  vi.useFakeTimers()
  let hidden = false
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  const read = vi.fn().mockResolvedValueOnce('saved').mockRejectedValueOnce(new Error('Offline')).mockResolvedValue('new')
  const hook = renderHook(() => useLiveQuery('retry', read))
  await act(async () => {})
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(hook.result.current.data).toBe('saved')
  expect(hook.result.current.error?.message).toBe('Offline')
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(read).toHaveBeenCalledTimes(2)
  hidden = true
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(read).toHaveBeenCalledTimes(2)
  hidden = false
  await act(async () => { window.dispatchEvent(new Event('online')) })
  expect(hook.result.current.data).toBe('new')
  expect(hook.result.current.error).toBeNull()
})
it('ignores an old query response after filters change and aborts it', async () => {
  let finish!: (value: string) => void
  let signal!: AbortSignal
  const read = vi.fn((value: AbortSignal) => { signal = value; return new Promise<string>(resolve => { finish = resolve }) })
  const hook = renderHook(({key}) => useLiveQuery(key, key === 'old' ? read : async () => 'filtered'), {initialProps:{key:'old'}})
  await act(async () => {})
  hook.rerender({key:'new'})
  await act(async () => { finish('stale') })
  expect(signal.aborted).toBe(true)
  expect(hook.result.current.data).toBe('filtered')
})

it('lets a manual refresh surface a connection failure while background reads stay paused', async () => {
  vi.useFakeTimers()
  let online = true
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  const read = vi.fn().mockResolvedValueOnce('last known value').mockRejectedValueOnce(new Error('No connection'))
  const hook = renderHook(() => useLiveQuery('manual-refresh-offline', read))
  await act(async () => {})
  online = false
  await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => { await hook.result.current.refresh() })
  expect(read).toHaveBeenCalledTimes(2)
  expect(hook.result.current.error?.message).toBe('No connection')
  expect(hook.result.current.data).toBe('last known value')
})
it('post-mutation refresh waits for an earlier read and never emits human activity', async () => {
  let finish!: (value: number) => void
  const activity = vi.fn()
  window.addEventListener('pointerdown', activity)
  const read = vi.fn().mockImplementationOnce(() => new Promise<number>(resolve => { finish = resolve })).mockResolvedValue(2)
  const hook = renderHook(() => useLiveQuery('after-write', read))
  await act(async () => {})
  let next!: Promise<unknown>
  act(() => { next = hook.result.current.refresh() })
  await act(async () => { finish(1); await next })
  expect(hook.result.current.data).toBe(2)
  expect(activity).not.toHaveBeenCalled()
  window.removeEventListener('pointerdown', activity)
})

it('discards an inactive snapshot before re-enabling a cart or private read',async()=>{
  const read=vi.fn().mockResolvedValueOnce('old commitment').mockResolvedValue('current commitment')
  const hook=renderHook(({enabled})=>useLiveQuery('re-enabled',read,{enabled}),{initialProps:{enabled:true}})
  await act(async()=>{})
  expect(hook.result.current.data).toBe('old commitment')
  hook.rerender({enabled:false})
  expect(hook.result.current.data).toBeUndefined()
  hook.rerender({enabled:true})
  expect(hook.result.current.data).toBeUndefined()
  await act(async()=>{})
  expect(hook.result.current.data).toBe('current commitment')
})
