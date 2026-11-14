import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DemoWalletCheckout } from './DemoWalletCheckout'
import type { Payment } from './payments-api'

afterEach(cleanup)
const accounts = [{ number: '09174826315', pin: '4826' }, { number: '09183957264', pin: '7104' }]
const payment = { totalCentavos: 5150, principalCentavos:5000, feeCentavos: 150 } as Payment
const props = {payment,accounts,busy:false,error:'',onPay:vi.fn(),onBack:vi.fn(),onClose:vi.fn()}
function enterNumber(){fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'9174826315'}});fireEvent.click(screen.getByRole('button',{name:'Next'}))}
it('uses assigned numbers, PIN and a separate review before submitting, without storing credentials',()=>{
 const pay=vi.fn();render(<DemoWalletCheckout {...props} onPay={pay}/>)
 fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'9123456789'}})
 fireEvent.click(screen.getByRole('button',{name:'Next'}))
 expect(screen.getByRole('alert').textContent).toContain('Enter a valid mobile number and try again.')
 expect(pay).not.toHaveBeenCalled()
 enterNumber()
 fireEvent.change(screen.getByLabelText('PIN'),{target:{value:'4826'}})
 expect(screen.getByLabelText('PIN').getAttribute('type')).toBe('password')
 fireEvent.click(screen.getByRole('button',{name:'Show PIN'}))
 expect(screen.getByLabelText('PIN').getAttribute('type')).toBe('text')
 fireEvent.click(screen.getByRole('button',{name:'Review payment'}))
 expect(screen.getByRole('heading',{name:'Confirm payment'})).toBeTruthy()
 expect(screen.queryByLabelText('PIN')).toBeNull()
 expect(pay).not.toHaveBeenCalled()
 const confirm=screen.getByRole('button',{name:'Pay ₱51.50'})
 fireEvent.click(confirm);fireEvent.click(confirm)
 expect(pay).toHaveBeenCalledTimes(1)
 expect(pay).toHaveBeenCalledWith(accounts[0].number,'4826')
 expect(screen.queryByText(/demo|test|authentication/i)).toBeNull()
})
it('retains the entered PIN and current step across tab focus changes and rejects mismatched PINs',()=>{
 render(<DemoWalletCheckout {...props}/>)
 enterNumber()
 fireEvent.change(screen.getByLabelText('PIN'),{target:{value:'482'}})
 fireEvent.focus(window);fireEvent(document,new Event('visibilitychange'))
 expect((screen.getByLabelText('PIN') as HTMLInputElement).value).toBe('482')
 fireEvent.change(screen.getByLabelText('PIN'),{target:{value:'7104'}})
 fireEvent.click(screen.getByRole('button',{name:'Review payment'}))
 expect(screen.getByRole('alert').textContent).toContain('PIN does not match')
 expect(props.onPay).not.toHaveBeenCalled()
})
it('clears the PIN when changing the number and keeps all controls disabled while opening payment',()=>{
 const view=render(<DemoWalletCheckout {...props}/>)
 enterNumber();fireEvent.change(screen.getByLabelText('PIN'),{target:{value:'4826'}})
 fireEvent.click(screen.getByRole('button',{name:'Back'}))
 enterNumber();expect((screen.getByLabelText('PIN') as HTMLInputElement).value).toBe('')
 view.rerender(<DemoWalletCheckout {...props} busy/>)
 expect(screen.getByRole('button',{name:'Opening payment…'}).hasAttribute('disabled')).toBe(true)
 expect(screen.getByLabelText('PIN').hasAttribute('disabled')).toBe(true)
})
