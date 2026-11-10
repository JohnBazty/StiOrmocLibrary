import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ClearanceScheduleEditor } from './ClearanceScheduleEditor'
const api=vi.hoisted(()=>({terms:vi.fn(),schedule:vi.fn(),saveSchedule:vi.fn()}))
vi.mock('./clearance-api',()=>({clearanceApi:api}))
beforeEach(()=>{api.terms.mockResolvedValue([{id:1,academic_year:'2026–2027',term_name:'First semester',is_active:1}]);api.schedule.mockResolvedValue({termId:1,deadlineAt:null,version:0})})
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('saves a reviewed deadline in Philippine time with its concurrency version',async()=>{
  api.saveSchedule.mockResolvedValue({termId:1,deadlineAt:'2026-12-15T09:00:00.000Z',version:1})
  render(<ClearanceScheduleEditor/>);await waitFor(()=>expect(api.schedule).toHaveBeenCalledWith(1,true))
  fireEvent.change(screen.getByLabelText('Deadline (Philippine time)'),{target:{value:'2026-12-15T17:00'}})
  fireEvent.click(screen.getByRole('button',{name:'Save deadline'}))
  expect(await screen.findByText('Clearance deadline saved for all Students in this semester.')).toBeTruthy()
  expect(api.saveSchedule).toHaveBeenCalledWith({termId:1,deadlineAt:'2026-12-15T09:00:00.000Z',version:0})
})
it('reloads the newer deadline after a conflict so the Librarian can review it',async()=>{
  api.schedule.mockResolvedValueOnce({termId:1,deadlineAt:null,version:0}).mockResolvedValue({termId:1,deadlineAt:'2026-12-20T09:00:00.000Z',version:2})
  api.saveSchedule.mockRejectedValue(Object.assign(new Error('The schedule changed.'),{code:'SCHEDULE_CHANGED'}))
  render(<ClearanceScheduleEditor/>);await waitFor(()=>expect(api.schedule).toHaveBeenCalledWith(1,true))
  fireEvent.change(screen.getByLabelText('Deadline (Philippine time)'),{target:{value:'2026-12-15T17:00'}})
  fireEvent.click(screen.getByRole('button',{name:'Save deadline'}))
  expect((await screen.findByRole('alert')).textContent).toContain('latest deadline is now shown')
  expect((screen.getByLabelText('Deadline (Philippine time)') as HTMLInputElement).value).toBe('2026-12-20T17:00')
})
