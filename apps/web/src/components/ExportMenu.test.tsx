import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExportMenu } from './ExportMenu'

afterEach(cleanup)

it('exports the selected format once and returns focus to its disclosure', () => {
  const pdf = vi.fn()
  render(<ExportMenu exports={[{ label: 'PDF', onSelect: pdf }, { label: 'CSV', onSelect: vi.fn(), disabled: true }]} />)
  const trigger = screen.getByText('Export filtered results')
  const disclosure = trigger.closest('details')!
  disclosure.open = true
  fireEvent.click(screen.getByRole('button', { name: 'PDF' }))
  expect(pdf).toHaveBeenCalledOnce()
  expect(disclosure.open).toBe(false)
  expect(document.activeElement).toBe(trigger)
  disclosure.open = true
  fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
  expect(disclosure.open).toBe(true)
})

it('closes on Escape and blocks export while data is loading', () => {
  const exportData = vi.fn()
  const { rerender } = render(<ExportMenu exports={[{ label: 'CSV', onSelect: exportData }]} />)
  const trigger = screen.getByText('Export filtered results')
  trigger.closest('details')!.open = true
  fireEvent.keyDown(trigger, { key: 'Escape' })
  expect(trigger.closest('details')!.open).toBe(false)
  rerender(<ExportMenu disabled exports={[{ label: 'CSV', onSelect: exportData }]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Export filtered results' }))
  expect(exportData).not.toHaveBeenCalled()
})
