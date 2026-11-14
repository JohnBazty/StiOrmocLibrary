import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminAnnouncementsPage } from './AdminAnnouncementsPage'

vi.mock('./notification-api', () => ({ notificationApi: { announcements: vi.fn(async () => []), createAnnouncement: vi.fn(async () => ({})) } }))
afterEach(() => cleanup())

it('a drafted announcement asks before leaving, and Save changes publishes it', async () => {
  const { notificationApi } = await import('./notification-api')
  render(<><a href="/librarian/dashboard" onClick={(event) => event.preventDefault()}>Dashboard</a><AdminAnnouncementsPage /></>)
  fireEvent.change(await screen.findByLabelText(/^Title/), { target: { value: 'Library closed Friday' } })
  fireEvent.change(screen.getByLabelText(/^Message/), { target: { value: 'The library is closed for inventory.' } })
  fireEvent.click(screen.getByText('Dashboard'))
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(notificationApi.createAnnouncement).toHaveBeenCalled())
  await screen.findByText(/Announcement published/)
  await new Promise((resolve) => setTimeout(resolve, 400))
  fireEvent.click(screen.getByText('Dashboard'))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})
