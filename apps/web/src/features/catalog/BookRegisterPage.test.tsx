import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BookRegisterPage } from './BookRegisterPage'

const api = vi.hoisted(() => ({ bookRegister: vi.fn(), downloadBookRegister: vi.fn() }))
vi.mock('./catalog-api', () => ({ catalogApi: api }))

const row = {
  physicalCopyId: 1, titleId: 2, accessionNumber: 'STI-ACC-2026-000001', receivedOn: '2026-11-02', classification: '005.1', authors: 'Robert C. Martin',
  title: 'Clean Code', edition: '1st ed.', volumes: '1 vol.', pages: 464, fundSource: 'Donation', fundDetail: 'Alumni', costPhp: '450.00',
  publisher: 'Prentice Hall', publicationYear: 2008, remarks: 'Donated set', availability: 'Available',
}

describe('BookRegisterPage', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
  })

  it('shows scrolling guidance only while the register overflows and updates on resize', async () => {
    let width = 1900
    let resize: ResizeObserverCallback = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback }
      observe() {}
      disconnect = disconnect
    })
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => width)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900)
    api.bookRegister.mockResolvedValue({ rows: [row], total: 1, page: 1, limit: 50 })
    const view = render(<BookRegisterPage />)
    await screen.findByText('Clean Code')
    expect(screen.getByRole('region', { name: 'Book register' }).tabIndex).toBe(0)
    expect(screen.getByText('Scroll sideways to view all columns')).toBeTruthy()
    width = 900
    act(() => resize([], {} as ResizeObserver))
    expect(screen.queryByText('Scroll sideways to view all columns')).toBeNull()
    width = 1900
    act(() => resize([], {} as ResizeObserver))
    expect(screen.getByText('Scroll sideways to view all columns')).toBeTruthy()
    view.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('shows the 13 register columns for each copy', async () => {
    api.bookRegister.mockResolvedValue({ rows: [row], total: 1, page: 1, limit: 50 })
    render(<BookRegisterPage />)
    expect(await screen.findByText('Clean Code')).toBeTruthy()
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['No.', 'Date received', 'Class', 'Author', 'Title', 'Edition', 'Volumes', 'Pages', 'Source of fund', 'Cost price', 'Publisher', 'Year', 'Remarks'])
    expect(screen.getByText('Donation: Alumni')).toBeTruthy()
    expect(screen.getByText('₱450.00')).toBeTruthy()
    expect(screen.getByText('1 copy · Page 1 of 1')).toBeTruthy()
  })

  it('sends the filters to the API and downloads the same filters as CSV', async () => {
    api.bookRegister.mockResolvedValue({ rows: [], total: 0, page: 1, limit: 50 })
    render(<BookRegisterPage />)
    await screen.findByText('No copies match these filters.')
    fireEvent.change(screen.getByLabelText(/Source of fund/i), { target: { value: 'none' } })
    fireEvent.change(screen.getByLabelText(/Sort by/i), { target: { value: 'cost' } })
    await waitFor(() => expect(String(api.bookRegister.mock.lastCall?.[0])).toBe('sort=cost&dir=asc&page=1&limit=50&noFundSource=true'))
    fireEvent.click(screen.getByRole('button', { name: /Download CSV/i }))
    await waitFor(() => expect(String(api.downloadBookRegister.mock.lastCall?.[0])).toContain('noFundSource=true'))
  })

  it('shows a load failure as an alert', async () => {
    api.bookRegister.mockRejectedValue(new Error('Server unavailable'))
    render(<BookRegisterPage />)
    expect((await screen.findByRole('alert')).textContent).toBe('Server unavailable')
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
