import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { PublicAuthLayout } from './PublicAuthLayout'
import { LoginPage } from './LoginPage'
import { RegistrationPage } from './RegistrationPage'

vi.mock('../catalog/PublicCatalogPage', () => ({ PublicCatalogPage: ({suppressAnchorScroll}:{suppressAnchorScroll?:boolean}) => <section data-testid="catalog-background" data-suppress-scroll={suppressAnchorScroll}><p>Catalog background</p><input aria-label="Unsubmitted catalog search" defaultValue=""/><Link to="/login" state={{catalogLocation:useLocation()}}>Open login</Link></section> }))
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})
beforeEach(()=>{vi.spyOn(window,'scrollTo').mockImplementation(()=>{})})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output> }
function setup() {
  render(<MemoryRouter initialEntries={[{ pathname: '/login', search: '?catalogTitleId=42', state: { catalogLocation: { pathname: '/', search: '?q=history&categoryId=7', hash: '#catalog' } } }]}>
    <Location /><Routes><Route path="/" element={<p>Public browsing restored</p>} /><Route element={<PublicAuthLayout />}>
      <Route path="/login" element={<LoginPage popup />} /><Route path="/register" element={<RegistrationPage popup />} />
    </Route></Routes>
  </MemoryRouter>)
}
it('keeps the background still and focuses the popup field without scrolling',()=>{
 const focus=vi.spyOn(HTMLElement.prototype,'focus')
 setup()
 expect(screen.getByTestId('catalog-background').getAttribute('data-suppress-scroll')).toBe('true')
 const input=screen.getByLabelText('Student Number / Faculty ID')
 const inputFocus=focus.mock.calls.filter((_,index)=>focus.mock.instances[index]===input)
 expect(inputFocus.length).toBeGreaterThan(0)
 expect(inputFocus.every(args=>args[0]?.preventScroll===true)).toBe(true)
 expect(document.activeElement).toBe(input)
})
it('keeps the same catalog mounted when opening and closing login, with a frozen background position',()=>{
 const scroll=vi.mocked(window.scrollTo)
 vi.stubGlobal('scrollY',480);vi.stubGlobal('scrollX',0)
 render(<MemoryRouter initialEntries={['/?q=history#catalog']}><Location/><Routes><Route element={<PublicAuthLayout/>}>
  <Route path="/" element={null}/><Route path="/login" element={<LoginPage popup/>}/>
 </Route></Routes></MemoryRouter>)
 expect(screen.queryByRole('dialog')).toBeNull()
 const draft=screen.getByLabelText('Unsubmitted catalog search')
 fireEvent.change(draft,{target:{value:'Keep my browsing position'}})
 fireEvent.click(screen.getByRole('link',{name:'Open login'}))
 expect(screen.getByRole('dialog',{name:'Log In'})).toBeTruthy()
 expect(screen.getByLabelText('Unsubmitted catalog search')).toBe(draft)
 expect((draft as HTMLInputElement).value).toBe('Keep my browsing position')
 expect(document.body.style.position).toBe('fixed')
 expect(document.body.style.top).toBe('-480px')
 expect(document.documentElement.style.overflow).toBe('hidden')
 fireEvent.click(screen.getByRole('button',{name:'Close account dialog'}))
 expect(screen.queryByRole('dialog')).toBeNull()
 expect(screen.getByLabelText('Unsubmitted catalog search')).toBe(draft)
 expect(document.body.style.position).toBe('')
 expect(document.documentElement.style.overflow).toBe('')
 expect(scroll).toHaveBeenLastCalledWith({left:0,top:480,behavior:'instant'})
 expect(screen.getByTestId('location').textContent).toBe('/?q=history#catalog')
})
it('restores existing page styles and position through Strict Mode and form changes',()=>{
 document.body.style.position='relative'
 document.body.style.paddingRight='6px'
 document.documentElement.style.overflow='auto'
 vi.stubGlobal('scrollY',325);vi.stubGlobal('scrollX',0)
 try {
  render(<StrictMode><MemoryRouter initialEntries={['/login']}><Routes><Route element={<PublicAuthLayout/>}>
   <Route path="/" element={null}/><Route path="/login" element={<LoginPage popup/>}/><Route path="/register" element={<RegistrationPage popup/>}/>
  </Route></Routes></MemoryRouter></StrictMode>)
  expect(document.body.style.top).toBe('-325px')
  fireEvent.click(screen.getByRole('link',{name:'Sign Up'}))
  expect(document.body.style.top).toBe('-325px')
  fireEvent.click(screen.getByRole('button',{name:'Close account dialog'}))
  expect(document.body.style.position).toBe('relative')
  expect(document.body.style.paddingRight).toBe('6px')
  expect(document.documentElement.style.overflow).toBe('auto')
  expect(window.scrollTo).toHaveBeenLastCalledWith({left:0,top:325,behavior:'instant'})
 } finally {cleanup();document.body.style.position='';document.body.style.paddingRight='';document.documentElement.style.overflow=''}
})
it('keeps the selected book across forms and restores the prior catalog filters when closed', () => {
  setup()
  expect(screen.getByRole('dialog', { name: 'Log In' })).toBeTruthy()
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.click(screen.getByRole('link', { name: 'Sign Up' }))
  expect(screen.getByRole('dialog', { name: 'Account Registration' })).toBeTruthy()
  expect(screen.getByTestId('location').textContent).toBe('/register?catalogTitleId=42')
  fireEvent.click(screen.getByRole('button', { name: 'Close account dialog' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByTestId('location').textContent).toBe('/?q=history&categoryId=7#catalog')
  expect(document.body.style.overflow).toBe('')
})
it('Escape dismisses an idle dialog through its return-to-catalog route', () => {
  setup()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true, bubbles: true }))
  expect(screen.getByText('Public browsing restored')).toBeTruthy()
})
it('cannot dismiss or switch forms while a login request is pending', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  setup()
  fireEvent.change(screen.getByLabelText('Student Number / Faculty ID'), { target: { value: 'STUDENT-123' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'LocalTest123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
  expect((screen.getByRole('button', { name: 'Close account dialog' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('link', { name: 'Sign Up' }))
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true, bubbles: true }))
  expect(screen.getByRole('dialog', { name: 'Log In' })).toBeTruthy()
  expect(screen.getByTestId('location').textContent).toBe('/login?catalogTitleId=42')
})
