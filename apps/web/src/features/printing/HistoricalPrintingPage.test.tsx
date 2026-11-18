import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HistoricalPrintingPage } from './HistoricalPrintingPage'
import { operationsGet,operationsSend } from '../inventory/operations-api'
vi.mock('../inventory/operations-api',async()=>({...await vi.importActual('../inventory/operations-api'),operationsGet:vi.fn(),operationsSend:vi.fn()}))
afterEach(cleanup)
beforeEach(()=>{vi.clearAllMocks();vi.mocked(operationsGet).mockResolvedValue([])})
it('requires review of possible duplicates before saving a historical job',async()=>{
 vi.mocked(operationsSend).mockResolvedValue({input:{customerName:'QA Official Reader'},possibleDuplicates:[{entry_id:7,customer_name:'QA Reader',description:'Old job',billed:50}]})
 render(<MemoryRouter><HistoricalPrintingPage/></MemoryRouter>);await screen.findByText('No past transactions match.')
 fireEvent.click(screen.getByRole('button',{name:'Add past transaction'}));fireEvent.change(screen.getByLabelText('Customer name'),{target:{value:'QA Reader'}});fireEvent.change(screen.getByLabelText('Service date and time (Philippines)'),{target:{value:'2026-01-01T10:00'}});fireEvent.change(screen.getByLabelText('Job description'),{target:{value:'Separate old job'}});fireEvent.change(screen.getByLabelText('Amount billed (PHP)'),{target:{value:'50'}})
 fireEvent.click(screen.getByRole('button',{name:'Review entry'}));await screen.findByText('Check these similar entries first')
 const confirm=screen.getByRole('button',{name:'Confirm and save'}) as HTMLButtonElement;expect(confirm.disabled).toBe(true);expect(operationsSend).toHaveBeenCalledTimes(1)
 fireEvent.click(screen.getByRole('checkbox'));expect(confirm.disabled).toBe(false);fireEvent.click(confirm)
 await waitFor(()=>expect(operationsSend).toHaveBeenCalledWith('/printing/history',expect.objectContaining({duplicateAcknowledged:true,description:'Separate old job',customerName:'QA Official Reader'}),'POST'))
})
