import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StaffAnnouncementsPage } from './StaffAnnouncementsPage'
import { notificationApi } from './notification-api'

vi.mock('./notification-api', () => ({ notificationApi: {
  announcements: vi.fn(async () => []), createAnnouncement: vi.fn(async () => ({})),
} }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('lets Staff publish and refreshes announcement history after success', async () => {
  render(<StaffAnnouncementsPage />)
  await waitFor(() => expect(notificationApi.announcements).toHaveBeenCalledTimes(1))
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Library schedule' } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'The library is open today.' } })
  fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'Important' } })
  fireEvent.click(screen.getByRole('button', { name: 'Publish to all users' }))
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Announcement published to all active users.')
  expect(notificationApi.createAnnouncement).toHaveBeenCalledWith({
    title: 'Library schedule', body: 'The library is open today.', priority: 'Important', publishAt: null, expiresAt: null,
  })
  expect(notificationApi.announcements).toHaveBeenCalledTimes(2)
  expect(screen.getByLabelText('Title')).toHaveProperty('value', '')
  expect(screen.queryByText('Only a Librarian can manage announcements.')).toBeNull()
})
