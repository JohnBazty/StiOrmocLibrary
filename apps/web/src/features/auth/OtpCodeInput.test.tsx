import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { OtpCodeInput } from './OtpCodeInput'

function Harness() {
  const [value, setValue] = useState('')
  return (
    <div>
      <OtpCodeInput label="Login code" value={value} onChange={setValue} />
      <output data-testid="code-value">{value}</output>
    </div>
  )
}

afterEach(() => cleanup())

it('renders 6 digit boxes, advances focus on each digit, and supports Backspace', () => {
  render(<Harness />)
  const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
  expect(boxes).toHaveLength(6)

  fireEvent.change(boxes[0], { target: { value: '4' } })
  expect(boxes[0].value).toBe('4')
  expect(document.activeElement).toBe(boxes[1])

  fireEvent.change(boxes[1], { target: { value: 'a' } })
  expect(screen.getByTestId('code-value').textContent).toBe('4')

  fireEvent.change(boxes[1], { target: { value: '9' } })
  expect(screen.getByTestId('code-value').textContent).toBe('49')
  expect(document.activeElement).toBe(boxes[2])

  fireEvent.keyDown(boxes[2], { key: 'Backspace' })
  expect(screen.getByTestId('code-value').textContent).toBe('4')
  expect(document.activeElement).toBe(boxes[1])
})

it('fills all 6 boxes when pasting a 6-digit code', () => {
  render(<Harness />)
  const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
  fireEvent.paste(boxes[0], {
    clipboardData: { getData: () => '123 456' },
  })
  expect(screen.getByTestId('code-value').textContent).toBe('123456')
  expect(boxes.map(box => box.value).join('')).toBe('123456')
  expect(document.activeElement).toBe(boxes[5])
})
