import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CirculationReturnDialog } from './CirculationReturnDialog'

const api = vi.hoisted(() => ({ returnPreview: vi.fn(), returnCopy: vi.fn() }))
vi.mock('./desk-circulation-api', () => ({ deskCirculationApi: api }))
const preview = { kind: 'TakeHome', id: 7, barcode: 'COPY-7', title: 'Test Book', condition: 'Good', borrower: { name: 'Test Borrower', schoolId: 'TEST-7' }, dueAt: '2026-10-17T00:59:00Z', status: 'Borrowed' }
beforeEach(() => { api.returnPreview.mockResolvedValue(preview); api.returnCopy.mockResolvedValue({ title: 'Test Book', assessmentNeeded: false }) })
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('Return review dialog', () => {
  it('disables confirmation while looking up a loan, then keeps it read-only until confirmed', async () => {
    let resolve!: (value: typeof preview) => void
    api.returnPreview.mockReturnValue(new Promise(value => { resolve = value }))
    const returned = vi.fn()
    render(<CirculationReturnDialog barcode="COPY-7" onClose={() => {}} onReturned={returned} />)
    expect((screen.getByRole('button', { name: 'Confirm return' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Finding the borrower…')).toBeTruthy()
    resolve(preview)
    await screen.findByText('Test Book')
    expect(api.returnCopy).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Assessment note')).toBeNull()
    expect(returned).not.toHaveBeenCalled()
  })

  it('recovers from a failed lookup without recording a return', async () => {
    api.returnPreview.mockRejectedValueOnce(new Error('No active loan found.'))
    render(<CirculationReturnDialog barcode="COPY-7" onClose={() => {}} onReturned={() => {}} />)
    await screen.findByText('No active loan found.')
    fireEvent.click(screen.getByRole('button', { name: 'Try lookup again' }))
    await screen.findByText('Test Book')
    expect(api.returnPreview).toHaveBeenCalledTimes(2)
    expect(api.returnCopy).not.toHaveBeenCalled()
  })

  it('retains the confirmation key when retrying a failed save', async () => {
    api.returnCopy.mockRejectedValueOnce(new Error('Network interrupted')).mockResolvedValueOnce({ title: 'Test Book' })
    const returned = vi.fn()
    render(<CirculationReturnDialog barcode="COPY-7" onClose={() => {}} onReturned={returned} />)
    await screen.findByText('Test Book')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm return' }))
    await screen.findByText('Network interrupted')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm return' }))
    await waitFor(() => expect(returned).toHaveBeenCalledWith('Test Book returned.'))
    expect(api.returnCopy.mock.calls[0][1]).toBe(api.returnCopy.mock.calls[1][1])
  })

  it('prevents duplicate submissions and dismissal while a return is being saved', async () => {
    api.returnCopy.mockReturnValue(new Promise(() => {}))
    const close = vi.fn()
    render(<CirculationReturnDialog barcode="COPY-7" onClose={close} onReturned={() => {}} />)
    await screen.findByText('Test Book')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm return' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Saving return…' }))
    expect(api.returnCopy).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('includes optional condition notes only when selected', async () => {
    render(<CirculationReturnDialog barcode="COPY-7" onClose={() => {}} onReturned={() => {}} />)
    await screen.findByText('Test Book')
    fireEvent.click(screen.getByLabelText('Record damage or a condition change'))
    expect((screen.getByRole('button', { name: 'Confirm return' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'Damaged' } })
    fireEvent.change(screen.getByLabelText(/Assessment note/), { target: { value: 'Cover torn' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm return' }))
    await waitFor(() => expect(api.returnCopy).toHaveBeenCalled())
    expect(api.returnCopy.mock.calls[0].slice(2)).toEqual(['Damaged', 'Cover torn'])
  })

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    render(<CirculationReturnDialog barcode="COPY-7" onClose={() => {}} onReturned={() => {}} />)
    await screen.findByText('Test Book')
    const close = screen.getByRole('button', { name: 'Close return' })
    const confirm = screen.getByRole('button', { name: 'Confirm return' })
    confirm.focus(); fireEvent.keyDown(document, { key: 'Tab' }); expect(document.activeElement).toBe(close)
    close.focus(); fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(confirm)
  })
})
