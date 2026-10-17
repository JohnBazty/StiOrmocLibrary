import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminCirculationMonitor } from './AdminCirculationMonitor'

const circulation = vi.hoisted(() => ({ monitor: vi.fn() }))
const desk = vi.hoisted(() => ({ uses: vi.fn(), returnPreview: vi.fn(), returnCopy: vi.fn(), checkout: vi.fn() }))
vi.mock('./circulation-api', () => ({ circulationApi: circulation }))
vi.mock('./desk-circulation-api', () => ({ deskCirculationApi: desk }))

const scroll = vi.fn()
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
const preview = { kind: 'TakeHome', id: 4, title: 'Database Systems', barcode: 'BOOK-4', condition: 'Good', borrower: { name: 'A Student', schoolId: 'STI-4' }, dueAt: '2026-10-16T00:59:00Z', status: 'Borrowed' }

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
  desk.uses.mockResolvedValue([])
  desk.returnPreview.mockResolvedValue(preview)
  desk.returnCopy.mockResolvedValue({ title: preview.title, assessmentNeeded: false })
  circulation.monitor.mockResolvedValue({
    summary: { pendingClaims: 0, activeLoans: 1, overdueLoans: 0, returnedToday: 0, dueToday: 1 },
    items: [{ transactionId: 4, userName: 'A Student', schoolId: 'STI-4', role: 'Student', title: preview.title, barcode: preview.barcode, status: 'Borrowed' }],
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

describe('Quick return from the loan list', () => {
  it('automatically looks up the selected copy and only writes after confirmation', async () => {
    render(<AdminCirculationMonitor />)
    fireEvent.click(await screen.findByRole('button', { name: 'Return book' }))
    await screen.findByRole('dialog', { name: 'Review & return' })
    await within(screen.getByRole('dialog')).findByText('A Student · STI-4')
    expect(desk.returnPreview).toHaveBeenCalledWith('BOOK-4')
    expect(desk.returnCopy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm return' }))
    await waitFor(() => expect(desk.returnCopy).toHaveBeenCalledTimes(1))
    expect(desk.returnCopy.mock.calls[0][0]).toEqual(preview)
    expect(await screen.findByText('Database Systems returned.')).toBeTruthy()
    expect(desk.checkout).not.toHaveBeenCalled()
  })

  it('allows Escape cancellation, restores focus, and performs a new lookup on reopen', async () => {
    render(<AdminCirculationMonitor />)
    const button = await screen.findByRole('button', { name: 'Return book' })
    button.focus()
    fireEvent.click(button)
    await within(screen.getByRole('dialog')).findByText('A Student · STI-4')
    const dialog = screen.getByRole('dialog')
    expect(document.activeElement).toBe(dialog)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(button)
    expect(desk.returnCopy).not.toHaveBeenCalled()
    fireEvent.click(button)
    await within(screen.getByRole('dialog')).findByText('A Student · STI-4')
    expect(desk.returnPreview).toHaveBeenCalledTimes(2)
    expect(desk.returnCopy).not.toHaveBeenCalled()
  })

  it('searches only open loans and filters without offering a return for completed records', async () => {
    const result = await circulation.monitor()
    circulation.monitor.mockResolvedValue({ ...result, items: [...result.items, { ...result.items[0], transactionId: 5, status: 'Returned', title: 'Already returned' }] })
    render(<AdminCirculationMonitor />)
    await screen.findByText('Database Systems')
    expect(screen.queryByText('Already returned')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search loans' }), { target: { value: 'missing book' } })
    expect(screen.getByText('No loans match your search.')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search loans' }), { target: { value: 'STI-4' } })
    expect(screen.getByText('Database Systems')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Overdue 0' }))
    expect(screen.queryByText('Database Systems')).toBeNull()
  })
})
