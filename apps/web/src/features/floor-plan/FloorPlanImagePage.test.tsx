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

it('lets an Admin publish an image and see the published version', async () => {
  auth.role = 'Admin'
  render(<MemoryRouter><FloorPlanImagePage /></MemoryRouter>)
  await screen.findByText('Floor plan image not available yet.')
  fireEvent.change(screen.getByLabelText('Choose image'), { target: { files: [new File(['image'], 'floor.png', { type: 'image/png' })] } })
  await waitFor(() => expect(screen.getByAltText('Current library floor plan')).toBeTruthy())
  expect(screen.getByText('Floor plan image published. Everyone can now view it.')).toBeTruthy()
})
