import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PrintingPaperSettings } from './PrintingPaperSettings'

vi.mock('./PaperSizesDialog', () => ({ PaperSizesDialog: ({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => Promise<void> }) => <div role="dialog" aria-label="Paper sizes"><button onClick={() => void onSaved('Paper sizes saved.')}>Save sizes</button><button onClick={onClose}>Close sizes</button></div> }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('keeps Manage paper sizes available and removes Paper stock and prices', async () => {
  render(<PrintingPaperSettings />)
  expect(screen.getByRole('heading', { name: 'Paper sizes' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Paper stock and prices' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Manage paper sizes' }))
  expect(screen.getByRole('dialog', { name: 'Paper sizes' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Save sizes' }))
  expect(await screen.findByText('Paper sizes saved.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close sizes' }))
  expect(screen.queryByRole('dialog', { name: 'Paper sizes' })).toBeNull()
})
