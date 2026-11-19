import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { SchoolBankForm } from './SchoolBankForm'
const api=vi.hoisted(()=>({beneficiary:vi.fn()}))
vi.mock('./money-out-api',async original=>({...await original<typeof import('./money-out-api')>(),moneyOutApi:api}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
const bankOptions=[{code:'BNORPHMM',name:'BDO Unibank'}]
function fill(){for(const [label,value]of [['School account holder name','QA SCHOOL'],['Account number','1234567890'],['Confirm account number','1234567890'],['School authorization reference','School authorization QA-123'],['Street address','School Street'],['City','Ormoc'],['Province','Leyte'],['Postal code','6541']])fireEvent.change(screen.getByLabelText(label),{target:{value}});fireEvent.change(screen.getByLabelText('Bank'),{target:{value:'BNORPHMM'}});fireEvent.click(screen.getByRole('checkbox'))}
it('validates matching numbers and reviews masked details before saving once',async()=>{
  const saved=vi.fn();api.beneficiary.mockResolvedValue({id:'bank',type:'SchoolBank'});render(<SchoolBankForm bankOptions={bankOptions} onSaved={saved} onCancel={()=>{}}/> )
  expect(screen.getByRole('button',{name:'Review bank account'})).toHaveProperty('disabled',true);fill()
  fireEvent.change(screen.getByLabelText('Confirm account number'),{target:{value:'1234567891'}});expect(screen.getByRole('alert')).toHaveProperty('textContent','Account numbers must match.')
  fireEvent.change(screen.getByLabelText('Confirm account number'),{target:{value:'1234567890'}});fireEvent.click(screen.getByRole('button',{name:'Review bank account'}))
  expect(screen.getByText('Account · •••• 7890')).toBeTruthy();expect(screen.queryByDisplayValue('1234567890')).toBeNull();expect(api.beneficiary).not.toHaveBeenCalled()
  const save=screen.getByRole('button',{name:'Save school account'});fireEvent.click(save);fireEvent.click(save);await waitFor(()=>expect(saved).toHaveBeenCalledOnce())
  expect(api.beneficiary).toHaveBeenCalledOnce();expect(api.beneficiary.mock.calls[0][0]).toMatchObject({type:'SchoolBank',confirmed:true,accountNumber:'1234567890',confirmAccountNumber:'1234567890'})
})
