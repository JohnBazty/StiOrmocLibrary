import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UserAccountTotals } from './UserAccountTotals'
vi.mock('../auth/auth-storage',()=>({getCsrfToken:()=> 'fixture-token'}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
const totals={activeUsers:12,cleared:7,notCleared:3,unknown:2,generatedAt:'2026-11-15T00:00:00Z'}
it('loads real totals and refreshes them when the parent refreshes or changes an account',async()=>{
 const request=vi.fn().mockResolvedValueOnce(Response.json({data:totals})).mockResolvedValueOnce(Response.json({data:{...totals,activeUsers:11}}))
 vi.stubGlobal('fetch',request)
 const view=render(<UserAccountTotals refreshKey={0} accounts={null}/>)
 expect(screen.getByText('Loading account totals…')).toBeTruthy()
 expect(screen.queryByText('0')).toBeNull()
 expect(await screen.findByText('12')).toBeTruthy()
 expect(screen.getByText(/2 active students have an unknown/)).toBeTruthy()
 view.rerender(<UserAccountTotals refreshKey={1} accounts={null}/>)
 expect(await screen.findByText('11')).toBeTruthy()
 expect(request).toHaveBeenCalledTimes(2)
 expect(request).toHaveBeenCalledWith('/api/v1/admin/account-dashboard',expect.objectContaining({credentials:'include'}))
})
it('keeps a failed totals request visible and retries without inventing zero totals',async()=>{
 const request=vi.fn().mockRejectedValueOnce(new Error('Account totals unavailable')).mockResolvedValueOnce(Response.json({data:totals}))
 vi.stubGlobal('fetch',request)
 render(<UserAccountTotals refreshKey={0} accounts={null}/>)
 expect(await screen.findByRole('alert')).toBeTruthy()
 expect(screen.queryByText('0')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Retry account totals'}))
 expect(await screen.findByText('12')).toBeTruthy()
 await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull())
})
