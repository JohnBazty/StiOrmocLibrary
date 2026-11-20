import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TimeField12, formatTime12 } from './TimeField12'

afterEach(cleanup)

it('shows a stored time as hour, minute and AM/PM, never as a 24-hour time', () => {
  render(<TimeField12 label="Fine hours start" value="17:30" onChange={() => {}} />)
  expect((screen.getByLabelText('Fine hours start hour') as HTMLSelectElement).value).toBe('5')
  expect((screen.getByLabelText('Fine hours start minute') as HTMLSelectElement).value).toBe('30')
  expect((screen.getByLabelText('Fine hours start AM or PM') as HTMLSelectElement).value).toBe('PM')
  expect(screen.queryByText('17')).toBeNull()
  expect(formatTime12('08:05')).toBe('8:05 AM')
  expect(formatTime12('12:00')).toBe('12:00 PM')
  expect(formatTime12('00:15')).toBe('12:15 AM')
})

it('reports the chosen time and can be cleared when optional', () => {
  const onChange = vi.fn()
  render(<TimeField12 label="Borrowing opens" value="" optional onChange={onChange} />)
  fireEvent.change(screen.getByLabelText('Borrowing opens hour'), { target: { value: '12' } })
  expect(onChange).toHaveBeenLastCalledWith('00:00')
  fireEvent.change(screen.getByLabelText('Borrowing opens AM or PM'), { target: { value: 'PM' } })
  onChange.mockClear()
  render(<TimeField12 label="Return opens" value="08:00" optional onChange={onChange} />)
  fireEvent.change(screen.getByLabelText('Return opens AM or PM'), { target: { value: 'PM' } })
  expect(onChange).toHaveBeenLastCalledWith('20:00')
  fireEvent.click(screen.getByRole('button', { name: 'Clear Return opens' }))
  expect(onChange).toHaveBeenLastCalledWith('')
})
