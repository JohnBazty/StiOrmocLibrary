import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { UserAttendancePage } from './UserAttendancePage'

const api=vi.hoisted(()=>({myPass:vi.fn(),passImage:vi.fn(),downloadPass:vi.fn()}))
vi.mock('./attendance-api',()=>({attendanceApi:api}))
beforeEach(()=>{
 vi.stubGlobal('URL',class extends URL {static createObjectURL(){return 'blob:visit-test'} static revokeObjectURL(){}})
 api.myPass.mockResolvedValue({profile:{name:'Test visitor',schoolId:'TEST-1'},summary:{visitsThisMonth:0,todayCheckIn:null,commonPurpose:null},history:[]})
 api.passImage.mockResolvedValue(new Blob())
 api.downloadPass.mockResolvedValue(undefined)
})
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals()})
it('generates the selected visit-purpose QR and keeps permanent-pass refresh available',async()=>{
 render(<UserAttendancePage/>);await screen.findByText('Test visitor')
 expect(screen.getByRole('img',{name:'Permanent STI Library attendance QR code'})).toBeTruthy()
 fireEvent.change(screen.getByLabelText('Purpose for this visit'),{target:{value:'Book Borrowing'}})
 fireEvent.click(screen.getByRole('button',{name:'Generate purpose QR'}))
 await waitFor(()=>expect(api.passImage).toHaveBeenLastCalledWith('Book Borrowing'))
 expect(await screen.findByRole('img',{name:'STI Library purpose attendance QR code'})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Download QR code'}))
 await waitFor(()=>expect(api.downloadPass).toHaveBeenCalledWith('TEST-1','Book Borrowing'))
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}))
 expect(await screen.findByRole('img',{name:'Permanent STI Library attendance QR code'})).toBeTruthy()
})
