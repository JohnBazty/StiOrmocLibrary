import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FloorPlanImagePage } from './FloorPlanImagePage'

const auth = vi.hoisted(() => ({ role: 'Student' }))
vi.mock('../auth/auth-storage', () => ({ getAccessToken: () => 'test-token', getCurrentIdentity: () => ({ role: auth.role }) }))

beforeEach(() => {
  auth.role = 'Student'
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url.includes('/location')) return new Response(JSON.stringify({ success: true, data: { title: 'Library book', shelfLabel: 'Shelf 2 A', accession: 'A-1', callNumber: '001' } }), { status: 200 })
    if (options?.method === 'POST') return new Response(JSON.stringify({ success: true, data: { imageUrl: 'https://example.test/floor.png', originalName: 'floor.png', uploadedAt: '2026-09-26T08:00:00Z', uploadedBy: 'ADMIN' } }), { status: 200 })
    return new Response(JSON.stringify({ success: true, data: null }), { status: 200 })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps the shelf label visible when no floor image has been uploaded', async () => {
  render(<MemoryRouter initialEntries={['/student/floor-plan?titleId=9&copyId=4']}><FloorPlanImagePage /></MemoryRouter>)
  expect(await screen.findByText('Shelf: Shelf 2 A')).toBeTruthy()
  expect(screen.getByText('Floor plan image not available yet.')).toBeTruthy()
  expect(screen.queryByText('Publish layout')).toBeNull()
})

it('lets a Librarian publish an image and see the published version', async () => {
  auth.role = 'Librarian'
  render(<MemoryRouter><FloorPlanImagePage /></MemoryRouter>)
  await screen.findByText('Floor plan image not available yet.')
  fireEvent.change(screen.getByLabelText('Choose image'), { target: { files: [new File(['image'], 'floor.png', { type: 'image/png' })] } })
  expect(screen.getByText('floor.png')).toBeTruthy()
  expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Publish image' }))
  await waitFor(() => expect(screen.getByAltText('Current library floor plan')).toBeTruthy())
  expect(screen.getByText('Floor plan image published. Everyone can now view it.')).toBeTruthy()
  expect(screen.getByRole('status').getAttribute('data-tone')).toBe('success')
  expect(screen.queryByRole('alert')).toBeNull()
})

it('allows removing an image before publishing and preserves a failed selection for retry', async () => {
  auth.role = 'Librarian'
  render(<MemoryRouter><FloorPlanImagePage /></MemoryRouter>)
  await screen.findByText('Floor plan image not available yet.')
  const input = screen.getByLabelText('Choose image')
  const file = new File(['image'], 'floor.png', { type: 'image/png' })
  fireEvent.change(input, { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected file' }))
  expect(screen.queryByRole('button', { name: 'Publish image' })).toBeNull()
  fireEvent.change(input, { target: { files: [file] } })
  vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 502 }))
  fireEvent.click(screen.getByRole('button', { name: 'Publish image' }))
  await screen.findByText('The library service is unavailable. Please try again.')
  expect(screen.getByRole('alert').getAttribute('data-tone')).toBe('error')
  expect(screen.getByText('floor.png')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Publish image' }).hasAttribute('disabled')).toBe(false)
})

it.each(['Student', 'Faculty', 'Staff', 'Admin'])('does not offer floor-plan uploads to %s', async role => {
  auth.role = role
  render(<MemoryRouter><FloorPlanImagePage /></MemoryRouter>)
  await screen.findByText('Floor plan image not available yet.')
  expect(screen.queryByLabelText('Choose image')).toBeNull()
})

it('handles an empty gateway response and recovers with Refresh', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 502 }))
  render(<MemoryRouter><FloorPlanImagePage /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The library service is unavailable. Please try again.')
  expect(screen.queryByText('Floor plan image not available yet.')).toBeNull()
  expect(screen.getByText('Unable to load the floor plan. Use Refresh to try again.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await screen.findByText('Floor plan image not available yet.')
  expect(screen.queryByRole('alert')).toBeNull()
})
