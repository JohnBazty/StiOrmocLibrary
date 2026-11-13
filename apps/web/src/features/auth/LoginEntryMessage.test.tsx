import {cleanup,render,screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {LoginPage} from './LoginPage'
vi.mock('./auth-api',async original=>({...await original<typeof import('./auth-api')>(),deviceLoginAvailable:async()=>false,resumeDeviceSession:async()=>null}))
afterEach(()=>{cleanup();localStorage.clear()})
it('asks signed-out visitors to sign in without claiming their account is unauthorized',()=>{
 render(<MemoryRouter initialEntries={[{pathname:'/login',state:{deniedPath:'/student/library'}}]}><LoginPage/></MemoryRouter>)
 expect(screen.getByText('Sign in to continue to that page.')).toBeTruthy()
 expect(screen.queryByText(/Your account cannot open/)).toBeNull()
})
