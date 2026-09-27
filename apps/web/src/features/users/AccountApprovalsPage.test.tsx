import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AccountApprovalsPage } from './AccountApprovalsPage'

const roleRequest = {
  request_id: 7, school_id: 'STAFF-123', email: 'worker@ormoc.sti.edu.ph',
  first_name: 'Example', last_name: 'Worker', requested_role: 'Staff', created_at: '2026-09-28T00:00:00Z',
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('confirms account registration approval without an audit-reason field and sends nothing when cancelled', async () => {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/registration-requests') && !init?.method) return { ok: true, json: async () => ({ data: [roleRequest] }) }
    if (url.endsWith('/profile/avatar/submissions')) return { ok: true, json: async () => ({ data: [] }) }
    if (url.endsWith('/registration-requests/7/review')) return { ok: true, json: async () => ({}) }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<AccountApprovalsPage />)
  await screen.findByText(/Example Worker · Staff/)
  expect(screen.getByRole('heading', { name: 'Account registrations' })).toBeTruthy()
  expect(screen.queryByLabelText('Audit reason')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }))
  expect(screen.getByRole('alertdialog').textContent).toContain('Approve the Staff account for Example Worker (STAFF-123)?')
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/review'))).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/review'))).toHaveLength(0)

  fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Approve account' }))
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/review'))).toHaveLength(1))
  const reviewCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/review'))
  expect(JSON.parse(String(reviewCall?.[1]?.body))).toEqual({ decision: 'approve' })
})

it('uses the same confirmation dialog for picture rejection', async () => {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/registration-requests')) return { ok: true, json: async () => ({ data: [] }) }
    if (url.endsWith('/profile/avatar/submissions') && !init?.method) return { ok: true, json: async () => ({ data: [{ id: 3, accountId: 9, schoolId: 'STUDENT-9', name: 'Example Student', submittedAt: '2026-09-28T00:00:00Z', previewUrl: '/picture.png' }] }) }
    if (url.endsWith('/profile/avatar/submissions/3/review')) return { ok: true, json: async () => ({}) }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<AccountApprovalsPage />)
  await screen.findByText('Example Student')
  fireEvent.click(screen.getByRole('button', { name: /^Reject$/ }))
  expect(screen.getByRole('alertdialog').textContent).toContain('Reject the profile picture for Example Student (STUDENT-9)?')
  fireEvent.click(screen.getByRole('button', { name: 'Reject picture' }))
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/review'))).toHaveLength(1))
  const reviewCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/review'))
  expect(JSON.parse(String(reviewCall?.[1]?.body))).toEqual({ decision: 'reject' })
})
