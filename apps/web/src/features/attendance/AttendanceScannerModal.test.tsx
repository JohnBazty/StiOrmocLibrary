import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AttendanceScannerModal } from './AttendanceScannerModal'
const api=vi.hoisted(()=>({resolveScan:vi.fn(),scan:vi.fn()}))
vi.mock('./attendance-api',()=>({attendanceApi:api}))
vi.mock('html5-qrcode',()=>({Html5QrcodeSupportedFormats:{QR_CODE:0},Html5Qrcode:class {isScanning=false;clear=vi.fn();scanFile=async()=> 'test-qr'}}))
const visitor={name:'Test visitor',schoolId:'TEST-1',role:'Student',purpose:null}
beforeEach(()=>{vi.clearAllMocks();api.resolveScan.mockResolvedValue({visitor,openVisit:null,occupancy:{current:0,capacity:1}});api.scan.mockResolvedValue({visitor,message:'Library entry recorded.',occupancy:{current:1,capacity:1}})})
afterEach(cleanup)
async function upload(){const input=document.querySelector('input[type=file]')!;fireEvent.change(input,{target:{files:[new File(['qr'],'qr.png',{type:'image/png'})]}});expect(api.resolveScan).not.toHaveBeenCalled();fireEvent.click(await screen.findByRole('button',{name:'Read QR from image'}));await screen.findByText('Test visitor')}
it('requires a purpose for permanent QR entry and cancelling records no visit',async()=>{
 render(<AttendanceScannerModal open onClose={()=>undefined}/>);await upload()
 expect(screen.queryByRole('button',{name:'Check out'})).toBeNull()
 expect(screen.getByRole('button',{name:'Confirm entry'}).hasAttribute('disabled')).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Cancel scan'}));await waitFor(()=>expect(screen.queryByText('Test visitor')).toBeNull());expect(api.scan).not.toHaveBeenCalled()
})
it('uses the signed purpose and retains the same request ID after a failed network call',async()=>{
 api.resolveScan.mockResolvedValue({visitor:{...visitor,purpose:'Book Borrowing'},openVisit:null,occupancy:{current:0,capacity:1}})
 api.scan.mockRejectedValueOnce(new Error('Connection interrupted.'))
 render(<AttendanceScannerModal open onClose={()=>undefined}/>);await upload()
 expect(screen.getByRole('button',{name:'Borrow books'}).getAttribute('aria-pressed')).toBe('true')
 fireEvent.click(screen.getByRole('button',{name:'Confirm entry'}));await screen.findByRole('alert')
 fireEvent.click(screen.getByRole('button',{name:'Confirm entry'}));await screen.findByText('Library entry recorded.')
 expect(api.scan.mock.calls[0]).toEqual(api.scan.mock.calls[1]);expect(api.scan.mock.calls[0][1]).toBe('Book Borrowing');expect(api.scan.mock.calls[0][3]).toBe('Entry')
})
it('an open visit selects exit without a purpose prompt',async()=>{
 api.resolveScan.mockResolvedValue({visitor,openVisit:{log_id:1},occupancy:{current:1,capacity:1}})
 render(<AttendanceScannerModal open onClose={()=>undefined}/>);await upload()
 expect(screen.queryByRole('button',{name:'Borrow books'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Confirm exit'}));await waitFor(()=>expect(api.scan).toHaveBeenCalled());expect(api.scan.mock.calls[0][3]).toBe('Exit')
})
