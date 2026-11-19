import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RowActions } from './RowActions'

afterEach(cleanup)

describe('RowActions', () => {
  it('starts collapsed and closes after selecting the existing action', () => {
    const select = vi.fn()
    render(<RowActions label="Actions for Chemistry"><button onClick={select}>View details</button></RowActions>)
    const trigger = screen.getByText('Actions')
    const disclosure = trigger.closest('details')!
    expect(trigger.getAttribute('aria-label')).toBe('Actions for Chemistry')
    expect(disclosure.open).toBe(false)
    fireEvent.click(trigger)
    expect(disclosure.open).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'View details' }))
    expect(select).toHaveBeenCalledTimes(1)
    expect(disclosure.open).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('preserves disabled actions and dismisses on Escape and outside interaction', () => {
    const select = vi.fn()
    render(<><RowActions label="Actions for occupied category"><button disabled onClick={select}>Delete category</button></RowActions><button>Outside</button></>)
    const trigger = screen.getByText('Actions')
    const disclosure = trigger.closest('details')!
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(select).not.toHaveBeenCalled()
    expect(disclosure.open).toBe(true)
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(disclosure.open).toBe(false)
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
    expect(disclosure.open).toBe(false)
  })
})
