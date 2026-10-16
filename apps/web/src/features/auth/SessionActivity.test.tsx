import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionActivity } from './SessionActivity'
const auth = vi.hoisted(()=>({token:'token',save:vi.fn(),clear:vi.fn(),logout:vi.fn(),identity:vi.fn()}))
vi.mock('./auth-storage',()=>({getAccessToken:()=>auth.token,saveAccessToken:auth.save,clearAccessToken:auth.clear,setSessionIdentity:auth.identity}))
vi.mock('./auth-api',()=>({logout:auth.logout}))
const token=()=>`e30.${btoa(JSON.stringify({accountId:999001}))}.example`
function page(){render(<MemoryRouter initialEntries={['/student/dashboard']}><Routes><Route path="/student/dashboard" element={<><SessionActivity/><h1>Private page</h1></>}/><Route path="/login" element={<h1>Login page</h1>}/></Routes></MemoryRouter>)}
afterEach(()=>{cleanup();vi.useRealTimers();vi.resetAllMocks();vi.unstubAllGlobals()})
it('warns after nine minutes and signs out after ten despite successful background polling',async()=>{
  vi.useFakeTimers();auth.token=token();auth.logout.mockResolvedValue(undefined)
  const fetcher=vi.fn(async()=>({ok:true,status:200,json:async()=>({data:{token:'renewed'}})}));vi.stubGlobal('fetch',fetcher)
  page();await act(async()=>{})
  await act(async()=>{await vi.advanceTimersByTimeAsync(540_000)})
  expect(screen.getByRole('button',{name:'Keep me signed in'})).toBeTruthy()
  const calls=fetcher.mock.calls.length
  await act(async()=>{await vi.advanceTimersByTimeAsync(60_000)})
  expect(screen.getByRole('heading',{name:'Login page'})).toBeTruthy()
  expect(fetcher.mock.calls.length).toBe(calls)
  expect(auth.clear).toHaveBeenCalled()
})
it('exits immediately when the server rejects the session even when logout hangs',async()=>{
  vi.useFakeTimers();auth.token=token();auth.logout.mockImplementation(()=>new Promise(()=>{}))
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:401})))
  page();await act(async()=>{})
  expect(screen.getByRole('heading',{name:'Login page'})).toBeTruthy()
  expect(auth.clear).toHaveBeenCalled()
  expect(auth.save).not.toHaveBeenCalled()
})
