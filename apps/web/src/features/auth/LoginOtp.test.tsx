import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'
import { ThemeProvider } from '../theme/ThemeProvider'
import { getAccessToken } from './auth-storage'

const challenge = {otpRequired:true,challengeId:'00000000-0000-4000-8000-000000000001',emailHint:'te***@ormoc.sti.edu.ph',expiresIn:600,resendAfter:60}
function page() { render(<MemoryRouter initialEntries={['/login']}><ThemeProvider><Routes><Route path="/login" element={<LoginPage popup/>}/><Route path="/student/dashboard" element={<h1>Signed in dashboard</h1>}/></Routes></ThemeProvider></MemoryRouter>) }
function submit() {
  fireEvent.change(screen.getByLabelText('Student Number / Faculty ID'),{target:{value:'EXAMPLE-123'}})
  fireEvent.change(screen.getByLabelText('Password'),{target:{value:'ExamplePass123!'}})
  fireEvent.click(screen.getByRole('button',{name:'Log In'}))
}
function response(data:unknown,ok=true) {return {ok,headers:new Headers({'Content-Type':'application/json'}),json:async()=>data}}
afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals()})
it('does not save a token or enter the portal until the login code succeeds',async()=>{
  const token=`e30.${btoa(JSON.stringify({userId:999001,accountId:999001,schoolId:'EXAMPLE-123',role:'Student',exp:Math.floor(Date.now()/1000)+900}))}.example`
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>response({data:url.endsWith('/verify')?{token,user:{id:999001,role:'Student'},redirect:'/student/dashboard'}:challenge})))
  page();submit()
  const input=await screen.findByLabelText('Login code')
  expect(getAccessToken()).toBeNull()
  expect(screen.queryByRole('heading',{name:'Signed in dashboard'})).toBeNull()
  expect((screen.getByRole('button',{name:/Resend in/}) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(input,{target:{value:'123456'}})
  fireEvent.click(screen.getByRole('button',{name:'Verify and sign in'}))
  expect(await screen.findByRole('heading',{name:'Signed in dashboard'})).toBeTruthy()
  expect(getAccessToken()).toBe(token)
})
it('retains the code step on rejection and clears the password when returning to login',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/verify')?response({message:'The code is incorrect or expired.'},false):response({data:challenge})))
  page();submit()
  fireEvent.change(await screen.findByLabelText('Login code'),{target:{value:'000000'}})
  fireEvent.click(screen.getByRole('button',{name:'Verify and sign in'}))
  expect((await screen.findByRole('alert')).textContent).toContain('incorrect or expired')
  expect(getAccessToken()).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Back to login'}))
  expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
})
