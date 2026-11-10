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
it('shows and downloads one permanent QR with no purpose-code generation',async()=>{
 render(<UserAttendancePage/>);await screen.findByText('Test visitor')
 expect(screen.getByRole('img',{name:'Permanent STI Library attendance QR code'})).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Generate purpose QR'})).toBeNull()
 expect(screen.queryByLabelText('Purpose for this visit')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Download QR code'}))
 await waitFor(()=>expect(api.downloadPass).toHaveBeenCalledWith('TEST-1'))
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}))
 await waitFor(()=>expect(api.passImage).toHaveBeenCalledTimes(2))
 expect(api.passImage.mock.calls.every(args=>args.length===0)).toBe(true)
})
