import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {AttendanceFab} from './AttendanceFab'
vi.mock('./AttendanceScannerModal',()=>({AttendanceScannerModal:()=> <p>Attendance camera active</p>}))
vi.mock('../circulation/CirculationQuickAction',()=>({CirculationQuickAction:()=> <p>Circulation camera active</p>}))
afterEach(cleanup)
it('keeps attendance available as a quiet shortcut without restoring the archived circulation shortcut',async()=>{
 render(<MemoryRouter><AttendanceFab role="librarian"/></MemoryRouter>)
 expect(screen.queryByRole('button',{name:'Borrow or return books'})).toBeNull()
 const button=screen.getByRole('button',{name:'Scan attendance QR'})
 expect(button.className).not.toContain('bg-[#FFF200]')
 fireEvent.click(button)
 expect(screen.getByText('Attendance camera active')).toBeTruthy()
 expect(screen.queryByText('Circulation camera active')).toBeNull()
})
it.each(['student','faculty'] as const)('does not expose desk actions to %s',role=>{
 render(<MemoryRouter><AttendanceFab role={role}/></MemoryRouter>)
 expect(screen.queryByRole('button',{name:'Borrow or return books'})).toBeNull()
 expect(screen.getByRole('button',{name:'Show my attendance QR'})).toBeTruthy()
})
