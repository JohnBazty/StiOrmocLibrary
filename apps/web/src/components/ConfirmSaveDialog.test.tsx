import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmSaveDialog } from './ConfirmSaveDialog'

afterEach(cleanup)

describe('ConfirmSaveDialog', () => {
  it('supports specific Vibe-compliant title and confirm CTA while closing on Escape', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ConfirmSaveDialog
        title="Save borrowing policy changes?"
        detail="New limits apply to loans started after saving."
        confirmLabel="Save policy"
        cancelLabel="Keep editing"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )
    expect(screen.getByRole('alertdialog', { name: 'Save borrowing policy changes?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('preserves default labels for existing callers', () => {
    render(<ConfirmSaveDialog detail="Update maximum capacity to 80." onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('alertdialog', { name: 'Are you sure?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Yes, save' })).toBeTruthy()
  })
})
