import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RefreshButton } from './RefreshButton'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('RefreshButton', () => {
  it('shows progress while the reload runs, then confirms the update', async () => {
    let finish: () => void = () => {}
    const onRefresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    render(<RefreshButton onRefresh={onRefresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onRefresh).toHaveBeenCalledOnce()
    const busy = screen.getByRole('button', { name: 'Refreshing…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    fireEvent.click(busy)
    expect(onRefresh).toHaveBeenCalledOnce()
    await act(async () => { finish() })
    expect(screen.getByRole('status').textContent).toBe('Updated')
    expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('confirms a synchronous refresh and clears the confirmation after a moment', async () => {
    vi.useFakeTimers()
    render(<RefreshButton label="Refresh queue" onRefresh={() => {}} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' })) })
    expect(screen.getByRole('status').textContent).toBe('Updated')
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says when the refresh failed instead of claiming success', async () => {
    render(<RefreshButton onRefresh={() => Promise.reject(new Error('offline'))} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh' })) })
    expect(screen.getByRole('status').textContent).toBe('Could not refresh. Try again.')
  })
})
