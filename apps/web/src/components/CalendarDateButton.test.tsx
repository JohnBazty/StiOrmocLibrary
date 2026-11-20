import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CalendarDateButton } from './CalendarDateButton'

afterEach(cleanup)

it('opens a calendar where only the allowed dates can be picked, across the allowed months', () => {
  const onChange = vi.fn()
  render(<CalendarDateButton id="pickup" label="Preferred pickup date" value="" allowed={['2026-11-24', '2026-11-25', '2026-12-01']} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: /Preferred pickup date: Choose a date/ }))
  const grid = screen.getByRole('grid', { name: 'November 2026' })
  expect(grid).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Mon, Nov 23, 2026' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Previous month' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
  expect(screen.getByRole('grid', { name: 'December 2026' })).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
  fireEvent.click(screen.getByRole('button', { name: 'Tue, Nov 24, 2026' }))
  expect(onChange).toHaveBeenCalledWith('2026-11-24')
  expect(screen.queryByRole('grid')).toBeNull()
})

it('shows the chosen date on the button and says when nothing can be picked', () => {
  const { rerender } = render(<CalendarDateButton id="pickup" label="Preferred pickup date" value="2026-11-24" allowed={['2026-11-24']} onChange={() => {}} />)
  expect(screen.getByRole('button', { name: /Tue, Nov 24, 2026/ })).toBeTruthy()
  rerender(<CalendarDateButton id="pickup" label="Preferred pickup date" value="" allowed={[]} onChange={() => {}} />)
  expect((screen.getByRole('button', { name: /No dates available/ }) as HTMLButtonElement).disabled).toBe(true)
})
