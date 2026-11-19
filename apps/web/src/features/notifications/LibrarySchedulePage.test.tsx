import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LibrarySchedulePage } from './LibrarySchedulePage'
const api = vi.hoisted(() => ({ librarySchedule: vi.fn(), saveLibrarySchedule: vi.fn() }))
vi.mock('./notification-api', () => ({ notificationApi: api }))
const schedule = { timezone: 'Asia/Manila', revision: 'a'.repeat(64), weekly: Array.from({ length: 7 }, (_, index) => ({ dayOfWeek: index + 1, isOpen: index < 6, opensAt: index < 6 ? '07:00' : null, closesAt: index < 6 ? '17:00' : null })), upcomingClosures: [{ date: '2026-12-25', reason: 'Holiday' }] }
beforeEach(() => { api.librarySchedule.mockResolvedValue(schedule); api.saveLibrarySchedule.mockResolvedValue(schedule) })
afterEach(() => { cleanup(); vi.resetAllMocks() })
async function edit() { render(<MemoryRouter><LibrarySchedulePage manage /></MemoryRouter>); fireEvent.click(await screen.findByRole('button', { name: 'Edit schedule' })) }
it('shows operating hours and closures to readers without maintenance controls', async () => {
  render(<MemoryRouter><LibrarySchedulePage /></MemoryRouter>)
  expect(await screen.findByText('Holiday')).toBeTruthy()
  expect(screen.getByText('Sunday')).toBeTruthy()
  expect(screen.getByText('Closed')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Edit schedule' })).toBeNull()
})
it('requires review before saving hours and closures with their original revision', async () => {
  await edit()
  fireEvent.change(screen.getByLabelText('Monday opens'), { target: { value: '08:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review schedule changes' }))
  expect(api.saveLibrarySchedule).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { name: 'Review library schedule' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm schedule changes' }))
  expect(await screen.findByText('Library schedule saved. All roles will see the updated hours and closures.')).toBeTruthy()
  expect(api.saveLibrarySchedule).toHaveBeenCalledWith(expect.objectContaining({ revision: schedule.revision, weekly: expect.arrayContaining([expect.objectContaining({ dayOfWeek: 1, opensAt: '08:00' })]) }))
})
it('rejects invalid hours and duplicate closure dates before saving', async () => {
  await edit()
  fireEvent.change(screen.getByLabelText('Monday closes'), { target: { value: '06:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review schedule changes' }))
  expect((await screen.findByRole('alert')).textContent).toContain('closing time after')
  fireEvent.change(screen.getByLabelText('Closure date'), { target: { value: '2026-12-25' } })
  fireEvent.change(screen.getByLabelText('Closure reason'), { target: { value: 'Duplicate' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add closure' }))
  expect((await screen.findByRole('alert')).textContent).toContain('already has a closure')
  expect(api.saveLibrarySchedule).not.toHaveBeenCalled()
})
it('keeps the entered hours after a concurrent-edit error', async () => {
  api.saveLibrarySchedule.mockRejectedValue(new Error('The library schedule changed. Refresh and review the latest schedule before saving again.'))
  await edit()
  fireEvent.change(screen.getByLabelText('Monday opens'), { target: { value: '09:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review schedule changes' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm schedule changes' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('schedule changed'))
  expect((screen.getByLabelText('Monday opens') as HTMLInputElement).value).toBe('09:00')
})

it('offers one schedule editing path without a duplicate maintenance link', async () => {
  render(<MemoryRouter><LibrarySchedulePage manage /></MemoryRouter>)
  await screen.findByRole('button',{name:'Edit schedule'})
  expect(screen.queryByRole('link',{name:'Open schedule maintenance'})).toBeNull()
})
