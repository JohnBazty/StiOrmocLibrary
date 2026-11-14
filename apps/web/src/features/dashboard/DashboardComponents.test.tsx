import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { DashboardQrPass } from '../attendance/DashboardQrPass'
import { StaffDashboardPage } from './StaffDashboardPage'

const api = vi.hoisted(() => ({ passImage: vi.fn(), downloadPass: vi.fn() }))
vi.mock('../attendance/attendance-api', () => ({ attendanceApi: api }))
vi.mock('./WorkspaceTasks', () => ({ WorkspaceTasks: () => <section aria-label="Live workspace tasks" /> }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks() })

it('retains all Staff task destinations alongside the live workspace panel', () => {
  render(<MemoryRouter><StaffDashboardPage /></MemoryRouter>)
  expect(screen.getByRole('region', { name: 'Live workspace tasks' })).toBeTruthy()
  for (const [label, destination] of [['Borrow & return', 'circulation'], ['Book requests', 'reservations'], ['Printing queue', 'printing'], ['Attendance', 'attendance'], ['Announcements', 'announcements']]) {
    expect(screen.getByRole('link', { name: new RegExp(`^${label}`) }).getAttribute('href')).toBe(`/staff/${destination}`)
  }
})

it('loads the permanent QR image and releases its temporary URL when leaving', async () => {
  let resolve!: (value: Blob) => void
  api.passImage.mockReturnValue(new Promise<Blob>(done => { resolve = done }))
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-qr-fixture')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const view = render(<DashboardQrPass />)
  expect(screen.getByRole('status').textContent).toBe('Loading QR…')
  await act(async () => { resolve(new Blob(['qr-fixture'], { type: 'image/png' })) })
  expect(screen.getByRole('img', { name: 'Your permanent library QR code' }).getAttribute('src')).toBe('blob:local-qr-fixture')
  expect(screen.queryByRole('status')).toBeNull()
  view.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:local-qr-fixture')
})

it('keeps the attendance recovery instruction when QR loading fails', async () => {
  api.passImage.mockRejectedValue(new Error('Offline'))
  render(<DashboardQrPass />)
  expect((await screen.findByRole('alert')).textContent).toBe('Your QR could not be loaded. Open QR attendance to try again.')
  expect(screen.queryByRole('img')).toBeNull()
})

it('opens a readable QR dialog, downloads the current pass and closes without changing it', async () => {
  api.passImage.mockResolvedValue(new Blob(['qr-fixture']))
  api.downloadPass.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined)
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:hero-qr')
  vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{})
  render(<DashboardQrPass variant="hero" schoolId="TEST-STUDENT"/> )
  const nativeDialog=document.querySelector('dialog')!
  // jsdom has no native dialog implementation; browser checks cover focus and Escape.
  nativeDialog.showModal=()=>nativeDialog.setAttribute('open','')
  nativeDialog.close=()=>nativeDialog.removeAttribute('open')
  expect(await screen.findByRole('img',{name:'Your permanent library QR code'})).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Open your library QR'}))
  const dialog=screen.getByRole('dialog',{name:'Your library QR'})
  expect(within(dialog).getByRole('img').getAttribute('src')).toBe('blob:hero-qr')
  fireEvent.click(within(dialog).getByRole('button',{name:'Download QR code'}))
  expect(await within(dialog).findByRole('alert')).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button',{name:'Download QR code'}))
  await act(async()=>{})
  expect(api.downloadPass).toHaveBeenCalledWith('TEST-STUDENT')
  expect(within(dialog).queryByRole('alert')).toBeNull()
  fireEvent.click(within(dialog).getByRole('button',{name:'Close QR'}))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(api.passImage).toHaveBeenCalledTimes(1)
})
