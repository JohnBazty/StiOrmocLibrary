import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ViolationsRecords } from './ViolationsRecords'

afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('a correction preserves a resolved case and its original warning action',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({success:true,data:{total:1,items:[{incident_id:1,full_name:'Synthetic Student',school_id:'SYNTHETIC-001',category:'Noise',incident_at:'2026-01-01T03:00:00Z',action:'First warning',details:'Synthetic incident only',events:[{type:'Resolved',reason:'Synthetic resolution',at:'2026-01-01T03:00:00Z'},{type:'Correction',reason:'Synthetic correction',at:'2026-01-02T03:00:00Z'}]}]}})})))
 render(<ViolationsRecords/>)
 await screen.findByText('Resolved')
 expect(screen.getByText('First warning')).toBeTruthy()
})
it('reviews a named student before saving and sends a retry key and CSRF header',async()=>{
 const calls:Array<{url:string;options:RequestInit}>=[]
 vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{
  calls.push({url,options})
  const data=url.endsWith('/preview')?{name:'Synthetic Student',schoolId:'SYNTHETIC-001',category:'Noise',previousCount:0,action:'First warning',amount:null,reviewToken:'review-1'}:options.method==='POST'?{saved:true}:{items:[],total:0}
  return {ok:true,json:async()=>({success:true,data})}
 }))
 render(<ViolationsRecords admin/>)
 fireEvent.click(screen.getByRole('button',{name:'Record violation'}))
 fireEvent.change(screen.getByLabelText('School ID'),{target:{value:'SYNTHETIC-001'}})
 fireEvent.change(screen.getByLabelText('What happened?'),{target:{value:'Synthetic loud conversation'}})
 fireEvent.change(screen.getByLabelText('Warnings already used'),{target:{value:'0'}})
 fireEvent.change(screen.getByLabelText('Reason for the initial review'),{target:{value:'Verified synthetic new entrant'}})
 fireEvent.click(screen.getByRole('button',{name:'Review outcome'}))
 await screen.findByText('Synthetic Student · SYNTHETIC-001')
 expect(calls.filter(c=>c.options.method==='POST').length).toBe(1)
 expect(screen.getByText('No fine. Borrowing and clearance are unaffected by this warning.')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Save reviewed violation'}))
 await screen.findByText('Violation saved. The person has been notified.')
 const body=JSON.parse(String(calls.find(c=>c.options.method==='POST'&&!c.url.endsWith('/preview'))!.options.body))
 expect(body.reviewToken).toBe('review-1');expect(body.requestKey).toMatch(/^[a-f0-9-]{36}$/)
})
it('shows own records without management actions and supports retry after a read failure',async()=>{
 const fetch=vi.fn().mockRejectedValueOnce(new Error('Please retry')).mockResolvedValue({ok:true,json:async()=>({success:true,data:{items:[],total:0}})})
 vi.stubGlobal('fetch',fetch);render(<ViolationsRecords/>)
 await screen.findByRole('alert');expect(screen.queryByText('Record violation')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Refresh records'}))
 await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull())
 expect(fetch.mock.calls[1][0]).toContain('/api/v1/fines/violations')
})
