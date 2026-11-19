import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Button,
  EmptyState,
  FormField,
  LumoDialog,
  NoticeBanner,
  PageHeader,
  StatCard,
  StatusBadge,
  TableShell,
} from './ui'

afterEach(cleanup)

describe('STI Vaadin Lumo UI primitives', () => {
  it('renders PageHeader description when provided', () => {
    render(
      <PageHeader
        eyebrow="Circulation desk"
        title="Book queue"
        description="Pull assigned copies from the shelf and mark them ready for pickup."
      />,
    )
    expect(screen.getByText('Pull assigned copies from the shelf and mark them ready for pickup.')).toBeTruthy()
  })

  it('renders StatCard note and TableShell subtitle when provided', () => {
    render(
      <>
        <StatCard label="Maximum capacity" value={80} note="38 spaces available" tone="info" />
        <TableShell title="Circulation records" subtitle="Active and overdue loans in Manila time">
          <table>
            <thead><tr><th>Book</th></tr></thead>
            <tbody><tr><td>Clean Code</td></tr></tbody>
          </table>
        </TableShell>
      </>,
    )
    expect(screen.getByText('38 spaces available')).toBeTruthy()
    expect(screen.getByText('Active and overdue loans in Manila time')).toBeTruthy()
  })

  it('maps domain statuses to distinct semantic tones with explicit icons', () => {
    const cases: Array<[string, string]> = [
      ['Overdue', 'error'],
      ['Not Cleared', 'error'],
      ['Unpaid', 'error'],
      ['Blocked', 'error'],
      ['Low stock', 'warning'],
      ['Refund pending', 'warning'],
      ['Accruing', 'warning'],
      ['Due today', 'warning'],
      ['Cleared', 'success'],
      ['In stock', 'success'],
      ['Available', 'success'],
      ['Completed', 'success'],
      ['Paid', 'success'],
      ['Active', 'info'],
      ['Scheduled', 'info'],
      ['Borrowed', 'info'],
      ['Returned', 'neutral'],
      ['Archived', 'neutral'],
      ['Cancelled', 'neutral'],
      ['Waived', 'neutral'],
    ]

    for (const [status, expectedTone] of cases) {
      cleanup()
      const { container } = render(<StatusBadge status={status} />)
      const badge = container.firstElementChild as HTMLElement
      expect(badge.getAttribute('data-tone')).toBe(expectedTone)
      expect(badge.querySelector('svg')).toBeTruthy()
      expect(badge.textContent?.toLowerCase()).toContain(status.toLowerCase())
    }
  })

  it('supports Button danger and success semantic variants', () => {
    render(
      <>
        <Button variant="danger">Delete item</Button>
        <Button variant="success">Confirm payment</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Delete item' }).getAttribute('data-variant')).toBe('danger')
    expect(screen.getByRole('button', { name: 'Confirm payment' }).getAttribute('data-variant')).toBe('success')
  })

  it('renders NoticeBanner with accessible roles and semantic data-tone', () => {
    render(
      <>
        <NoticeBanner tone="error" action={<button type="button">Retry</button>}>Could not load loans.</NoticeBanner>
        <NoticeBanner tone="success">Copy marked ready for pickup.</NoticeBanner>
        <NoticeBanner tone="warning">2 supplies are running low.</NoticeBanner>
        <NoticeBanner tone="info">Schedule changes apply next operating day.</NoticeBanner>
      </>,
    )
    expect(screen.getByRole('alert').textContent).toContain('Could not load loans.')
    const statuses = screen.getAllByRole('status')
    expect(statuses.find(el => el.getAttribute('data-tone') === 'success')?.textContent).toContain('Copy marked ready for pickup.')
    expect(statuses.find(el => el.getAttribute('data-tone') === 'warning')?.textContent).toContain('2 supplies are running low.')
    expect(statuses.find(el => el.getAttribute('data-tone') === 'info')?.textContent).toContain('Schedule changes apply next operating day.')
  })

  it('renders EmptyState with guidance and action button', () => {
    const clear = vi.fn()
    render(
      <EmptyState
        title='No loans match "BSIT".'
        description="Try another school ID or clear your active filters."
        action={<Button variant="secondary" onClick={clear}>Clear filters</Button>}
      />,
    )
    expect(screen.getByText('No loans match "BSIT".')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(clear).toHaveBeenCalledOnce()
  })

  it('links FormField label, helper text, and inline error message', () => {
    render(
      <FormField id="gcash-ref" label="GCash reference number" error="Enter the 13-digit reference number.">
        <input id="gcash-ref" aria-invalid="true" aria-describedby="gcash-ref-error" />
      </FormField>,
    )
    expect(screen.getByLabelText('GCash reference number')).toBeTruthy()
    expect(screen.getByText('Enter the 13-digit reference number.').id).toBe('gcash-ref-error')
  })

  it('closes LumoDialog on Escape when not busy', () => {
    const close = vi.fn()
    render(
      <LumoDialog title="Cancel reservation?" onClose={close} footer={<Button onClick={close}>Keep reservation</Button>}>
        <p>The copy will go to the next person waiting.</p>
      </LumoDialog>,
    )
    expect(screen.getByRole('dialog', { name: 'Cancel reservation?' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
  })
})
