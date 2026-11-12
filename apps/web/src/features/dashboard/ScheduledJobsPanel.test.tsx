import { cleanup, render, screen, within } from '@testing-library/react'

const item = async (name: string) => (await screen.findByText(name)).closest('li') as HTMLElement
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScheduledJobsPanel } from './ScheduledJobsPanel'

const api = vi.hoisted(() => ({ jobs: vi.fn() }))
vi.mock('./dashboard-api', () => ({ dashboardApi: api }))

const job = (jobName: string, health: string, extra: Record<string, unknown> = {}) => ({
  jobName, health, lastOutcome: null, lastStartedAt: null, lastSuccessAt: null, lastFailureAt: null, lastErrorCode: null, lastErrorMessage: null, runs: [], ...extra,
})

describe('Scheduled jobs panel', () => {
  it('shows each job status in words, the last success in Manila time and the last error', async () => {
    api.jobs.mockResolvedValue({ generatedAt: '2026-11-11T02:00:00.000Z', jobs: [
      job('circulation-overdue', 'healthy', { lastOutcome: 'succeeded', lastSuccessAt: '2026-11-11T01:59:30.000Z' }),
      job('notifications', 'stale'),
      job('book-request-emails', 'failed', { lastOutcome: 'failed', lastErrorMessage: 'SMTP down', lastFailureAt: '2026-11-11T01:59:00.000Z' }),
      job('future-job', 'healthy'),
    ] })
    render(<ScheduledJobsPanel />)
    const overdue = await item('Overdue loans and fines')
    expect(overdue.hasAttribute('aria-label')).toBe(false)
    expect(within(overdue).getByText('Healthy')).toBeTruthy()
    expect(within(overdue).getByText(/Nov 11, 2026.*9:59/)).toBeTruthy()
    const notices = await item('Notifications')
    expect(within(notices).getByText('Stale')).toBeTruthy()
    expect(within(notices).getByText('Never succeeded')).toBeTruthy()
    const emails = await item('Book request emails')
    expect(within(emails).getByText('Failed')).toBeTruthy()
    expect(within(emails).getByText('SMTP down')).toBeTruthy()
    expect(await item('future-job')).toBeTruthy()
    expect(screen.getByText('2 of 4 jobs need attention.')).toBeTruthy()
  })

  it('summarises how many jobs need attention', async () => {
    api.jobs.mockResolvedValue({ generatedAt: '2026-11-11T02:00:00.000Z', jobs: [job('notifications', 'stale'), job('circulation-overdue', 'failed'), job('reservation-expiration', 'healthy')] })
    render(<ScheduledJobsPanel />)
    expect(await screen.findByText('2 of 3 jobs need attention.')).toBeTruthy()
  })

  it('announces loading and uses only STI colors', async () => {
    api.jobs.mockReturnValue(new Promise(() => {}))
    const { container } = render(<ScheduledJobsPanel />)
    expect(screen.getByRole('status').textContent).toContain('Loading job status')
    // The shared SectionCard frame keeps its own dark background; only the panel's content is checked.
    expect(container.querySelector('section')!.innerHTML).not.toMatch(/#(?!003399|FFF200)[0-9a-f]{6}/i)
    expect(container.innerHTML).not.toMatch(/\/45/)
  })

  it('shows a load error inside the panel only', async () => {
    api.jobs.mockRejectedValue(new Error('Your role cannot access this resource.'))
    render(<ScheduledJobsPanel />)
    expect((await screen.findByRole('alert')).textContent).toContain('Scheduled job status could not be loaded.')
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
